import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { join } from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";

import { TEST_ACCOUNT_ID } from "@/lib/payout/payout.test-helpers";
import type { VerifiedPayoutAccountOption } from "@/types/payout";

import { createPayoutAccountService } from "./payout-account.service-core";

const CLIENT = {} as SupabaseClient;
const OPTIONS: readonly VerifiedPayoutAccountOption[] = [
  {
    payoutAccountId: TEST_ACCOUNT_ID,
    method: "bank",
    providerLabel: "TESTBANK",
    maskedDestination: "****3456",
    verification: "verified",
  },
];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  });
}

test("payout-account service authenticates before client and repository", async () => {
  const calls: string[] = [];
  const service = createPayoutAccountService({
    async requireUser(path) {
      calls.push(`requireUser:${path}`);
    },
    async createClient() {
      calls.push("createClient");
      return CLIENT;
    },
    repository: {
      async listVerified(client) {
        assert.equal(client, CLIENT);
        calls.push("repository.listVerified");
        return OPTIONS;
      },
    },
  });

  assert.deepEqual(await service.listVerifiedAccounts(), OPTIONS);
  assert.deepEqual(calls, [
    "requireUser:/app/payouts",
    "createClient",
    "repository.listVerified",
  ]);
});

test("unauthenticated payout-account reads fail before client construction", async () => {
  const redirect = new Error("NEXT_REDIRECT");
  let clientCreated = false;
  let repositoryCalled = false;
  const service = createPayoutAccountService({
    async requireUser() {
      throw redirect;
    },
    async createClient() {
      clientCreated = true;
      return CLIENT;
    },
    repository: {
      async listVerified() {
        repositoryCalled = true;
        return OPTIONS;
      },
    },
  });

  await assert.rejects(service.listVerifiedAccounts(), (error) => error === redirect);
  assert.equal(clientCreated, false);
  assert.equal(repositoryCalled, false);
});

test("payout-account service accepts no caller-controlled owner identity", async () => {
  let repositoryArguments: readonly unknown[] = [];
  const service = createPayoutAccountService({
    async requireUser() {},
    async createClient() {
      return CLIENT;
    },
    repository: {
      async listVerified(...args) {
        repositoryArguments = args;
        return OPTIONS;
      },
    },
  });

  await (service.listVerifiedAccounts as (input: unknown) => Promise<unknown>)({
    userId: "attacker-controlled",
    ownerId: "attacker-controlled",
  });
  assert.deepEqual(repositoryArguments, [CLIENT]);
});

test("production payout-account modules remain server-only and use owner RLS", () => {
  const repositorySource = readFileSync(
    "src/repositories/payout-account.repository.ts",
    "utf8",
  );
  const serviceSource = readFileSync(
    "src/services/payout-account.service.ts",
    "utf8",
  );
  const browserClientSource = readFileSync(
    "src/lib/supabase/client.ts",
    "utf8",
  );
  const rlsSource = readFileSync(
    "drizzle/0004_secure_payout_accounts.sql",
    "utf8",
  );

  assert.match(repositorySource, /^import "server-only";/m);
  assert.match(serviceSource, /^import "server-only";/m);
  assert.match(serviceSource, /requireUser/);
  assert.match(serviceSource, /@\/lib\/supabase\/server/);
  assert.doesNotMatch(serviceSource, /service-role/);
  assert.doesNotMatch(browserClientSource, /payout-account\.repository/);
  assert.match(rlsSource, /CREATE POLICY "payout_accounts_select_own"/);
  assert.match(rlsSource, /auth\.uid\(\)\) = user_id/);
});

test("client modules cannot import the payout-account repository or server service", () => {
  const clientFiles = sourceFiles("src").filter((path) => {
    if (!/\.(ts|tsx)$/.test(path)) return false;
    return /^\s*["']use client["'];?/m.test(readFileSync(path, "utf8"));
  });

  for (const path of clientFiles) {
    const source = readFileSync(path, "utf8");
    assert.doesNotMatch(source, /payout-account\.repository/);
    assert.doesNotMatch(source, /payout-account\.service["']/);
  }
});
