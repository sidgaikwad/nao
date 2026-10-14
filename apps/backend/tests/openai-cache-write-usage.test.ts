import { createAzure } from '@ai-sdk/azure';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, type LanguageModel } from 'ai';
import { describe, expect, it } from 'vitest';

import { convertToTokenUsage } from '../src/utils/ai';

const responsesApiBody = {
	id: 'resp_1',
	created_at: 1_700_000_000,
	model: 'gpt-5.4',
	output: [
		{
			type: 'message',
			role: 'assistant',
			id: 'msg_1',
			content: [{ type: 'output_text', text: 'Hello', annotations: [] }],
		},
	],
	usage: {
		input_tokens: 2_000,
		input_tokens_details: { cached_tokens: 0, cache_write_tokens: 1_500 },
		output_tokens: 10,
		output_tokens_details: { reasoning_tokens: 0 },
	},
};

const respondWithCacheWrite: typeof fetch = async () =>
	new Response(JSON.stringify(responsesApiBody), { headers: { 'content-type': 'application/json' } });

describe('OpenAI cache-write token usage', () => {
	it.each<[string, LanguageModel]>([
		['openai', createOpenAI({ apiKey: 'test', fetch: respondWithCacheWrite }).responses('gpt-5.4')],
		['azure', createAzure({ apiKey: 'test', resourceName: 'test', fetch: respondWithCacheWrite })('gpt-5.4')],
	])('records the cache-write tokens reported by %s', async (_provider, model) => {
		const { usage } = await generateText({ model, prompt: 'Hi' });

		expect(convertToTokenUsage(usage)).toMatchObject({
			inputTotalTokens: 2_000,
			inputNoCacheTokens: 500,
			inputCacheReadTokens: 0,
			inputCacheWriteTokens: 1_500,
		});
	});
});
