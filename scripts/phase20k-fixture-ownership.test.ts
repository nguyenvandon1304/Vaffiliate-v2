import assert from "node:assert/strict";
import test from "node:test";

import {
  Phase20kOwnershipError,
  addPhase20kOwnedFixtureRow,
  captureGeneratedPhase20kFixturePrimaryKey,
  createPhase20kFixtureOwnershipManifest,
  planPhase20kFixtureCleanup,
  sealPhase20kFixtureOwnershipManifest,
  serializePhase20kFixtureOwnershipManifest,
  verifyPhase20kFixtureCleanup,
} from "./phase20k-fixture-ownership";

const TARGET_HASH = "a".repeat(64);

function createManifest() {
  return createPhase20kFixtureOwnershipManifest({
    runId: "phase20k-run-0001",
    targetIdentityHash: TARGET_HASH,
    createdAt: "2026-07-21T00:00:00.000Z",
  });
}

function hasOwnershipCode(code: string) {
  return (error: unknown) =>
    error instanceof Phase20kOwnershipError && error.code === code;
}

test("Phase 20K ownership: adds exact owned primary keys", () => {
  const manifest = addPhase20kOwnedFixtureRow(
    createManifest(),
    "public.offers",
    { primaryKey: { id: "fixture-offer-1" } },
  );
  assert.deepEqual(manifest.ownedRows["public.offers"], [
    { primaryKey: { id: "fixture-offer-1" } },
  ]);
});

test("Phase 20K ownership: duplicate relation and PK ownership is rejected", () => {
  const manifest = addPhase20kOwnedFixtureRow(
    createManifest(),
    "public.conversions",
    { primaryKey: { id: "conversion-1" } },
  );
  assert.throws(
    () =>
      addPhase20kOwnedFixtureRow(manifest, "public.conversions", {
        primaryKey: { id: "conversion-1" },
      }),
    hasOwnershipCode("duplicate_ownership"),
  );
});

test("Phase 20K ownership: unknown relations are rejected", () => {
  assert.throws(
    () =>
      addPhase20kOwnedFixtureRow(createManifest(), "public.unknown", {
        primaryKey: { id: "unknown-1" },
      }),
    hasOwnershipCode("unknown_relation"),
  );
});

test("Phase 20K ownership: additions after sealing are rejected", () => {
  const sealed = sealPhase20kFixtureOwnershipManifest(createManifest());
  assert.throws(
    () =>
      addPhase20kOwnedFixtureRow(sealed, "public.offers", {
        primaryKey: { id: "fixture-offer-1" },
      }),
    hasOwnershipCode("manifest_not_open"),
  );
});

test("Phase 20K ownership: generated PKs can be captured before sealing", () => {
  const manifest = captureGeneratedPhase20kFixturePrimaryKey(
    createManifest(),
    "public.reconciliation_runs",
    { id: "generated-run-id" },
    { candidate_fingerprint: "exact-fingerprint" },
  );
  assert.deepEqual(manifest.ownedRows["public.reconciliation_runs"], [
    {
      primaryKey: { id: "generated-run-id" },
      businessKey: { candidate_fingerprint: "exact-fingerprint" },
    },
  ]);
});

test("Phase 20K ownership: conversions require their exact conversion PK", () => {
  assert.throws(
    () =>
      addPhase20kOwnedFixtureRow(createManifest(), "public.conversions", {
        primaryKey: { publisher_id: "publisher-1" },
      }),
    hasOwnershipCode("invalid_primary_key"),
  );
  assert.doesNotThrow(() =>
    addPhase20kOwnedFixtureRow(createManifest(), "public.conversions", {
      primaryKey: { id: "conversion-1" },
    }),
  );
});

test("Phase 20K ownership: cashback policies require the exact owned offer key", () => {
  assert.throws(
    () =>
      addPhase20kOwnedFixtureRow(
        createManifest(),
        "public.cashback_policies",
        { primaryKey: { id: "policy-1" } },
      ),
    hasOwnershipCode("invalid_primary_key"),
  );
  assert.doesNotThrow(() =>
    addPhase20kOwnedFixtureRow(
      createManifest(),
      "public.cashback_policies",
      { primaryKey: { offer_id: "fixture-offer-1" } },
    ),
  );
});

test("Phase 20K ownership: cleanup plan follows deterministic reverse-FK order", () => {
  let manifest = createManifest();
  manifest = addPhase20kOwnedFixtureRow(manifest, "auth.users", {
    primaryKey: { id: "user-1" },
  });
  manifest = addPhase20kOwnedFixtureRow(manifest, "public.profiles", {
    primaryKey: { user_id: "user-1" },
  });
  manifest = addPhase20kOwnedFixtureRow(manifest, "public.conversions", {
    primaryKey: { id: "conversion-1" },
  });
  const planned = planPhase20kFixtureCleanup(
    sealPhase20kFixtureOwnershipManifest(manifest),
  );
  assert.deepEqual(
    planned.cleanupPlan.steps.map((step) => step.relation),
    ["public.conversions", "public.profiles", "auth.users"],
  );
});

test("Phase 20K ownership: wildcard ownership representations are rejected", () => {
  assert.throws(
    () =>
      addPhase20kOwnedFixtureRow(createManifest(), "public.tracking_links", {
        primaryKey: { id: "prefix%" },
      }),
    hasOwnershipCode("wildcard_identifier_forbidden"),
  );
});

test("Phase 20K ownership: cleanup plan is data only and contains no DELETE SQL", () => {
  const manifest = addPhase20kOwnedFixtureRow(
    createManifest(),
    "public.conversions",
    { primaryKey: { id: "conversion-1" } },
  );
  const planned = planPhase20kFixtureCleanup(
    sealPhase20kFixtureOwnershipManifest(manifest),
  );
  const serialized = JSON.stringify(planned.cleanupPlan);
  assert.equal(/\bdelete\b/i.test(serialized), false);
  assert.equal(serialized.includes("%"), false);
  assert.deepEqual(planned.cleanupPlan.steps[0]?.rows[0]?.primaryKey, {
    id: "conversion-1",
  });
});

test("Phase 20K ownership: manifest serialization is deterministic", () => {
  let first = createManifest();
  first = addPhase20kOwnedFixtureRow(first, "public.offers", {
    primaryKey: { id: "offer-b" },
  });
  first = addPhase20kOwnedFixtureRow(first, "public.offers", {
    primaryKey: { id: "offer-a" },
  });

  let second = createManifest();
  second = addPhase20kOwnedFixtureRow(second, "public.offers", {
    primaryKey: { id: "offer-a" },
  });
  second = addPhase20kOwnedFixtureRow(second, "public.offers", {
    primaryKey: { id: "offer-b" },
  });

  assert.equal(
    serializePhase20kFixtureOwnershipManifest(first),
    serializePhase20kFixtureOwnershipManifest(second),
  );
});

test("Phase 20K ownership: verified lifecycle requires zero remaining owned rows", () => {
  const manifest = addPhase20kOwnedFixtureRow(
    createManifest(),
    "public.offers",
    { primaryKey: { id: "offer-a" } },
  );
  const planned = planPhase20kFixtureCleanup(
    sealPhase20kFixtureOwnershipManifest(manifest),
  );
  assert.throws(
    () =>
      verifyPhase20kFixtureCleanup(planned.manifest, {
        "public.offers": 1,
      }),
    hasOwnershipCode("cleanup_not_verified"),
  );
  const verified = verifyPhase20kFixtureCleanup(planned.manifest, {
    "public.offers": 0,
  });
  assert.equal(verified.lifecycle, "verified");
});
