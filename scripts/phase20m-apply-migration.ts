import { resolve } from "node:path";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { validatePhase20mIntegrationSafety } from "./phase20m-integration-safety";

async function main(): Promise<void> {
  validatePhase20mIntegrationSafety();
  const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
  if (!databaseUrl) throw new Error("phase20m_database_url_missing");

  const client = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    await migrate(drizzle(client), {
      migrationsFolder: resolve(process.cwd(), "drizzle"),
    });
    process.stdout.write("MIGRATION_APPLIED_TO_TEST=PASS\n");
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch(() => {
  process.stderr.write("phase20m_migration_apply_failed\n");
  process.exitCode = 1;
});
