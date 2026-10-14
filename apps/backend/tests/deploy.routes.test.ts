import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	assertOrganizationCloudBillingAccess: vi.fn(),
	getProjectByOrgAndName: vi.fn(),
	post: vi.fn(),
	touchProjectUpdatedAt: vi.fn(),
	validateApiKey: vi.fn(),
}));

vi.mock('../src/handlers/context-recommendations.handler', () => ({
	ensureContextRecommendationsScheduleForNewProject: vi.fn(),
}));

vi.mock('../src/queries/project.queries', () => ({
	getProjectByOrgAndName: mocks.getProjectByOrgAndName,
	touchProjectUpdatedAt: mocks.touchProjectUpdatedAt,
}));

vi.mock('../src/services/api-key.service', () => ({
	validateApiKey: mocks.validateApiKey,
}));

vi.mock('../src/services/cloud-billing-access.service', () => ({
	assertOrganizationCloudBillingAccess: mocks.assertOrganizationCloudBillingAccess,
}));

import { deployRoutes } from '../src/routes/deploy';

describe('deploy route cloud billing access', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		mocks.validateApiKey.mockResolvedValue({ id: 'organization-id' });
		mocks.assertOrganizationCloudBillingAccess.mockRejectedValue(new Error('Cloud billing access is restricted'));
		await deployRoutes({ post: mocks.post } as never);
	});

	it('allows a restricted organization to reach project upload validation', async () => {
		const send = vi.fn();
		const status = vi.fn(() => ({ send }));
		const file = vi.fn().mockResolvedValue(undefined);

		await handler()(
			{
				headers: { authorization: 'Bearer nao_valid' },
				file,
			},
			{ status },
		);

		expect(mocks.validateApiKey).toHaveBeenCalledWith('nao_valid');
		expect(file).toHaveBeenCalledOnce();
		expect(status).toHaveBeenCalledWith(400);
		expect(send).toHaveBeenCalledWith({ error: 'No file uploaded. Send a tar.gz as multipart field "context".' });
		expect(mocks.assertOrganizationCloudBillingAccess).not.toHaveBeenCalled();
	});
});

