import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../helpers/test-app.ts';

describe('database schema', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(() => ctx.close());

  it('matches the entities exactly (no un-migrated entity change)', async () => {
    const pending = await ctx.dataSource.driver.createSchemaBuilder().log();
    expect(pending.upQueries.map((query) => query.query)).toEqual([]);
  });

  it('has no pending migrations', async () => {
    expect(await ctx.dataSource.showMigrations()).toBe(false);
  });

  it('enforces the key constraints in the database itself', async () => {
    const rows: { conname: string }[] = await ctx.dataSource.query(
      `SELECT conname FROM pg_constraint WHERE conname = ANY($1) ORDER BY conname`,
      [[
        'uq_employees_work_email',
        'fk_employees_department',
        'fk_employees_manager',
        'chk_employees_employment_status',
        'chk_employees_not_own_manager',
        'uq_refresh_tokens_token_hash',
      ]],
    );
    expect(rows).toHaveLength(6);
  });
});
