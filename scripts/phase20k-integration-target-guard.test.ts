import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  PHASE20K_ISOLATED_TARGET_ACKNOWLEDGEMENT,
  PHASE20K_NO_DAMAGED_PROJECT_ACKNOWLEDGEMENT,
  sha256SupabaseProjectRef,
  validatePhase20kIntegrationTarget,
} from "./phase20k-integration-target-guard";

const TARGET_REF = "a".repeat(20);
const DAMAGED_REF = "b".repeat(20);
const OTHER_REF = "c".repeat(20);
const TARGET_HASH = sha256SupabaseProjectRef(TARGET_REF);
const DAMAGED_HASH = sha256SupabaseProjectRef(DAMAGED_REF);

function validate(databaseUrl: string) {
  return validatePhase20kIntegrationTarget({
    databaseUrl,
    expectedTargetProjectRefSha256: TARGET_HASH,
    damagedProjectRefSha256: DAMAGED_HASH,
    acknowledgement: PHASE20K_ISOLATED_TARGET_ACKNOWLEDGEMENT,
  });
}

function directUrl(password: string, pathname = "/postgres", query = "") {
  return `postgresql://postgres:${password}@db.${TARGET_REF}.supabase.co:5432${pathname}${query}`;
}

function assertRejected(
  databaseUrl: string,
  reason: "malformed_database_url" | "unsupported_database_url" =
    "unsupported_database_url",
) {
  assert.deepEqual(validate(databaseUrl), {
    approved: false,
    reason,
  });
}

test("Phase 20K target guard: approves a supported hosted direct URL", () => {
  const result = validate(
    `postgresql://postgres:secret@db.${TARGET_REF}.supabase.co:5432/postgres`,
  );
  assert.equal(result.approved, true);
  if (result.approved) {
    assert.equal(result.connectionKind, "direct");
    assert.equal(result.identityHash, TARGET_HASH);
    assert.match(result.identityFingerprint, /^sha256:[a-f0-9]{12}$/);
  }
});

test("Phase 20K target guard: approves a supported hosted pooler URL", () => {
  const result = validate(
    `postgresql://postgres.${TARGET_REF}:secret@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`,
  );
  assert.equal(result.approved, true);
  if (result.approved) assert.equal(result.connectionKind, "pooler");
});

test("Phase 20K target guard: approves an ordinary strong password", () => {
  const result = validate(directUrl("CorrectHorseBatteryStaple!42"));
  assert.equal(result.approved, true);
});

test("Phase 20K target guard: approves safely encoded reserved password characters", () => {
  const result = validate(
    directUrl("valid%40strong%3Apass%2Fword%3Fwith%23reserved"),
  );
  assert.equal(result.approved, true);
});

test("Phase 20K target guard: approves the postgres database with query parameters", () => {
  const result = validate(
    directUrl("valid-strong-password", "/postgres", "?sslmode=require&application_name=phase20k-test"),
  );
  assert.equal(result.approved, true);
});

test("Phase 20K target guard: rejects a missing password", () => {
  assertRejected(
    `postgresql://postgres@db.${TARGET_REF}.supabase.co:5432/postgres`,
  );
});

test("Phase 20K target guard: rejects an empty password", () => {
  assertRejected(directUrl(""));
});

test("Phase 20K target guard: rejects percent-encoded whitespace-only passwords", () => {
  assertRejected(directUrl("%20%09%20"));
});

for (const [label, password] of [
  ["square-bracket YOUR-PASSWORD", "[YOUR-PASSWORD]"],
  ["percent-encoded square-bracket YOUR-PASSWORD", "%5BYOUR-PASSWORD%5D"],
  ["YOUR_PASSWORD", "YOUR_PASSWORD"],
  ["PASSWORD_HERE", "PASSWORD_HERE"],
  ["CHANGEME", "CHANGEME"],
  ["angle-bracket password", "<password>"],
  ["percent-encoded angle-bracket database-password", "%3Cdatabase-password%3E"],
  ["square-bracket DATABASE_PASSWORD", "[DATABASE_PASSWORD]"],
] as const) {
  test(`Phase 20K target guard: rejects the ${label} placeholder`, () => {
    assertRejected(directUrl(password));
  });
}

