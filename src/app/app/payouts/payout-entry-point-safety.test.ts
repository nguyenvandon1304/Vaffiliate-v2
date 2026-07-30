import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  isDesktopPrimaryNavItemActive,
  primaryNavItems,
} from "@/components/app/primaryNav";

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

test("Phase 20M.3A adds owner UI without route handlers or admin UI", () => {
  const ownerFiles = collectFiles(TEST_DIRECTORY);
  const adminFiles = collectFiles(ADMIN_DIRECTORY);
  assert.equal(
    [...ownerFiles, ...adminFiles].some((path) => path.endsWith("route.ts")),
    false,
  );
  assert.equal(
    adminFiles.some((path) => /\.(tsx|jsx|css|scss)$/.test(path)),
    false,
  );
  for (const expected of [
    "page.tsx",
    "PayoutCreateForm.tsx",
    "PayoutCancelForm.tsx",
    join("[payoutRequestId]", "page.tsx"),
  ]) {
    assert.equal(
      ownerFiles.some((path) => path.endsWith(expected)),
      true,
      `missing owner payout UI module: ${expected}`,
    );
  }
});

test("owner payout UI consumes only approved reads and owner actions", () => {
  const page = readSource(join(TEST_DIRECTORY, "page.tsx"));
  const detail = readSource(
    join(TEST_DIRECTORY, "[payoutRequestId]", "page.tsx"),
  );
  const createForm = readSource(join(TEST_DIRECTORY, "PayoutCreateForm.tsx"));
  const cancelForm = readSource(join(TEST_DIRECTORY, "PayoutCancelForm.tsx"));
  const ownerUi = [page, detail, createForm, cancelForm].join("\n");

  assert.match(page, /listVerifiedOwnerPayoutAccountsAsync/);
  assert.match(page, /listOwnerPayoutRequestsAction/);
  assert.match(page, /unstable_rethrow/);
  assert.match(detail, /loadOwnerPayoutRequestAction/);
  assert.match(createForm, /createOwnerPayoutRequestAction/);
  assert.match(cancelForm, /cancelOwnerPayoutRequestAction/);
  assert.match(detail, /status === "requested"/);

  for (const forbidden of [
    "@/repositories/",
    "@/lib/supabase/",
    "@/app/app/admin/payouts",
    "payout-admin",
    "service-role",
    ".from(",
    ".rpc(",
  ]) {
    assert.equal(ownerUi.includes(forbidden), false);
  }
});

test("owner payout forms preserve the closed command shapes", () => {
  const createForm = withoutComments(
    readSource(join(TEST_DIRECTORY, "PayoutCreateForm.tsx")),
  );
  const cancelForm = withoutComments(
    readSource(join(TEST_DIRECTORY, "PayoutCancelForm.tsx")),
  );

  assert.match(createForm, /useActionState/);
  assert.match(createForm, /name="payoutAccountId"/);
  assert.match(createForm, /name="idempotencyKey"/);
  assert.doesNotMatch(createForm, /randomUUID|crypto\./);
  assert.doesNotMatch(createForm, /name="amount/);
  assert.doesNotMatch(createForm, /name="status/);

  assert.match(cancelForm, /useActionState/);
  assert.match(cancelForm, /name="payoutRequestId"/);
  assert.match(cancelForm, /name="idempotencyKey"/);
  assert.doesNotMatch(cancelForm, /randomUUID|crypto\./);
  assert.doesNotMatch(cancelForm, /name="status/);
  assert.doesNotMatch(cancelForm, /name="reason/);
});

test("owner payout pages generate idempotency keys on the server", () => {
  const page = readSource(join(TEST_DIRECTORY, "page.tsx"));
  const detail = readSource(
    join(TEST_DIRECTORY, "[payoutRequestId]", "page.tsx"),
  );
  assert.match(page, /randomUUID\(\)/);
  assert.match(detail, /randomUUID\(\)/);
});

test("owner payout UI makes no wallet, fee, minimum, or amount-input claim", () => {
  const uiFiles = collectFiles(TEST_DIRECTORY).filter(
    (path) => /\.(tsx|ts)$/.test(path) && !path.endsWith(".test.ts"),
  );
  const source = uiFiles.map(readSource).join("\n").toLowerCase();
  for (const forbidden of [
    "ví tiền",
    "wallet",
    "phí rút",
    "withdrawal fee",
    "minimum payout",
    "tối thiểu để rút",
  ]) {
    assert.equal(source.includes(forbidden), false, `forbidden payout claim: ${forbidden}`);
  }
  assert.doesNotMatch(source, /name=["']amount/);
});

test("desktop finance navigation owns the payout route tree", () => {
  const finance = primaryNavItems.find((item) => item.id === "wallet");
  assert.ok(finance);
  assert.equal(isDesktopPrimaryNavItemActive(finance, "/app/payouts"), true);
  assert.equal(
    isDesktopPrimaryNavItemActive(
      finance,
      "/app/payouts/11111111-1111-4111-8111-111111111111",
    ),
    true,
  );
});

test("existing owner surfaces link into the payout workflow", () => {
  const withdrawCard = readSource(
    join(REPOSITORY_ROOT, "src", "features", "finance", "WithdrawCard.tsx"),
  );
  const accountCard = readSource(
    join(
      REPOSITORY_ROOT,
      "src",
      "features",
      "profile",
      "PayoutAccountCard.tsx",
    ),
  );
  assert.match(withdrawCard, /href="\/app\/payouts"/);
  assert.match(accountCard, /href="\/app\/payouts"/);
});

test("owner payout money presentation avoids numeric conversion", () => {
  const ownerUiPath = join(
    REPOSITORY_ROOT,
    "src",
    "lib",
    "payout",
    "owner-ui.ts",
  );
  const ownerUi = withoutComments(readSource(ownerUiPath));
  for (const forbidden of [
    /\bNumber\s*\(/,
    /\bBigInt\s*\(/,
    /\bparseInt\s*\(/,
    /\bparseFloat\s*\(/,
  ]) {
    assert.equal(forbidden.test(ownerUi), false);
  }
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
