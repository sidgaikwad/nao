import { APICallError, RetryError } from 'ai';
import { describe, expect, it } from 'vitest';

import { describeLlmError } from '../src/utils/llm-error';
import { formatErrorMessageForUI } from '../src/utils/utils';

const apiCallError = (statusCode: number | undefined, data?: unknown, message = 'Provider failure') =>
	new APICallError({ message, url: 'https://provider.test', requestBodyValues: {}, statusCode, data });

describe('describeLlmError', () => {
	it.each([
		[429, 'rate_limit_exceeded'],
		[408, 'timeout'],
		[504, 'timeout'],
		[401, 'provider_auth_error'],
		[403, 'provider_auth_error'],
		[500, 'provider_unavailable'],
		[529, 'provider_unavailable'],
		[undefined, 'provider_unreachable'],
	])('classifies a %s response as %s', (statusCode, code) => {
		expect(describeLlmError(apiCallError(statusCode))?.code).toBe(code);
	});

	it('unwraps the last error of exhausted retries', () => {
		const error = new RetryError({
			message: 'Failed after 3 attempts.',
			reason: 'maxRetriesExceeded',
			errors: [apiCallError(500), apiCallError(429)],
		});
		expect(describeLlmError(error)?.code).toBe('rate_limit_exceeded');
	});

	it('shows the message the provider returned for a rejected request', () => {
		const bedrockError = apiCallError(
			400,
			{ message: 'The format of the value at messages.15.content.1.toolUse.input is invalid.' },
			'undefined: The format of the value at messages.15.content.1.toolUse.input is invalid.',
		);
		expect(describeLlmError(bedrockError)).toEqual({
			code: 'provider_error',
			message:
				'The model provider returned an error: The format of the value at messages.15.content.1.toolUse.input is invalid.',
		});
	});

	it('reads the nested error message of OpenAI-style payloads', () => {
		const error = apiCallError(400, { error: { message: 'Context length exceeded.' } });
		expect(describeLlmError(error)?.message).toBe('The model provider returned an error: Context length exceeded.');
	});

	it('recognizes quota errors reported with a client error status', () => {
		const error = apiCallError(400, { error: { message: 'Resource has been exhausted (e.g. check quota).' } });
		expect(describeLlmError(error)?.code).toBe('rate_limit_exceeded');
	});

	it('recognizes throttling reported inside a Bedrock response stream', () => {
		const error = { message: 'Too many requests, please wait before trying again.' };
		expect(describeLlmError(error)?.code).toBe('rate_limit_exceeded');
	});

	it('recognizes request timeouts', () => {
		const error = Object.assign(new Error('Headers Timeout Error'), { code: 'UND_ERR_HEADERS_TIMEOUT' });
		expect(describeLlmError(error)?.code).toBe('timeout');
		expect(describeLlmError(new DOMException('The operation timed out.', 'TimeoutError'))?.code).toBe('timeout');
	});

	it('ignores errors that do not come from the model provider', () => {
		expect(describeLlmError(new Error('Query blocked by an excluded column.'))).toBeNull();
		expect(describeLlmError('boom')).toBeNull();
	});
});

describe('formatErrorMessageForUI with provider errors', () => {
	it('returns a structured error the chat can show', () => {
		expect(JSON.parse(formatErrorMessageForUI(apiCallError(429)))).toEqual({
			error: {
				code: 'rate_limit_exceeded',
				message: expect.stringContaining('rate limit'),
			},
		});
	});
});