test("Phase 20K target guard: rejects malformed password percent-encoding", () => {
  assertRejected(directUrl("valid-prefix-%ZZ"), "malformed_database_url");
});

test("Phase 20K target guard: rejects a missing database path", () => {
  assertRejected(directUrl("valid-strong-password", ""));
});

test("Phase 20K target guard: rejects an empty database name", () => {
  assertRejected(directUrl("valid-strong-password", "/"));
});

test("Phase 20K target guard: rejects the template1 database", () => {
  assertRejected(directUrl("valid-strong-password", "/template1"));
});

test("Phase 20K target guard: rejects multiple database path segments", () => {
  assertRejected(directUrl("valid-strong-password", "/postgres/extra"));
});

test("Phase 20K target guard: rejects an encoded non-postgres database name", () => {
  assertRejected(directUrl("valid-strong-password", "/%74emplate1"));
});

test("Phase 20K target guard: rejects a malformed URL", () => {
  const result = validate("not-a-url");
  assert.deepEqual(result, {
    approved: false,
    reason: "malformed_database_url",
  });
});

test("Phase 20K target guard: rejects a missing expected target hash", () => {
  const result = validatePhase20kIntegrationTarget({
    databaseUrl: "not-disclosed",
    damagedProjectRefSha256: DAMAGED_HASH,
    acknowledgement: PHASE20K_ISOLATED_TARGET_ACKNOWLEDGEMENT,
  });
  assert.equal(result.reason, "missing_expected_target_hash");
});

test("Phase 20K target guard: rejects a missing damaged target hash", () => {
  // Supplying neither a damaged hash nor an explicit empty-denylist
  // acknowledgement still fails closed, and still under the original
  // reason code so existing callers and runbooks keep matching.
  const result = validatePhase20kIntegrationTarget({
    databaseUrl: "not-disclosed",
    expectedTargetProjectRefSha256: TARGET_HASH,
    acknowledgement: PHASE20K_ISOLATED_TARGET_ACKNOWLEDGEMENT,
  });
  assert.equal(result.reason, "missing_damaged_target_hash");
});

test("Phase 20K target guard: rejects the damaged target", () => {
  const result = validatePhase20kIntegrationTarget({
    databaseUrl: `postgresql://postgres:secret@db.${DAMAGED_REF}.supabase.co:5432/postgres`,
    expectedTargetProjectRefSha256: DAMAGED_HASH,
    damagedProjectRefSha256: DAMAGED_HASH,
    acknowledgement: PHASE20K_ISOLATED_TARGET_ACKNOWLEDGEMENT,
  });
  assert.equal(result.reason, "damaged_target_forbidden");
});

test("Phase 20K target guard: rejects a target not explicitly approved", () => {
  const result = validate(
    `postgresql://postgres:secret@db.${OTHER_REF}.supabase.co:5432/postgres`,
  );
  assert.equal(result.reason, "target_not_approved");
});

test("Phase 20K target guard: rejects an invalid acknowledgement", () => {
  const result = validatePhase20kIntegrationTarget({
    databaseUrl: `postgresql://postgres:secret@db.${TARGET_REF}.supabase.co:5432/postgres`,
    expectedTargetProjectRefSha256: TARGET_HASH,
    damagedProjectRefSha256: DAMAGED_HASH,
    acknowledgement: "approved",
  });
  assert.equal(result.reason, "invalid_acknowledgement");
});

test("Phase 20K target guard: rejects unsupported connection hosts", () => {
  const result = validate(
    "postgresql://postgres:secret@localhost:5432/postgres",
  );
  assert.equal(result.reason, "unsupported_database_url");
});

