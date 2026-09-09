import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

import postgres, { type Sql } from "postgres";

import { validatePhase20mIntegrationSafety } from "./phase20m-integration-safety";

const ROLLBACK = Symbol("phase20m-validation-rollback");
const MIGRATION_NAMES = Array.from({ length: 30 }, (_, index) =>
  index.toString().padStart(4, "0"),
);
const PAYOUT_MIGRATION_FILE =
  "0029_phase_20m3a2_admin_payout_read_boundary.sql";

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
            'confirm_payout_nonpayment',
            'phase20m_assert_payout_admin_actor',
            'list_payout_requests_admin',
            'get_payout_request_admin'
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
    Number(result.function_count) !== 11
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
    const payoutMigrationPath = files.find(
      (file) => basename(file) === PAYOUT_MIGRATION_FILE,
    );
    if (!payoutMigrationPath) {
      throw new Error(`phase20m_missing_migration:${PAYOUT_MIGRATION_FILE}`);
    }
    const payoutSql = readFileSync(payoutMigrationPath, "utf8");

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

const SAFE_ERROR_CODE_PATTERN = /^(?:ECONN[A-Z0-9_]+|ENOTFOUND|ETIMEDOUT|28P01|3D000|42P01|42501|P0001|phase20m_[a-z0-9_]+|phase20k_[a-z0-9_]+|PAYOUT_[A-Z0-9_]+)$/;

function safeErrorDetail(error: unknown): string {
  const value = error as { code?: unknown; message?: unknown };
  const rawCode = typeof value.code === "string" ? value.code : "";
  const code = SAFE_ERROR_CODE_PATTERN.test(rawCode) ? rawCode : "unknown";
  const rawMessage =
    typeof value.message === "string"
      ? value.message.split(/[\r\n]/, 1)[0] ?? ""
      : "";
  const message = rawMessage
    .replace(/\b(?:postgres(?:ql)?|https?):\/\/[^\s]+/gi, "<redacted-url>")
    .replace(/\b(password|passwd|token|secret|api[_-]?key)\s*[=:]\s*[^\s,;]+/gi, "$1=<redacted>")
    .slice(0, 240);
  return `code=${code}:message=${message || "unknown"}`;
}

main().catch((error: unknown) => {
  process.stderr.write(
    `phase20m_migration_validation_failed:${safeErrorDetail(error)}\n`,
  );
  process.exitCode = 1;
});
