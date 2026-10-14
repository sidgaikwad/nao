import { describe, expect, it } from 'vitest';

import { createProviderModel } from '../src/agents/providers';

function vertexBaseUrl(location: string, modelId: string, baseURL?: string): string {
	const { model } = createProviderModel(
		'vertex',
		{ apiKey: '', ...(baseURL && { baseURL }), credentials: { project: 'acme', location } },
		modelId,
	);
	return (model as unknown as { config: { baseURL: string } }).config.baseURL;
}

describe('Vertex endpoint', () => {
	it.each(['eu', 'us'])('routes Gemini models in the %s multi-region to its regional endpoint', (location) => {
		expect(vertexBaseUrl(location, 'gemini-3-flash-preview')).toBe(
			`https://aiplatform.${location}.rep.googleapis.com/v1beta1/projects/acme/locations/${location}/publishers/google`,
		);
	});

	it('routes Claude models in a multi-region to its regional endpoint', () => {
		expect(vertexBaseUrl('eu', 'claude-sonnet-4-6')).toBe(
			'https://aiplatform.eu.rep.googleapis.com/v1/projects/acme/locations/eu/publishers/anthropic/models',
		);
	});

	it('keeps the regional host for single-region locations', () => {
		expect(vertexBaseUrl('europe-west1', 'gemini-3-flash-preview')).toBe(
			'https://europe-west1-aiplatform.googleapis.com/v1beta1/projects/acme/locations/europe-west1/publishers/google',
		);
	});

	it('keeps a base URL set on the provider', () => {
		expect(vertexBaseUrl('eu', 'gemini-3-flash-preview', 'https://proxy.example.com')).toBe(
			'https://proxy.example.com',
		);
	});
});