test("Phase 20K target guard: failure results contain no source secrets or identities", () => {
  const password = "sensitive-password";
  const sourceUrl = `postgresql://postgres:${password}@db.${OTHER_REF}.supabase.co:5432/postgres`;
  const serialized = JSON.stringify(validate(sourceUrl));
  assert.equal(serialized.includes(sourceUrl), false);
  assert.equal(serialized.includes(password), false);
  assert.equal(serialized.includes(OTHER_REF), false);
  assert.equal(serialized.includes(`db.${OTHER_REF}.supabase.co`), false);
});

// ---------------------------------------------------------------------------
// Damaged-target decision: exactly one representation must be supplied.
//
// The denylist may be a real hash (Block A) or an explicit statement that it
// is empty (Block B). "Empty" must always be a deliberate declaration, never
// the consequence of an unset variable, so the unset case fails closed.
// ---------------------------------------------------------------------------

const APPROVED_URL = `postgresql://postgres:pw@db.${TARGET_REF}.supabase.co:5432/postgres`;

function validateDecision(overrides: {
  damagedProjectRefSha256?: string | null;
  noDamagedProjectAcknowledgement?: string | null;
}) {
  return validatePhase20kIntegrationTarget({
    databaseUrl: APPROVED_URL,
    expectedTargetProjectRefSha256: TARGET_HASH,
    acknowledgement: PHASE20K_ISOLATED_TARGET_ACKNOWLEDGEMENT,
    ...overrides,
  });
}

test("damaged decision: explicit empty-denylist acknowledgement is accepted", () => {
  const result = validateDecision({
    noDamagedProjectAcknowledgement:
      PHASE20K_NO_DAMAGED_PROJECT_ACKNOWLEDGEMENT,
  });
  assert.equal(result.approved, true);
  assert.equal(result.reason, "approved");
});

test("damaged decision: a valid damaged hash remains accepted", () => {
  const result = validateDecision({
    damagedProjectRefSha256: DAMAGED_HASH,
  });
  assert.equal(result.approved, true);
});

test("damaged decision: supplying neither fails closed", () => {
  assert.deepEqual(validateDecision({}), {
    approved: false,
    reason: "missing_damaged_target_hash",
  });
});

test("damaged decision: an empty hash without acknowledgement fails closed", () => {
  assert.deepEqual(
    validateDecision({ damagedProjectRefSha256: "   " }),
    { approved: false, reason: "missing_damaged_target_hash" },
  );
});

test("damaged decision: supplying both representations is rejected", () => {
  assert.deepEqual(
    validateDecision({
      damagedProjectRefSha256: DAMAGED_HASH,
      noDamagedProjectAcknowledgement:
        PHASE20K_NO_DAMAGED_PROJECT_ACKNOWLEDGEMENT,
    }),
    { approved: false, reason: "conflicting_damaged_target_decision" },
  );
});

test("damaged decision: a malformed damaged hash is still rejected", () => {
  assert.deepEqual(
    validateDecision({ damagedProjectRefSha256: "not-a-sha256" }),
    { approved: false, reason: "invalid_damaged_target_hash" },
  );
});

test("damaged decision: a wrong empty-denylist literal is rejected", () => {
  for (const wrong of [
    "PHASE20K_NO_DAMAGED_PROJECT",
    "confirmed",
    "phase20k_no_damaged_project_confirmed",
    "PHASE20K_ISOLATED_TARGET_APPROVED",
  ]) {
    assert.deepEqual(
      validateDecision({ noDamagedProjectAcknowledgement: wrong }),
      {
        approved: false,
        reason: "invalid_no_damaged_project_acknowledgement",
      },
      `must reject the literal ${wrong}`,
    );
  }
});

test("damaged decision: the empty denylist does not bypass the damaged-target check", () => {
  // With the denylist explicitly empty there is nothing to forbid, but the
  // approved-target comparison must still reject a non-approved project.
  const otherUrl = `postgresql://postgres:pw@db.${OTHER_REF}.supabase.co:5432/postgres`;
  assert.deepEqual(
    validatePhase20kIntegrationTarget({
      databaseUrl: otherUrl,
      expectedTargetProjectRefSha256: TARGET_HASH,
      noDamagedProjectAcknowledgement:
        PHASE20K_NO_DAMAGED_PROJECT_ACKNOWLEDGEMENT,
      acknowledgement: PHASE20K_ISOLATED_TARGET_ACKNOWLEDGEMENT,
    }),
    { approved: false, reason: "target_not_approved" },
  );
});

