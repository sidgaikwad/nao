import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getProjectLlmConfigs: vi.fn(),
}));

vi.mock('../src/db/db', () => ({ db: {} }));
vi.mock('../src/utils/logger', () => ({
	logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../src/queries/project.queries', () => ({
	getProjectById: vi.fn(async () => null),
}));

vi.mock('../src/queries/project-llm-config.queries', () => ({
	getProjectLlmConfigs: mocks.getProjectLlmConfigs,
	getProjectLlmConfigByProvider: vi.fn(async () => null),
}));

import { PROVIDER_META } from '../src/agents/providers';
import { resolveProjectModelProvider } from '../src/utils/llm';

function dbConfig(provider: string, enabledModels: string[] = []) {
	return { provider, enabledModels, customModels: [], baseUrl: null };
}

function clearProviderEnv() {
	for (const { envVar, auth } of Object.values(PROVIDER_META)) {
		const envVars = [
			envVar,
			...(auth.alternativeEnvVars?.flat() ?? []),
			...(auth.extraFields ?? []).map((f) => f.envVar),
		];
		envVars.forEach((name) => vi.stubEnv(name, ''));
	}
}

describe('resolveProjectModelProvider', () => {
	beforeEach(() => {
		clearProviderEnv();
		mocks.getProjectLlmConfigs.mockResolvedValue([]);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('returns a configured provider other than Anthropic or OpenAI', async () => {
		mocks.getProjectLlmConfigs.mockResolvedValue([dbConfig('bedrock')]);

		await expect(resolveProjectModelProvider('project-1')).resolves.toBe('bedrock');
	});

	it('falls back to a provider configured through the environment', async () => {
		vi.stubEnv('GEMINI_API_KEY', 'key');

		await expect(resolveProjectModelProvider('project-1')).resolves.toBe('google');
	});

	it('prefers Anthropic, then OpenAI, over other available providers', async () => {
		mocks.getProjectLlmConfigs.mockResolvedValue([dbConfig('bedrock'), dbConfig('openai')]);
		await expect(resolveProjectModelProvider('project-1')).resolves.toBe('openai');

		vi.stubEnv('ANTHROPIC_API_KEY', 'key');
		await expect(resolveProjectModelProvider('project-1')).resolves.toBe('anthropic');
	});

	it('skips providers without a built-in model to run background tasks on', async () => {
		mocks.getProjectLlmConfigs.mockResolvedValue([dbConfig('azure', ['my-deployment'])]);

		await expect(resolveProjectModelProvider('project-1')).resolves.toBeUndefined();
	});

	it('returns nothing when no provider is available', async () => {
		await expect(resolveProjectModelProvider('project-1')).resolves.toBeUndefined();
	});
});
