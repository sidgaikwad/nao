import { createHash } from 'node:crypto';

import { type LlmProvider, providerKind } from '@nao/shared/types';
import type { AssistantModelMessage, ModelMessage, ToolCallPart } from 'ai';

type AssistantContentPart = Exclude<AssistantModelMessage['content'], string>[number];

const TOOL_CALL_ID_MAX_LENGTH = 64;
const TOOL_CALL_ID_SAFE_PATTERN = /^[a-zA-Z0-9_-]+$/;
const TOOL_CALL_ID_HASH_LENGTH = 8;
const THOUGHT_SIGNATURE_SEPARATOR = '__thought__';

/**
 * Rewrites tool call ids so they satisfy the strictest provider constraints (Anthropic's `^[a-zA-Z0-9_-]+$`,
 * OpenAI's 64-char limit). Stored ids can violate them when a chat was started on a provider with request-scoped
 * ids like `functions.execute_sql:0` and later namespaced with the message id to keep them unique.
 *
 * LiteLLM carries Gemini thought signatures inside the id (`call_x__thought__<base64>`) and decodes them back on
 * the next request, so the signature is kept verbatim for OpenAI-compatible providers and dropped for the others.
 */
export function sanitizeToolCallIds(messages: ModelMessage[], provider: LlmProvider): ModelMessage[] {
	return messages.map((message) => {
		if (!Array.isArray(message.content)) {
			return message;
		}
		const content = message.content.map((part) => {
			if (!('toolCallId' in part) || typeof part.toolCallId !== 'string') {
				return part;
			}
			return { ...part, toolCallId: toProviderSafeToolCallId(part.toolCallId, provider) };
		});
		return { ...message, content } as ModelMessage;
	});
}

/**
 * Providers reject a tool call whose input is not a JSON object (Bedrock: "toolUse.input is invalid", Anthropic:
 * "input should be a valid dictionary"), which fails every later turn of the chat. An invalid call can keep its raw
 * argument text or a non-object value such as `null` or an array, so it is replaced with the object parsed from it,
 * or `{}`. The paired tool result keeps the original error, so the model still learns the call failed.
 */
export function normalizeToolCallInputs(messages: ModelMessage[]): ModelMessage[] {
	return messages.map((message) => {
		if (message.role !== 'assistant' || !Array.isArray(message.content)) {
			return message;
		}
		if (!message.content.some(hasNonObjectToolCallInput)) {
			return message;
		}
		const content = message.content.map((part) =>
			hasNonObjectToolCallInput(part) ? { ...part, input: toToolCallInputObject(part.input) } : part,
		);
		return { ...message, content };
	});
}

export function toProviderSafeToolCallId(toolCallId: string, provider: LlmProvider): string {
	const [baseId, thoughtSignature] = splitThoughtSignature(toolCallId);
	const safeBaseId = toSafeToolCallId(baseId);
	if (!thoughtSignature || !keepsThoughtSignature(provider)) {
		return safeBaseId;
	}
	return `${safeBaseId}${THOUGHT_SIGNATURE_SEPARATOR}${thoughtSignature}`;
}

function splitThoughtSignature(toolCallId: string): [string, string | undefined] {
	const separatorIndex = toolCallId.indexOf(THOUGHT_SIGNATURE_SEPARATOR);
	if (separatorIndex === -1) {
		return [toolCallId, undefined];
	}
	return [toolCallId.slice(0, separatorIndex), toolCallId.slice(separatorIndex + THOUGHT_SIGNATURE_SEPARATOR.length)];
}

function keepsThoughtSignature(provider: LlmProvider): boolean {
	return providerKind(provider) === 'openaiCompatible';
}

function toSafeToolCallId(toolCallId: string): string {
	if (TOOL_CALL_ID_SAFE_PATTERN.test(toolCallId) && toolCallId.length <= TOOL_CALL_ID_MAX_LENGTH) {
		return toolCallId;
	}
	const hash = createHash('sha1').update(toolCallId).digest('hex').slice(0, TOOL_CALL_ID_HASH_LENGTH);
	const cleaned = toolCallId
		.replace(/[^a-zA-Z0-9_-]/g, '_')
		.slice(0, TOOL_CALL_ID_MAX_LENGTH - TOOL_CALL_ID_HASH_LENGTH - 1);
	return `${cleaned}_${hash}`;
}

function hasNonObjectToolCallInput(part: AssistantContentPart): part is ToolCallPart {
	return part.type === 'tool-call' && !isPlainObject(part.input);
}

function toToolCallInputObject(input: unknown): Record<string, unknown> {
	if (typeof input !== 'string') {
		return {};
	}
	try {
		const parsed: unknown = JSON.parse(input);
		return isPlainObject(parsed) ? parsed : {};
	} catch {
		return {};
	}
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Replaces image/file parts in model messages with text placeholders.
 * Used by compaction to avoid sending binary data to the summarization LLM.
 */
export function stripImageParts(messages: ModelMessage[]): ModelMessage[] {
	return messages.map((message) => {
		if (!Array.isArray(message.content)) {
			return message;
		}

		const parts = message.content as Record<string, unknown>[];
		const hasImage = parts.some((part) => part.type === 'file' || part.type === 'image');
		if (!hasImage) {
			return message;
		}

		const strippedContent = parts.map((part) => {
			if (part.type === 'file' || part.type === 'image') {
				return { type: 'text' as const, text: '[Image]' };
			}
			return part;
		});

		return { ...message, content: strippedContent } as ModelMessage;
	});
}
