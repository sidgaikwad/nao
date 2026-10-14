import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	closeInstance: vi.fn(),
	connect: vi.fn(),
}));

vi.mock('@duckdb/node-api', () => ({
	DuckDBInstance: {
		create: vi.fn(async () => ({ connect: mocks.connect, closeSync: mocks.closeInstance })),
	},
}));

import { runLocalQuery, runSqlOverQueryResults } from '../src/services/duckdb.service';

describe('DuckDB setup failures', () => {
	const originalTmpdir = process.env.TMPDIR;
	let scratchRoot: string;

	beforeEach(async () => {
		vi.clearAllMocks();
		mocks.connect.mockRejectedValue(new Error('connect failed'));
		scratchRoot = await mkdtemp(join(tmpdir(), 'nao-duckdb-cleanup-test-'));
		process.env.TMPDIR = scratchRoot;
	});

	afterEach(async () => {
		process.env.TMPDIR = originalTmpdir;
		await rm(scratchRoot, { recursive: true, force: true });
	});

	it('closes the instance and removes the workspace when a local query cannot connect', async () => {
		const query = runLocalQuery({
			sql: 'SELECT 1',
			queryResults: new Map(),
			allowedPaths: [],
			allowedDirectories: [],
		});

		await expect(query).rejects.toThrow('connect failed');
		expect(mocks.closeInstance).toHaveBeenCalledOnce();
		expect(await readdir(scratchRoot)).toEqual([]);
	});

	it('closes the instance and removes the workspace when a query over results cannot connect', async () => {
		await expect(runSqlOverQueryResults(new Map(), 'SELECT 1')).rejects.toThrow('connect failed');
		expect(mocks.closeInstance).toHaveBeenCalledOnce();
		expect(await readdir(scratchRoot)).toEqual([]);
	});
});
