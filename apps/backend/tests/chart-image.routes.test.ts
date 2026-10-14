import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	rows: [] as { data: string }[],
}));

vi.mock('../src/db/db', () => {
	const query = {
		from: () => query,
		where: () => query,
		limit: () => query,
		execute: async () => mocks.rows,
	};
	return { db: { select: () => query } };
});

import { chartRoutes } from '../src/routes/chart';
import { HandlerError } from '../src/utils/error';

describe('GET /c/:chatId/:chartid.png', () => {
	let app: FastifyInstance;

	beforeEach(async () => {
		mocks.rows = [];
		app = Fastify();
		app.setValidatorCompiler(validatorCompiler);
		app.setSerializerCompiler(serializerCompiler);
		app.setErrorHandler((error, _request, reply) => {
			reply.status(error instanceof HandlerError ? error.code : 500).send({ message: error.message });
		});
		await app.register(chartRoutes as never, { prefix: '/c' });
		await app.ready();
	});

	afterEach(async () => {
		await app.close();
	});

	it('returns 404 for an unknown chart', async () => {
		const res = await app.inject({ method: 'GET', url: '/c/chat-1/missing.png' });

		expect(res.statusCode).toBe(404);
		expect(res.json()).toEqual({ message: 'Chart image not found' });
	});

	it('serves a stored chart as png', async () => {
		mocks.rows = [{ data: Buffer.from('png').toString('base64') }];

		const res = await app.inject({ method: 'GET', url: '/c/chat-1/chart-1.png' });

		expect(res.statusCode).toBe(200);
		expect(res.headers['content-type']).toBe('image/png');
		expect(res.rawPayload.toString()).toBe('png');
	});
});
