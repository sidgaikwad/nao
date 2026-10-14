import { describe, expect, it } from 'vitest';
import { findChatModel } from './chat-model';
import type { UIMessage } from '@nao/backend/chat';
import type { LlmSelectedModel } from '@nao/shared/types';

const SONNET: LlmSelectedModel = { provider: 'anthropic', modelId: 'claude-sonnet-4-5' };
const GPT: LlmSelectedModel = { provider: 'openai', modelId: 'gpt-5' };

const userMessage = (id: string): UIMessage => ({ id, role: 'user', parts: [{ type: 'text', text: 'hi' }] });
const assistantMessage = (id: string, model?: LlmSelectedModel): UIMessage => ({
	id,
	role: 'assistant',
	parts: [{ type: 'text', text: 'hello' }],
	llmProvider: model?.provider,
	llmModelId: model?.modelId,
});

describe('findChatModel', () => {
	it('returns the model of the latest assistant message', () => {
		const messages = [
			userMessage('1'),
			assistantMessage('2', GPT),
			userMessage('3'),
			assistantMessage('4', SONNET),
			userMessage('5'),
		];
		expect(findChatModel(messages, [SONNET, GPT])).toEqual(SONNET);
	});

	it('skips assistant messages without a recorded model', () => {
		const messages = [assistantMessage('1', GPT), assistantMessage('2')];
		expect(findChatModel(messages, [SONNET, GPT])).toEqual(GPT);
	});

	it('returns null when the chat model can no longer be selected', () => {
		expect(findChatModel([assistantMessage('1', GPT)], [SONNET])).toBeNull();
	});

	it('returns null while the chat or the available models are not loaded', () => {
		expect(findChatModel(undefined, [SONNET])).toBeNull();
		expect(findChatModel([assistantMessage('1', SONNET)], undefined)).toBeNull();
	});

	it('returns null for a chat without assistant messages', () => {
		expect(findChatModel([userMessage('1')], [SONNET])).toBeNull();
	});
});
