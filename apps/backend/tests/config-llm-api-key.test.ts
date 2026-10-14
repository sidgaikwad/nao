import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getProjectById: vi.fn(),
}));

vi.mock('../src/db/db', () => ({ db: {} }));
vi.mock('../src/utils/logger', () => ({
	logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../src/queries/project.queries', () => ({
	getProjectById: mocks.getProjectById,
}));

vi.mock('../src/queries/project-llm-config.queries', () => ({
	getProjectLlmConfigByProvider: vi.fn(async () => null),
	getProjectLlmConfigs: vi.fn(async () => []),
}));

import { resolveProviderModel } from '../src/utils/llm';

const directories: string[] = [];

function useConfig(lines: string[], envVars: Record<string, string> = {}) {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nao-config-api-key-'));
	directories.push(directory);
	fs.writeFileSync(path.join(directory, 'nao_config.yaml'), lines.join('\n'));
	mocks.getProjectById.mockResolvedValue({ path: directory, envVars });
}

const OPENROUTER_FROM_ENV = [
	'llm:',
	'  providers:',
	'  - provider: openrouter',
	`    api_key: "{{ env('MY_OPENROUTER_KEY') }}"`,
];

describe('API keys read from nao_config.yaml', () => {
	beforeEach(() => {
		vi.stubEnv('OPENROUTER_API_KEY', '');
		vi.stubEnv('MY_OPENROUTER_KEY', '');
		vi.stubEnv('AWS_BEARER_TOKEN_BEDROCK', '');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		while (directories.length > 0) {
			fs.rmSync(directories.pop() as string, { force: true, recursive: true });
		}
	});

	it('fails with a clear error when the variable holding a required key is not defined', async () => {
		useConfig(OPENROUTER_FROM_ENV);

		await expect(resolveProviderModel('project-1', 'openrouter', 'openai/gpt-5.4')).rejects.toThrow(
			'The API key for OpenRouter is not set',
		);
	});

	it('uses the key once the variable is defined for the project', async () => {
		useConfig(OPENROUTER_FROM_ENV, { MY_OPENROUTER_KEY: 'sk-or-key' });

		await expect(resolveProviderModel('project-1', 'openrouter', 'openai/gpt-5.4')).resolves.not.toBeNull();
	});

	it('lets providers whose key is optional run without one', async () => {
		useConfig(['llm:', '  providers:', '  - provider: bedrock', '    aws_region: us-east-1']);

		await expect(
			resolveProviderModel('project-1', 'bedrock', 'anthropic.claude-sonnet-4-6'),
		).resolves.not.toBeNull();
	});
});
