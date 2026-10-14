/** What browsers report when a response stream is cut off: Chrome, Chrome before the body, Safari, Firefox. */
const CONNECTION_ERROR_MESSAGES = new Set([
	'network error',
	'failed to fetch',
	'load failed',
	'networkerror when attempting to fetch resource.',
]);

export const CONNECTION_LOST_MESSAGE =
	'The connection was lost before the answer finished. This can happen when the model provider is slow or rate limited. Retry to continue.';

/** Replaces the browser's bare "network error" with a message that says what happened and what to do. */
export function describeConnectionError(message: string): string | undefined {
	return CONNECTION_ERROR_MESSAGES.has(message.trim().toLowerCase()) ? CONNECTION_LOST_MESSAGE : undefined;
}
