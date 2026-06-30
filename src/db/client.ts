import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/db/schema";

function getDatabaseUrl(): string {
  const databaseUrl =
    process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required",
    );
  }

  return databaseUrl;
}

type PostgresClient =
  ReturnType<typeof postgres>;

const globalDatabase = globalThis as typeof globalThis & {
  __vaffiliatePostgresClient?:
    PostgresClient;
};

const postgresClient =
  globalDatabase.__vaffiliatePostgresClient ??
  postgres(
    getDatabaseUrl(),
    {
      max: 1,
      prepare: false,
    },
  );

if (process.env.NODE_ENV !== "production") {
  globalDatabase.__vaffiliatePostgresClient =
    postgresClient;
}

export const db = drizzle(
  postgresClient,
  {
    schema,
  },
);