describe('deploy route archive validation', () => {
	const tempDirs: string[] = [];

	beforeEach(async () => {
		vi.clearAllMocks();
		mocks.validateApiKey.mockResolvedValue({ id: 'organization-id' });
		await deployRoutes({ post: mocks.post } as never);
	});

	afterEach(() => {
		for (const dir of tempDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it('rejects an archive containing a symlink to a server file', async () => {
		const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nao-deploy-test-'));
		tempDirs.push(sourceDir);
		fs.writeFileSync(path.join(sourceDir, 'nao_config.yaml'), 'project_name: leak\n');
		fs.symlinkSync('/etc/passwd', path.join(sourceDir, 'passwd.txt'));
		const archive = createArchive(sourceDir);

		const send = vi.fn();
		const status = vi.fn(() => ({ send }));

		await handler()(
			{
				headers: { authorization: 'Bearer nao_valid' },
				file: vi.fn().mockResolvedValue({ file: toAsyncIterable(archive) }),
			},
			{ status },
		);

		expect(status).toHaveBeenCalledWith(400);
		expect(send).toHaveBeenCalledWith({
			error: 'Archive entry "passwd.txt" is not a regular file or directory. Symlinks and special files are not allowed.',
		});
	});

	it('rejects an archive containing a nested symlink', async () => {
		const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nao-deploy-test-'));
		tempDirs.push(sourceDir);
		fs.writeFileSync(path.join(sourceDir, 'nao_config.yaml'), 'project_name: leak\n');
		fs.mkdirSync(path.join(sourceDir, 'docs'));
		fs.symlinkSync('/etc', path.join(sourceDir, 'docs', 'etc'));
		const archive = createArchive(sourceDir);

		const send = vi.fn();
		const status = vi.fn(() => ({ send }));

		await handler()(
			{
				headers: { authorization: 'Bearer nao_valid' },
				file: vi.fn().mockResolvedValue({ file: toAsyncIterable(archive) }),
			},
			{ status },
		);

		expect(status).toHaveBeenCalledWith(400);
		expect(send).toHaveBeenCalledWith({
			error: 'Archive entry "docs/etc" is not a regular file or directory. Symlinks and special files are not allowed.',
		});
	});
});

describe('deploy route project update', () => {
	let root: string;
	let projectDir: string;

	beforeEach(async () => {
		vi.clearAllMocks();
		mocks.validateApiKey.mockResolvedValue({ id: 'organization-id' });
		await deployRoutes({ post: mocks.post } as never);

		root = fs.mkdtempSync(path.join(os.tmpdir(), 'nao-deploy-test-'));
		projectDir = path.join(root, 'project');
		fs.mkdirSync(projectDir);
		fs.writeFileSync(path.join(projectDir, 'RULES.md'), 'original');
		fs.writeFileSync(path.join(projectDir, 'stale.md'), 'stale');
	});

	afterEach(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	it('replaces the existing project directory with the uploaded context', async () => {
		mocks.getProjectByOrgAndName.mockResolvedValue({ id: 'project-id', path: projectDir });
		const archive = createContextArchive(root, { 'RULES.md': 'deployed' });
		const send = vi.fn();

		await handler()(
			{
				headers: { authorization: 'Bearer nao_valid' },
				file: vi.fn().mockResolvedValue({ file: toAsyncIterable(archive) }),
			},
			{ status: vi.fn(() => ({ send })), send },
		);

		expect(send).toHaveBeenCalledWith({ projectId: 'project-id', projectName: 'sales', status: 'updated' });
		expect(fs.readFileSync(path.join(projectDir, 'RULES.md'), 'utf-8')).toBe('deployed');
		expect(fs.existsSync(path.join(projectDir, 'stale.md'))).toBe(false);
		expect(mocks.touchProjectUpdatedAt).toHaveBeenCalledWith('project-id');
	});

	it('rejects an existing project without a path', async () => {
		mocks.getProjectByOrgAndName.mockResolvedValue({ id: 'project-id', path: null });
		const archive = createContextArchive(root, { 'RULES.md': 'deployed' });
		const send = vi.fn();
		const status = vi.fn(() => ({ send }));

		await handler()(
			{
				headers: { authorization: 'Bearer nao_valid' },
				file: vi.fn().mockResolvedValue({ file: toAsyncIterable(archive) }),
			},
			{ status, send },
		);

		expect(status).toHaveBeenCalledWith(400);
		expect(send).toHaveBeenCalledWith({ error: 'Project "sales" has no path configured' });
		expect(mocks.touchProjectUpdatedAt).not.toHaveBeenCalled();
	});
});

function createContextArchive(root: string, files: Record<string, string>): Buffer {
	const sourceDir = fs.mkdtempSync(path.join(root, 'source-'));
	fs.writeFileSync(path.join(sourceDir, 'nao_config.yaml'), 'project_name: sales\n');
	for (const [name, content] of Object.entries(files)) {
		fs.writeFileSync(path.join(sourceDir, name), content);
	}
	return createArchive(sourceDir);
}

function createArchive(sourceDir: string): Buffer {
	const archivePath = path.join(sourceDir, '..', `${path.basename(sourceDir)}.tar.gz`);
	execFileSync('tar', ['czf', archivePath, '-C', sourceDir, '.']);
	const archive = fs.readFileSync(archivePath);
	fs.rmSync(archivePath, { force: true });
	return archive;
}

async function* toAsyncIterable(buffer: Buffer): AsyncIterable<Buffer> {
	yield buffer;
}

function handler() {
	return mocks.post.mock.calls[0][1] as (
		request: {
			headers: { authorization?: string };
			file: () => Promise<{ file: AsyncIterable<Buffer> } | undefined>;
		},
		reply: {
			status: (code: number) => { send: (body: unknown) => unknown };
			send?: (body: unknown) => unknown;
		},
	) => Promise<unknown>;
}
