import { APICallError, RetryError } from 'ai';

export interface LlmErrorDescription {
	code: string;
	message: string;
}

const RATE_LIMITED: LlmErrorDescription = {
	code: 'rate_limit_exceeded',
	message:
		'The model provider rate limit or quota was reached. Wait a moment, then retry. If it keeps happening, check the provider plan.',
};
const TIMED_OUT: LlmErrorDescription = {
	code: 'timeout',
	message: 'The model provider took too long to respond. Retry, or split the request into smaller steps.',
};
const UNAVAILABLE: LlmErrorDescription = {
	code: 'provider_unavailable',
	message: 'The model provider is temporarily unavailable or overloaded. Retry in a moment.',
};
const UNREACHABLE: LlmErrorDescription = {
	code: 'provider_unreachable',
	message: 'nao could not reach the model provider. Retry in a moment.',
};
const UNAUTHORIZED: LlmErrorDescription = {
	code: 'provider_auth_error',
	message: 'The model provider rejected the configured credentials. Ask an admin to check the model settings.',
};

const RATE_LIMIT_PATTERN = /rate.?limit|too many requests|throttl|quota|resource.?exhausted/i;
const TIMEOUT_CODES = new Set(['ETIMEDOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT']);

/**
 * Describes a model provider failure (rate limit, timeout, outage, rejected request) in words a chat
 * user can act on, instead of a raw SDK message. Returns null for errors that are not provider failures.
 */
export function describeLlmError(error: unknown): LlmErrorDescription | null {
	const cause = RetryError.isInstance(error) ? (error.lastError ?? error) : error;
	if (APICallError.isInstance(cause)) {
		return describeApiCallError(cause);
	}
	if (isProviderStreamError(cause)) {
		return describeProviderMessage(cause.message);
	}
	if (isTimeoutError(cause)) {
		return TIMED_OUT;
	}
	return null;
}

function describeApiCallError(error: APICallError): LlmErrorDescription {
	const { statusCode } = error;
	if (statusCode === undefined) {
		return UNREACHABLE;
	}
	if (statusCode === 429) {
		return RATE_LIMITED;
	}
	if (statusCode === 408 || statusCode === 504) {
		return TIMED_OUT;
	}
	if (statusCode === 401 || statusCode === 403) {
		return UNAUTHORIZED;
	}
	if (statusCode >= 500) {
		return UNAVAILABLE;
	}
	return describeProviderMessage(readProviderMessage(error));
}

function describeProviderMessage(providerMessage: string): LlmErrorDescription {
	if (RATE_LIMIT_PATTERN.test(providerMessage)) {
		return RATE_LIMITED;
	}
	return {
		code: 'provider_error',
		message: `The model provider returned an error: ${providerMessage}`,
	};
}

function readProviderMessage(error: APICallError): string {
	const data = asRecord(error.data);
	const nestedError = asRecord(data?.error);
	return asText(nestedError?.message) ?? asText(data?.message) ?? error.message;
}

/** Bedrock reports throttling and other failures inside the response stream as plain `{ message }` objects. */
function isProviderStreamError(error: unknown): error is { message: string } {
	return !(error instanceof Error) && asText(asRecord(error)?.message) !== undefined;
}

function isTimeoutError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}
	return error.name === 'TimeoutError' || TIMEOUT_CODES.has(asText(asRecord(error)?.code) ?? '');
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
}

function asText(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