test("damaged decision: a damaged target is still forbidden under Block A", () => {
  const damagedUrl = `postgresql://postgres:pw@db.${DAMAGED_REF}.supabase.co:5432/postgres`;
  assert.deepEqual(
    validatePhase20kIntegrationTarget({
      databaseUrl: damagedUrl,
      expectedTargetProjectRefSha256: DAMAGED_HASH,
      damagedProjectRefSha256: DAMAGED_HASH,
      acknowledgement: PHASE20K_ISOLATED_TARGET_ACKNOWLEDGEMENT,
    }),
    { approved: false, reason: "damaged_target_forbidden" },
  );
});

test("damaged decision: the isolated-target acknowledgement is still required", () => {
  assert.deepEqual(
    validatePhase20kIntegrationTarget({
      databaseUrl: APPROVED_URL,
      expectedTargetProjectRefSha256: TARGET_HASH,
      noDamagedProjectAcknowledgement:
        PHASE20K_NO_DAMAGED_PROJECT_ACKNOWLEDGEMENT,
      acknowledgement: null,
    }),
    { approved: false, reason: "invalid_acknowledgement" },
  );
});

test("damaged decision: the expected-target hash is still required", () => {
  assert.deepEqual(
    validatePhase20kIntegrationTarget({
      databaseUrl: APPROVED_URL,
      expectedTargetProjectRefSha256: null,
      noDamagedProjectAcknowledgement:
        PHASE20K_NO_DAMAGED_PROJECT_ACKNOWLEDGEMENT,
      acknowledgement: PHASE20K_ISOLATED_TARGET_ACKNOWLEDGEMENT,
    }),
    { approved: false, reason: "missing_expected_target_hash" },
  );
});

test("damaged decision: the breaking reason code is never returned", () => {
  // Phase 20M.0-G briefly renamed this reason. The rename was reverted for
  // backward compatibility; this test pins that decision so the breaking
  // code cannot be reintroduced without an explicit failure here.
  const missing = validateDecision({});
  assert.equal(missing.reason, "missing_damaged_target_hash");
  assert.notEqual(
    missing.reason as string,
    "missing_damaged_target_decision",
  );
});

// ---------------------------------------------------------------------------
// Integration-harness environment mapping.
//
// The harness files perform a real database connection, so their guard call
// cannot be executed here. What this section pins is the wiring itself: every
// harness that calls the guard must forward BOTH damaged-project environment
// variables, so neither configuration mode silently stops working.
// ---------------------------------------------------------------------------

const HARNESS_FILES = [
  "reconciliation-postgres.integration.test.ts",
  "reconciliation-4f1c-payable-hardblock-postgres.integration.test.ts",
  "reconciliation-4g1-scope-boundedness-postgres.integration.test.ts",
] as const;

for (const harness of HARNESS_FILES) {
  test(`harness wiring: ${harness} forwards both damaged-project variables`, () => {
    const source = readFileSync(new URL(harness, import.meta.url), "utf8");

    assert.match(
      source,
      /noDamagedProjectAcknowledgement:\s*\n?\s*process\.env\.PHASE20K_NO_DAMAGED_PROJECT_ACK/,
      "must forward PHASE20K_NO_DAMAGED_PROJECT_ACK into the guard",
    );
    assert.match(
      source,
      /damagedProjectRefSha256:\s*\n?\s*process\.env\.PHASE20K_DAMAGED_PROJECT_REF_SHA256/,
      "must keep forwarding PHASE20K_DAMAGED_PROJECT_REF_SHA256",
    );
    assert.equal(
      source.includes(PHASE20K_NO_DAMAGED_PROJECT_ACKNOWLEDGEMENT),
      false,
      "harness must not hardcode the acknowledgement literal",
    );
  });
}
