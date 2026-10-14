import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as EnvModule from '../src/env';

vi.mock('../src/env', async (importOriginal) => {
	const actual = await importOriginal<typeof EnvModule>();
	return { ...actual, env: { ...actual.env, DB_URI: 'sqlite::memory:' } };
});

vi.mock('../src/db/db', async () => {
	const { default: Database } = await import('better-sqlite3');
	const { drizzle } = await import('drizzle-orm/better-sqlite3');
	const { generateSQLiteDrizzleJson, generateSQLiteMigration } = await import('drizzle-kit/api');
	const sqliteSchema = await import('../src/db/sqlite-schema');

	const sqlite = new Database(':memory:');
	const statements = await generateSQLiteMigration(
		await generateSQLiteDrizzleJson({}),
		await generateSQLiteDrizzleJson(sqliteSchema),
	);
	for (const statement of statements) {
		sqlite.exec(statement);
	}

	return { db: drizzle(sqlite, { schema: sqliteSchema }) };
});

import s from '../src/db/abstractSchema';
import { db } from '../src/db/db';
import {
	claimDueJobs,
	deleteClaimedJob,
	enqueueOnceJob,
	getJobById,
	markJobFailed,
	reclaimStaleJobs,
	renewJobLease,
	rescheduleJob,
} from '../src/queries/scheduled-job.queries';

const LEASE_DURATION_MS = 10 * 60_000;

describe('scheduled job leases', () => {
	beforeEach(async () => {
		await db.delete(s.scheduledJob);
	});

	afterAll(() => {
		db.$client.close();
	});

	it('keeps a renewed job from being reclaimed while it runs', async () => {
		const jobId = await claimJob('worker-a');

		await expect(renewJobLease(jobId, 'worker-a', minutesFromNow(9))).resolves.toBe(true);

		await expect(reclaimStaleJobs(minutesFromNow(15), LEASE_DURATION_MS)).resolves.toBe(0);
		await expect(getJobById(jobId)).resolves.toMatchObject({ status: 'running', lockedBy: 'worker-a' });
	});

	it('reports a lease that was already reclaimed as lost', async () => {
		const jobId = await claimJob('worker-a');
		await reclaimStaleJobs(minutesFromNow(11), LEASE_DURATION_MS);

		await expect(renewJobLease(jobId, 'worker-a', new Date())).resolves.toBe(false);
	});

	it('ignores completion writes from a worker that lost its lease', async () => {
		const jobId = await claimJob('worker-a');
		await reclaimStaleJobs(minutesFromNow(11), LEASE_DURATION_MS);
		await claimDueJobs(new Date(), 10, 'worker-b');

		await rescheduleJob(jobId, 'worker-a', minutesFromNow(60));
		await markJobFailed(jobId, 'worker-a', 'stale failure', null);
		await deleteClaimedJob(jobId, 'worker-a');

		await expect(getJobById(jobId)).resolves.toMatchObject({
			status: 'running',
			lockedBy: 'worker-b',
			lastError: null,
		});

		await rescheduleJob(jobId, 'worker-b', minutesFromNow(60));

		await expect(getJobById(jobId)).resolves.toMatchObject({ status: 'pending', lockedBy: null });
	});
});

async function claimJob(workerId: string): Promise<string> {
	const job = await enqueueOnceJob({ name: 'automation.run', runAt: new Date(0) });
	await claimDueJobs(new Date(), 10, workerId);
	return job!.id;
}

function minutesFromNow(minutes: number): Date {
	return new Date(Date.now() + minutes * 60_000);
}
