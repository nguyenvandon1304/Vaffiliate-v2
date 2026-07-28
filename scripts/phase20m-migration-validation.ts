import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import postgres, { type Sql } from "postgres";

import { validatePhase20mIntegrationSafety } from "./phase20m-integration-safety";

const ROLLBACK = Symbol("phase20m-validation-rollback");
const MIGRATION_NAMES = Array.from({ length: 29 }, (_, index) =>
  index.toString().padStart(4, "0"),
);

function migrationFiles(): readonly string[] {
  const directory = resolve(process.cwd(), "drizzle");
  const files = MIGRATION_NAMES.map((prefix) => {
    const matches = requireMigrationMatch(directory, prefix);
    return resolve(directory, matches);
  });
  return Object.freeze(files);
}

function requireMigrationMatch(directory: string, prefix: string): string {
  const journal = JSON.parse(
    readFileSync(resolve(directory, "meta", "_journal.json"), "utf8"),
  ) as { entries?: Array<{ tag?: string }> };
  const tag = journal.entries?.find((entry) => entry.tag?.startsWith(prefix))?.tag;
  if (!tag) throw new Error(`phase20m_missing_migration:${prefix}`);
  return `${tag}.sql`;
}

async function assertPayoutObjects(sql: Sql): Promise<void> {
  const rows = await sql<[{ table_count: number; function_count: number; view_count: number }]>`
    SELECT
      count(*) FILTER (WHERE c.relkind = 'r')::int AS table_count,
      count(*) FILTER (WHERE c.relkind = 'v')::int AS view_count,
      (
        SELECT count(*)::int
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN (
            'create_payout_request',
            'cancel_payout_request',
            'approve_payout_request',
            'reject_payout_request',
            'start_payout_processing',
            'mark_payout_review_required',
            'complete_payout_request',
            'confirm_payout_nonpayment'
          )
      ) AS function_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN (
        'payout_requests',
        'payout_request_items',
        'payout_events',
        'payout_requests_owner',
        'payout_request_items_owner',
        'payout_events_owner'
      )
  `;
  const result = rows[0];
  if (
    !result ||
    Number(result.table_count) !== 3 ||
    Number(result.view_count) !== 3 ||
    Number(result.function_count) !== 8
  ) {
    throw new Error("phase20m_migration_object_validation_failed");
  }
}

async function rollbackValidation(
  sql: Sql,
  callback: (tx: Sql) => Promise<void>,
): Promise<void> {
  try {
    await sql.begin(async (tx) => {
      await callback(tx as unknown as Sql);
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
}

async function main(): Promise<void> {
  validatePhase20mIntegrationSafety();
  const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
  if (!databaseUrl) throw new Error("phase20m_database_url_missing");
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    const files = migrationFiles();
    const payoutSql = readFileSync(files[28]!, "utf8");

    await rollbackValidation(sql, async (tx) => {
      await tx.unsafe(payoutSql);
      await assertPayoutObjects(tx);
    });
    process.stdout.write("UPGRADE_MIGRATION_RESULT=PASS\n");

    await rollbackValidation(sql, async (tx) => {
      await tx.unsafe("DROP SCHEMA public CASCADE");
      await tx.unsafe("CREATE SCHEMA public");
      await tx.unsafe("GRANT ALL ON SCHEMA public TO postgres");
      await tx.unsafe("GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role");
      for (const file of files) {
        await tx.unsafe(readFileSync(file, "utf8"));
      }
      await assertPayoutObjects(tx);
    });
    process.stdout.write("FRESH_MIGRATION_RESULT=PASS\n");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch(() => {
  process.stderr.write("phase20m_migration_validation_failed\n");
  process.exitCode = 1;
});
