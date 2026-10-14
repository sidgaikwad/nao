import '../src/env';

import { beforeAll, describe, expect, it, vi } from 'vitest';

import s from '../src/db/abstractSchema';
import { db } from '../src/db/db';
import { listOrgMembersWithUsers } from '../src/queries/organization.queries';
import { listUsersWithProjectAccessDetails } from '../src/queries/project.queries';

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
	sqlite.pragma('foreign_keys = ON');

	return { db: drizzle(sqlite, { schema: sqliteSchema }) };
});

const ORG_ID = 'password-org';
const PROJECT_ID = 'password-project';
const PASSWORD_USER_ID = 'password-user';
const SSO_USER_ID = 'sso-user';
const LINKED_USER_ID = 'linked-user';

const EXPECTED_PASSWORD_LOGIN = {
	[PASSWORD_USER_ID]: true,
	[SSO_USER_ID]: false,
	[LINKED_USER_ID]: true,
};

describe('member password login', () => {
	beforeAll(async () => {
		await db.insert(s.organization).values({ id: ORG_ID, name: 'Password Org', slug: 'password-org' });
		await db
			.insert(s.project)
			.values({ id: PROJECT_ID, orgId: ORG_ID, name: 'Password Project', type: 'local', path: '/tmp' });
		await db.insert(s.user).values([
			{ id: PASSWORD_USER_ID, name: 'Password', email: 'password@example.com' },
			{ id: SSO_USER_ID, name: 'SSO', email: 'sso@example.com' },
			{ id: LINKED_USER_ID, name: 'Linked', email: 'linked@example.com' },
		]);
		await db
			.insert(s.account)
			.values([
				credentialAccount(PASSWORD_USER_ID),
				ssoAccount(SSO_USER_ID),
				credentialAccount(LINKED_USER_ID),
				ssoAccount(LINKED_USER_ID),
			]);
		await db.insert(s.orgMember).values([
			{ orgId: ORG_ID, userId: PASSWORD_USER_ID, role: 'admin' },
			{ orgId: ORG_ID, userId: SSO_USER_ID, role: 'user' },
			{ orgId: ORG_ID, userId: LINKED_USER_ID, role: 'user' },
		]);
		await db.insert(s.projectMember).values([
			{ projectId: PROJECT_ID, userId: PASSWORD_USER_ID, role: 'admin' },
			{ projectId: PROJECT_ID, userId: SSO_USER_ID, role: 'user' },
			{ projectId: PROJECT_ID, userId: LINKED_USER_ID, role: 'user' },
		]);
	});

	it('flags organization members who can sign in with a password', async () => {
		const members = await listOrgMembersWithUsers(ORG_ID);

		expect(hasPasswordById(members)).toEqual(EXPECTED_PASSWORD_LOGIN);
	});

	it('flags project users who can sign in with a password', async () => {
		const users = await listUsersWithProjectAccessDetails(PROJECT_ID);

		expect(hasPasswordById(users)).toEqual(EXPECTED_PASSWORD_LOGIN);
	});
});

function credentialAccount(userId: string) {
	return { id: `${userId}-credential`, accountId: userId, providerId: 'credential', userId, password: 'hashed' };
}

function ssoAccount(userId: string) {
	return { id: `${userId}-sso`, accountId: `${userId}-oidc`, providerId: 'oidc', userId };
}

function hasPasswordById(members: { id: string; hasPassword: boolean }[]): Record<string, boolean> {
	return Object.fromEntries(members.map((member) => [member.id, member.hasPassword]));
}
