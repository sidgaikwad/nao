import { execFile } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';

import yaml from 'js-yaml';

import type { App } from '../app';
import { env } from '../env';
import { ensureContextRecommendationsScheduleForNewProject } from '../handlers/context-recommendations.handler';
import * as projectQueries from '../queries/project.queries';
import { validateApiKey } from '../services/api-key.service';
import { replaceProjectDirectory } from '../utils/project-import.utils';

const execFileAsync = promisify(execFile);
const TAR_TIMEOUT_MS = 30_000;

export const deployRoutes = async (app: App) => {
	app.post('/deploy', async (request, reply) => {
		const authHeader = request.headers.authorization;
		if (!authHeader?.startsWith('Bearer ')) {
			return reply.status(401).send({ error: 'Missing or invalid Authorization header' });
		}

		const org = await validateApiKey(authHeader.slice(7));
		if (!org) {
			return reply.status(401).send({ error: 'Invalid API key' });
		}

		const file = await request.file();
		if (!file) {
			return reply.status(400).send({ error: 'No file uploaded. Send a tar.gz as multipart field "context".' });
		}

		const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'nao-deploy-'));
		const tarPath = path.join(tmpDir, 'context.tar.gz');

		try {
			await pipeline(file.file, createWriteStream(tarPath));

			const extractDir = path.join(tmpDir, 'extracted');
			await mkdir(extractDir, { recursive: true });
			await execFileAsync('tar', ['xzf', tarPath, '-C', extractDir], { timeout: TAR_TIMEOUT_MS });

			const unsupportedEntry = await findUnsupportedEntry(extractDir);
			if (unsupportedEntry) {
				return reply.status(400).send({
					error: `Archive entry "${unsupportedEntry}" is not a regular file or directory. Symlinks and special files are not allowed.`,
				});
			}

			const configContent = await readConfigFile(extractDir);
			if (configContent === null) {
				return reply.status(400).send({ error: 'nao_config.yaml not found in uploaded archive' });
			}

			const config = yaml.load(configContent) as { project_name?: string };
			const projectName = config?.project_name;
			if (!projectName) {
				return reply.status(400).send({ error: 'project_name not found in nao_config.yaml' });
			}

			const existing = await projectQueries.getProjectByOrgAndName(org.id, projectName);
			if (existing) {
				if (!existing.path) {
					return reply.status(400).send({ error: `Project "${projectName}" has no path configured` });
				}
				await replaceProjectDirectory(extractDir, existing.path);
				await projectQueries.touchProjectUpdatedAt(existing.id);
				return reply.send({ projectId: existing.id, projectName, status: 'updated' });
			}

			const projectDir = path.resolve(env.NAO_PROJECTS_DIR, crypto.randomUUID());
			await replaceProjectDirectory(extractDir, projectDir);
			const project = await projectQueries.createProject({
				name: projectName,
				type: 'local',
				path: projectDir,
				orgId: org.id,
			});
			await ensureContextRecommendationsScheduleForNewProject(project.id);

			return reply.send({ projectId: project.id, projectName, status: 'created' });
		} finally {
			await rm(tmpDir, { recursive: true, force: true });
		}
	});
};

async function findUnsupportedEntry(root: string, relativeDir = ''): Promise<string | null> {
	for (const entry of await readdir(path.join(root, relativeDir), { withFileTypes: true })) {
		const relativePath = path.join(relativeDir, entry.name);
		if (entry.isDirectory()) {
			const nested = await findUnsupportedEntry(root, relativePath);
			if (nested) {
				return nested;
			}
		} else if (!entry.isFile()) {
			return relativePath;
		}
	}
	return null;
}

async function readConfigFile(projectDir: string): Promise<string | null> {
	try {
		return await readFile(path.join(projectDir, 'nao_config.yaml'), 'utf-8');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return null;
		}
		throw error;
	}
}
