import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(TEST_DIRECTORY, "../../../..");
const ADMIN_DIRECTORY = join(TEST_DIRECTORY, "..", "admin", "payouts");

const OWNER_ACTIONS_PATH = join(TEST_DIRECTORY, "actions.ts");
const OWNER_SERVER_PATH = join(TEST_DIRECTORY, "payout-owner.server.ts");
const OWNER_CORE_PATH = join(
  TEST_DIRECTORY,
  "payout-owner-entry-point-core.ts",
);
const ADMIN_ACTIONS_PATH = join(ADMIN_DIRECTORY, "actions.ts");
const ADMIN_SERVER_PATH = join(ADMIN_DIRECTORY, "payout-admin.server.ts");
const ADMIN_CORE_PATH = join(
  ADMIN_DIRECTORY,
  "payout-admin-entry-point-core.ts",
);
const ENTRY_POINT_PATH = join(
  REPOSITORY_ROOT,
  "src",
  "lib",
  "payout",
  "entry-point.ts",
);

function readSource(path: string): string {
  return readFileSync(path, "utf8");
}

function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function assertAsyncExportsOnly(source: string): void {
  assert.match(source, /^\s*["']use server["'];?\s*$/m);
  const exports = source.match(/^export\s+[a-zA-Z]+/gm) ?? [];
  assert.ok(exports.length > 0);
  for (const exported of exports) {
    assert.equal(
      exported.includes("async"),
      true,
      `use server files may export async functions only: ${exported}`,
    );
  }
}

function collectFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(path) : [path];
  });
}

test("Phase 20M.2 action modules use server and export async functions only", () => {
  assertAsyncExportsOnly(readSource(OWNER_ACTIONS_PATH));
  assertAsyncExportsOnly(readSource(ADMIN_ACTIONS_PATH));
});

test("Phase 20M.2 production entry points remain server-only", () => {
  for (const path of [
    OWNER_ACTIONS_PATH,
    OWNER_SERVER_PATH,
    ADMIN_ACTIONS_PATH,
    ADMIN_SERVER_PATH,
  ]) {
    const source = readSource(path);
    assert.match(source, /^import\s+["']server-only["'];?$/m);
    assert.equal(source.includes('"use client"'), false);
  }
  assert.ok(readSource(OWNER_SERVER_PATH).includes("unstable_rethrow"));
  assert.ok(readSource(ADMIN_SERVER_PATH).includes("unstable_rethrow"));
});

test("Phase 20M.2 creates no payout route handlers or UI modules", () => {
  const files = [
    ...collectFiles(TEST_DIRECTORY),
    ...collectFiles(ADMIN_DIRECTORY),
  ];
  assert.equal(files.some((path) => path.endsWith("route.ts")), false);
  assert.equal(
    files.some((path) => /\.(tsx|jsx|css|scss)$/.test(path)),
    false,
  );
});

test("owner boundary never imports or references privileged credentials", () => {
  const ownerSource = [
    readSource(OWNER_ACTIONS_PATH),
    readSource(OWNER_SERVER_PATH),
    readSource(OWNER_CORE_PATH),
  ].join("\n");
  for (const forbidden of [
    "SUPABASE_SERVICE_ROLE_KEY",
    "createServiceRoleClient",
    "payout-admin.repository",
    "service-role.server",
  ]) {
    assert.equal(ownerSource.includes(forbidden), false);
  }
});

test("actions call only entry-point production wiring, never repositories or Supabase", () => {
  for (const path of [OWNER_ACTIONS_PATH, ADMIN_ACTIONS_PATH]) {
    const source = readSource(path);
    for (const forbidden of [
      "@/repositories/",
      "@/lib/supabase/",
      "process.env",
      ".from(",
      ".rpc(",
    ]) {
      assert.equal(source.includes(forbidden), false);
    }
  }
});

test("privileged action surface exposes six explicit transitions only", () => {
  const actions = withoutComments(readSource(ADMIN_ACTIONS_PATH));
  for (const action of [
    "approvePayoutRequestAction",
    "rejectPayoutRequestAction",
    "startPayoutProcessingAction",
    "markPayoutReviewRequiredAction",
    "confirmPayoutPaymentAction",
    "confirmPayoutNonpaymentAction",
  ]) {
    assert.match(actions, new RegExp(`export async function ${action}\\(`));
  }
  assert.equal(/generic|transitionPayout|targetStatus|operationName/.test(actions), false);
});

test("entry-point code performs no payout money numeric conversion", () => {
  const entryPoint = withoutComments(readSource(ENTRY_POINT_PATH));
  for (const forbidden of [
    /\bNumber\s*\(/,
    /\bBigInt\s*\(/,
    /\bparseInt\s*\(/,
    /\bparseFloat\s*\(/,
  ]) {
    assert.equal(forbidden.test(entryPoint), false);
  }
});

test("public payout projections omit sensitive identifiers and account holder data", () => {
  const entryPoint = withoutComments(readSource(ENTRY_POINT_PATH));
  const publicProjectionStart = entryPoint.indexOf(
    "export interface PublicPayoutDestination",
  );
  const parserStart = entryPoint.indexOf("const PUBLIC_ERROR_BY_PAYOUT_CODE");
  const publicProjection = entryPoint.slice(publicProjectionStart, parserStart);
  for (const forbidden of [
    "accountName",
    "conversionId",
    "eventId",
    "actorId",
    "processorReference",
    "paymentReference",
    "nonpaymentReference",
    "auditJson",
  ]) {
    assert.equal(
      publicProjection.includes(forbidden),
      false,
      `public projection must omit ${forbidden}`,
    );
  }
});

test("admin core never accepts caller-controlled actor, amount, or status", () => {
  const adminCore = withoutComments(readSource(ADMIN_CORE_PATH));
  for (const forbidden of [
    "actorId:",
    "actorRole:",
    "amountVnd:",
    "targetStatus:",
    "status:",
  ]) {
    assert.equal(adminCore.includes(forbidden), false);
  }
});
