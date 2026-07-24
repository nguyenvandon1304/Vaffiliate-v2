import assert from "node:assert/strict";
import test from "node:test";

import {
  PHASE20K_ISOLATED_TARGET_ACKNOWLEDGEMENT,
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
