import type { ModelMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { normalizeToolCallInputs, sanitizeToolCallIds, toProviderSafeToolCallId } from '../src/utils/model-message';

const SAFE_PATTERN = /^[a-zA-Z0-9_-]+$/;
const NAMESPACED_ID = '3f0d9a3e-6f1a-4b8e-9d2c-1a2b3c4d5e6f:functions.get_automation_run_history:0';
const THOUGHT_SIGNATURE = `EsIHCr8HAWkUfRNYSIYIhfhBJbAiEyioV+${'a1b2c3d4/'.repeat(30)}Q==`;
const LITELLM_GEMINI_ID = `call_9f2c4e7a1b3d__thought__${THOUGHT_SIGNATURE}`;

describe('toProviderSafeToolCallId', () => {
	it('keeps provider-native ids untouched', () => {
		expect(toProviderSafeToolCallId('toolu_01A09q90qw90lq917835lq9', 'anthropic')).toBe(
			'toolu_01A09q90qw90lq917835lq9',
		);
		expect(toProviderSafeToolCallId('call_HFHTpQqWxnN7Y5Nr7L1MTGZD', 'openai')).toBe(
			'call_HFHTpQqWxnN7Y5Nr7L1MTGZD',
		);
	});

	it('replaces characters rejected by Anthropic', () => {
		const safeId = toProviderSafeToolCallId('functions.execute_sql:0', 'anthropic');
		expect(safeId).toMatch(SAFE_PATTERN);
		expect(safeId.startsWith('functions_execute_sql_0_')).toBe(true);
	});

	it('caps ids namespaced with a message id to the OpenAI limit', () => {
		expect(NAMESPACED_ID).toHaveLength(75);
		const safeId = toProviderSafeToolCallId(NAMESPACED_ID, 'openai');
		expect(safeId.length).toBeLessThanOrEqual(64);
		expect(safeId).toMatch(SAFE_PATTERN);
	});

	it('keeps distinct namespaced ids distinct after truncation', () => {
		const other = NAMESPACED_ID.replace('3f0d9a3e', '9e8d7c6b');
		expect(toProviderSafeToolCallId(NAMESPACED_ID, 'openai')).not.toBe(toProviderSafeToolCallId(other, 'openai'));
	});

	it('is deterministic', () => {
		expect(toProviderSafeToolCallId(NAMESPACED_ID, 'openai')).toBe(
			toProviderSafeToolCallId(NAMESPACED_ID, 'openai'),
		);
	});
});

describe('toProviderSafeToolCallId with LiteLLM thought signatures', () => {
	it('keeps the thought signature verbatim for OpenAI-compatible providers', () => {
		expect(toProviderSafeToolCallId(LITELLM_GEMINI_ID, 'openaiCompatible')).toBe(LITELLM_GEMINI_ID);
		expect(toProviderSafeToolCallId(LITELLM_GEMINI_ID, 'openaiCompatible/litellm')).toBe(LITELLM_GEMINI_ID);
	});

	it('only sanitizes the id in front of the thought signature', () => {
		const namespacedId = `3f0d9a3e-6f1a-4b8e-9d2c-1a2b3c4d5e6f:${LITELLM_GEMINI_ID}`;
		const safeId = toProviderSafeToolCallId(namespacedId, 'openaiCompatible');
		const [baseId, signature] = safeId.split('__thought__');

		expect(baseId).toMatch(SAFE_PATTERN);
		expect(baseId.length).toBeLessThanOrEqual(64);
		expect(signature).toBe(THOUGHT_SIGNATURE);
	});

	it('drops the thought signature for other providers', () => {
		expect(toProviderSafeToolCallId(LITELLM_GEMINI_ID, 'anthropic')).toBe('call_9f2c4e7a1b3d');
		expect(toProviderSafeToolCallId(LITELLM_GEMINI_ID, 'openai')).toBe('call_9f2c4e7a1b3d');
	});

	it('is idempotent so ids can be sanitized again for a different compaction provider', () => {
		const forAgent = toProviderSafeToolCallId(LITELLM_GEMINI_ID, 'openaiCompatible');
		expect(toProviderSafeToolCallId(forAgent, 'openaiCompatible')).toBe(forAgent);
		expect(toProviderSafeToolCallId(forAgent, 'anthropic')).toBe('call_9f2c4e7a1b3d');
	});
});

describe('sanitizeToolCallIds', () => {
	it('rewrites the call and its result with the same id', () => {
		const messages: ModelMessage[] = [
			{ role: 'user', content: 'hello' },
			{
				role: 'assistant',
				content: [
					{ type: 'tool-call', toolCallId: NAMESPACED_ID, toolName: 'get_automation_run_history', input: {} },
				],
			},
			{
				role: 'tool',
				content: [
					{
						type: 'tool-result',
						toolCallId: NAMESPACED_ID,
						toolName: 'get_automation_run_history',
						output: { type: 'json', value: { runs: [] } },
					},
				],
			},
		];

		const [user, assistant, tool] = sanitizeToolCallIds(messages, 'anthropic');
		const callId = (assistant.content[0] as { toolCallId: string }).toolCallId;
		const resultId = (tool.content[0] as { toolCallId: string }).toolCallId;

		expect(user).toEqual(messages[0]);
		expect(callId).toMatch(SAFE_PATTERN);
		expect(callId.length).toBeLessThanOrEqual(64);
		expect(resultId).toBe(callId);
	});
});

describe('normalizeToolCallInputs', () => {
	const toolCall = (input: unknown): ModelMessage => ({
		role: 'assistant',
		content: [{ type: 'tool-call', toolCallId: 'call_1', toolName: 'execute_sql', input }],
	});
	const inputOf = (message: ModelMessage) => (message.content[0] as { input: unknown }).input;

	it('keeps object inputs and untouched messages by reference', () => {
		const messages: ModelMessage[] = [{ role: 'user', content: 'hello' }, toolCall({ sql_query: 'SELECT 1' })];

		const normalized = normalizeToolCallInputs(messages);

		expect(normalized[0]).toBe(messages[0]);
		expect(normalized[1]).toBe(messages[1]);
	});

	it('parses raw argument text that holds a JSON object', () => {
		const [message] = normalizeToolCallInputs([toolCall('{"sql_query":"SELECT 1"}')]);
		expect(inputOf(message)).toEqual({ sql_query: 'SELECT 1' });
	});

	it.each([
		['unparseable text', '{"sql_query": "SELECT'],
		['an empty string', ''],
		['a JSON array string', '[1, 2]'],
		['null', null],
		['undefined', undefined],
		['an array', [{ sql_query: 'SELECT 1' }]],
		['a number', 42],
	])('replaces %s with an empty object', (_, input) => {
		const [message] = normalizeToolCallInputs([toolCall(input)]);
		expect(inputOf(message)).toEqual({});
	});

	it('leaves the other parts of the message unchanged', () => {
		const message: ModelMessage = {
			role: 'assistant',
			content: [
				{ type: 'text', text: 'Running the query' },
				{ type: 'tool-call', toolCallId: 'call_1', toolName: 'execute_sql', input: 'not json' },
			],
		};

		const [normalized] = normalizeToolCallInputs([message]);

		expect(normalized.content).toEqual([
			{ type: 'text', text: 'Running the query' },
			{ type: 'tool-call', toolCallId: 'call_1', toolName: 'execute_sql', input: {} },
		]);
	});
});
