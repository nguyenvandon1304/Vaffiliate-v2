/**
 * Phase 20K follow-up 2 -- pure unit tests for the source-evidence
 * mapper.
 *
 * Exhaustive coverage:
 *
 *   - unknown network -> skip rejected_unknown_network
 *   - missing source key -> skip rejected_missing_source_key
 *   - missing ingestion event -> skip rejected_missing_ingestion_event
 *   - terminal states (paid/rejected) -> skip
 *   - payable -> skip rejected_paid_out_of_phase_20k_scope
 *   - pending + confirmed_eligible + settlement not payable -> apply approved
 *   - pending + cancelled -> reject rejected
 *   - pending + refunded -> reject rejected
 *   - pending + confirmed_invalid -> reject rejected
 *   - pending + pending_source -> skip
 *   - approved + settlement payable -> apply payable
 *   - approved + settlement not_payable -> skip
 *   - approved + settlement null + source unknown -> skip
 *   - any + ambiguous link -> skip rejected_missing_provenance
 */
import test from "node:test";
import assert from "node:assert/strict";

import { mapSourceEvidenceToDecision } from "./source-evidence";

function baseSnapshot(overrides: Partial<Parameters<typeof mapSourceEvidenceToDecision>[0]> = {}): Parameters<typeof mapSourceEvidenceToDecision>[0] {
  return {
    network: "shopee",
    currentStatus: "pending",
    validationStatus: null,
    settlementStatus: null,
    sourceConversionKey:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    ingestionEventId: "01234567-89ab-cdef-0123-456789abcdef",
    persistedLinkKind: "unique",
    sourceStatus: null,
    ...overrides,
  };
}

test("mapSourceEvidence: unknown network fails closed", () => {
  const d = mapSourceEvidenceToDecision(
    baseSnapshot({ network: "tiktok" }),
  );
  assert.equal(d.kind, "skip");
  assert.equal(d.reasonCode, "rejected_unknown_network");
});

test("mapSourceEvidence: missing source_conversion_key fails closed", () => {
  const d = mapSourceEvidenceToDecision(
    baseSnapshot({ sourceConversionKey: null }),
  );
  assert.equal(d.kind, "skip");
  assert.equal(d.reasonCode, "rejected_missing_source_key");
});

test("mapSourceEvidence: missing ingestion_event_id fails closed", () => {
  const d = mapSourceEvidenceToDecision(
    baseSnapshot({ ingestionEventId: null }),
  );
  assert.equal(d.kind, "skip");
  assert.equal(d.reasonCode, "rejected_missing_ingestion_event");
});

test("mapSourceEvidence: terminal status 'paid' is skipped, never advanced", () => {
  const d = mapSourceEvidenceToDecision(
    baseSnapshot({ currentStatus: "paid" }),
  );
  assert.equal(d.kind, "skip");
  assert.equal(d.reasonCode, "rejected_terminal_state");
});

test("mapSourceEvidence: terminal status 'rejected' is skipped", () => {
  const d = mapSourceEvidenceToDecision(
    baseSnapshot({ currentStatus: "rejected" }),
  );
  assert.equal(d.kind, "skip");
  assert.equal(d.reasonCode, "rejected_terminal_state");
});

test("mapSourceEvidence: payable stays skipped with phase-20k reason code", () => {
  const d = mapSourceEvidenceToDecision(
    baseSnapshot({ currentStatus: "payable" }),
  );
  assert.equal(d.kind, "skip");
  assert.equal(d.reasonCode, "rejected_paid_out_of_phase_20k_scope");
});

test("mapSourceEvidence: pending + confirmed_eligible -> apply approved", () => {
  const d = mapSourceEvidenceToDecision(
    baseSnapshot({
      sourceStatus: "confirmed_eligible",
      currentStatus: "pending",
    }),
  );
  assert.equal(d.kind, "apply");
  assert.equal(d.nextStatus, "approved");
});

test("mapSourceEvidence: pending + cancelled -> reject", () => {
  const d = mapSourceEvidenceToDecision(
    baseSnapshot({
      sourceStatus: "cancelled",
      currentStatus: "pending",
    }),
  );
  assert.equal(d.kind, "reject");
  assert.equal(d.nextStatus, "rejected");
});

test("mapSourceEvidence: pending + confirmed_invalid -> reject (RESERVED closed code; no production loader emits this snapshot today)", () => {
  // Phase 20K 4E3B: the snapshot value `confirmed_invalid` is
  // no longer auto-classified by the loader (which now treats
  // any `processing_status='failed'` ingestion event as
  // insufficient business evidence and falls through to the
  // default `"unknown"` skip). This test pins the closed-reason-
  // code contract for the snapshot value so a future allowlist
  // checkpoint can rely on it: when a snapshot directly
  // constructed by a test (or by an explicit future allowlist
  // mapping) carries `sourceStatus = "confirmed_invalid"`, the
  // mapper MUST return `kind: "reject", nextStatus: "rejected",
  // reasonCode: "rejected_source_invalid"`.
  //
  // The integration suite asserts that no production row with
  // a `failed` ingestion event ever reaches this branch.
  const d = mapSourceEvidenceToDecision(
    baseSnapshot({
      sourceStatus: "confirmed_invalid",
      currentStatus: "pending",
    }),
  );
  assert.equal(d.kind, "reject");
  assert.equal(d.nextStatus, "rejected");
  assert.equal(d.reasonCode, "rejected_source_invalid");
});

test("mapSourceEvidence: pending + refunded -> reject", () => {
  const d = mapSourceEvidenceToDecision(
    baseSnapshot({
      sourceStatus: "refunded",
      currentStatus: "pending",
    }),
  );
  assert.equal(d.kind, "reject");
  assert.equal(d.nextStatus, "rejected");
  assert.equal(d.reasonCode, "rejected_source_refunded");
});

test("mapSourceEvidence: pending + unknown source -> skip (never auto-approve)", () => {
  const d = mapSourceEvidenceToDecision(
    baseSnapshot({
      sourceStatus: "unknown",
      currentStatus: "pending",
    }),
  );
  assert.equal(d.kind, "skip");
  assert.notEqual(d.kind, "apply");
});

test("mapSourceEvidence: pending + null source -> skip", () => {
  const d = mapSourceEvidenceToDecision(
    baseSnapshot({
      sourceStatus: null,
      currentStatus: "pending",
    }),
  );
  assert.equal(d.kind, "skip");
  assert.equal(d.reasonCode, "rejected_source_not_confirmed");
});

test("mapSourceEvidence: pending + pending_source -> skip (no auto-approve)", () => {
  const d = mapSourceEvidenceToDecision(
    baseSnapshot({
      sourceStatus: "pending_source",
      currentStatus: "pending",
    }),
  );
  assert.equal(d.kind, "skip");
  assert.equal(d.reasonCode, "rejected_source_not_confirmed");
});

test("mapSourceEvidence: (4F1B HARD-BLOCK) approved + settlement=payable -> skip rejected_unverified_settlement_evidence (NEVER apply payable)", () => {
  // Phase 20K 4F1B -- the previous version of this test
  // asserted the apply path (`kind: "apply", nextStatus:
  // "payable"`). Phase 20K 4F1 proved that no real
  // upstream settlement producer exists, and 4F1B replaces
  // the apply branch with a fail-closed skip. The apply
  // path is reserved for a future checkpoint that introduces
  // a real, durable, producer-bound upstream settlement
  // signal -- and even then, the mapper's gate will be
  // different from the prior "settlement column says payable"
  // self-validation. Today, ANY `approved + settlement=
  // payable` input MUST skip with the distinct closed code
  // `rejected_unverified_settlement_evidence` and MUST NOT
  // mutate the conversion row, set `payable_at`, or write an
  // applied audit event.
  const d = mapSourceEvidenceToDecision(
    baseSnapshot({
      currentStatus: "approved",
      settlementStatus: "payable",
      sourceStatus: "pending_source",
    }),
  );
  assert.equal(
    d.kind,
    "skip",
    "Phase 20K 4F1B: approved + settlement='payable' MUST skip, never apply",
  );
  if (d.kind === "skip") {
    assert.equal(
      d.reasonCode,
      "rejected_unverified_settlement_evidence",
      "Phase 20K 4F1B: distinct closed skip reason for an unverified settlement transition",
    );
  }
});

test("mapSourceEvidence: (4F1B HARD-BLOCK cross-source-status) approved + settlement='payable' skips under every sourceStatus the mapper recognises", () => {
  // Exhaustively confirm the 4F1B gate is independent of the
  // source-status value. A hand-set `settlement_status =
  // 'payable'` on an `approved` row MUST skip with the
  // distinct closed code regardless of whether the source-
  // status is `confirmed_eligible`, `pending_source`,
  // `unknown`, `cancelled`, `refunded`, or `null`. (Note:
  // `cancelled` / `refunded` would normally route to a
  // `rejected_source_*` branch -- the 4F1B gate is reached
  // because `currentStatus === "approved"` short-circuits
  // the `pending` block; we assert the gate fires BEFORE
  // any source-status branch could emit an apply.)
  const sourceStatuses = [
    "confirmed_eligible",
    "pending_source",
    "unknown",
    "cancelled",
    "refunded",
    null,
    undefined,
  ];
  for (const ss of sourceStatuses) {
    const d = mapSourceEvidenceToDecision(
      baseSnapshot({
        currentStatus: "approved",
        settlementStatus: "payable",
        sourceStatus: ss as never,
      }),
    );
    assert.notEqual(
      d.kind,
      "apply",
      "Phase 20K 4F1B: settlement='payable' MUST NEVER apply for sourceStatus=" +
        String(ss) +
        "; the producer gate precedes any source-status branch",
    );
    assert.equal(
      d.kind,
      "skip",
      "sourceStatus=" + String(ss),
    );
    if (d.kind === "skip") {
      assert.equal(
        d.reasonCode,
        "rejected_unverified_settlement_evidence",
        "distinct closed skip reason for sourceStatus=" + String(ss),
      );
    }
  }
});

test("mapSourceEvidence: approved + settlement=not_payable -> skip", () => {
  const d = mapSourceEvidenceToDecision(
    baseSnapshot({
      currentStatus: "approved",
      settlementStatus: "not_payable",
    }),
  );
  assert.equal(d.kind, "skip");
  assert.equal(d.reasonCode, "rejected_settlement_not_payable");
});

test("mapSourceEvidence: approved + settlement=null + unknown source -> skip", () => {
  const d = mapSourceEvidenceToDecision(
    baseSnapshot({
      currentStatus: "approved",
      settlementStatus: null,
      sourceStatus: null,
    }),
  );
  assert.equal(d.kind, "skip");
});

test("mapSourceEvidence: persisted ambiguous link -> skip rejected_attribution_source_key_collision", () => {
  // Phase 20K 4A2B renames the v3 'ambiguous' label to the
  // specific schema-collision meaning it actually had.
  const d = mapSourceEvidenceToDecision(
    baseSnapshot({
      persistedLinkKind: "source_key_collision",
      currentStatus: "pending",
      sourceStatus: "confirmed_eligible",
    }),
  );
  assert.equal(d.kind, "skip");
  assert.equal(
    d.reasonCode,
    "rejected_attribution_source_key_collision",
  );
});

test("mapSourceEvidence: persisted duplicate link -> skip rejected_attribution_order_id_collision", () => {
  // Phase 20K 4A2B renames the v3 'duplicate' label to the
  // schema-collision meaning it actually had.
  const d = mapSourceEvidenceToDecision(
    baseSnapshot({
      persistedLinkKind: "order_id_collision",
      currentStatus: "pending",
      sourceStatus: "confirmed_eligible",
    }),
  );
  assert.equal(d.kind, "skip");
  assert.equal(d.reasonCode, "rejected_attribution_order_id_collision");
});

test("mapSourceEvidence: manual network is refused closed (removed from the automatic allowlist in 4A2B)", () => {
  // Phase 20K 4A2B removes "manual" from the automatic
  // reconciliation allowlist because there is no durable
  // ingestion pipeline that persists a manual-network
  // conversion with (ingestion_event, source_conversion_key,
  // csv row) evidence. Without that evidence the engine MUST
  // refuse -- it must NOT auto-approve merely because
  // commission amounts look valid.
  const d = mapSourceEvidenceToDecision(
    baseSnapshot({
      network: "manual",
      sourceStatus: "confirmed_eligible",
      currentStatus: "pending",
    }),
  );
  assert.equal(d.kind, "skip");
  assert.equal(d.reasonCode, "rejected_unknown_network");
});

test("mapSourceEvidence: never produces nextStatus='paid'", () => {
  const snapshot = baseSnapshot({
    currentStatus: "approved",
    settlementStatus: "payable",
    sourceStatus: "confirmed_eligible",
  });
  const d = mapSourceEvidenceToDecision(snapshot);
  if (d.kind === "apply") {
    assert.notEqual(d.nextStatus, "paid");
  }
});

test("mapSourceEvidence: follow-up 4 fail-closed -- missing persistedLinkKind skips (never auto-approve)", () => {
  const d = mapSourceEvidenceToDecision(
    baseSnapshot({
      persistedLinkKind: undefined,
      currentStatus: "pending",
      sourceStatus: "confirmed_eligible",
    }),
  );
  assert.equal(d.kind, "skip");
  assert.equal(d.reasonCode, "rejected_missing_provenance");
});

test("mapSourceEvidence: follow-up 4 fail-closed -- ambiguous persistedLinkKind skips", () => {
  // Phase 20K 4A2B replaced the v3 "ambiguous" label with the
  // two schema-enforced collision labels
  // (source_key_collision, order_id_collision). Behaviour is
  // identical: skip + rejected.
  const d = mapSourceEvidenceToDecision(
    baseSnapshot({
      persistedLinkKind: "source_key_collision",
      currentStatus: "pending",
      sourceStatus: "confirmed_eligible",
    }),
  );
  assert.equal(d.kind, "skip");
  assert.equal(d.reasonCode, "rejected_attribution_source_key_collision");
});

test("mapSourceEvidence: follow-up 4 fail-closed -- duplicate persistedLinkKind skips", () => {
  // Phase 20K 4A2B renamed the v3 "duplicate" label to
  // "owner_mismatch" with its own diagnostic reason code so
  // ownership mismatches are not silently lumped into the
  // generic missing-provenance bucket.
  const d = mapSourceEvidenceToDecision(
    baseSnapshot({
      persistedLinkKind: "owner_mismatch",
      currentStatus: "pending",
      sourceStatus: "confirmed_eligible",
    }),
  );
  assert.equal(d.kind, "skip");
  assert.equal(d.reasonCode, "rejected_attribution_owner_mismatch");
});

test("mapSourceEvidence: follow-up 4 fail-closed -- null persistedLinkKind skips", () => {
  const d = mapSourceEvidenceToDecision(
    baseSnapshot({
      persistedLinkKind: null,
      currentStatus: "pending",
      sourceStatus: "confirmed_eligible",
    }),
  );
  assert.equal(d.kind, "skip");
  assert.equal(d.reasonCode, "rejected_missing_provenance");
});

test("mapSourceEvidence: follow-up 4 -- only 'unique' link-kind opens the apply gate", () => {
  const snapshot = baseSnapshot({
    currentStatus: "pending",
    sourceStatus: "confirmed_eligible",
    persistedLinkKind: "unique",
  });
  const d = mapSourceEvidenceToDecision(snapshot);
  assert.equal(d.kind, "apply");
});

// -----------------------------------------------------------------------
// Phase 20K checkpoint 4A2 -- persisted attribution provenance contract.
// -----------------------------------------------------------------------
// The eight required scenarios are locked at TWO layers:
//
//   - DB shape (publisher/tracking_link existence and ownership) is
//     exercised by classify-source-evidence.test.ts driving the
//     classifySourceEvidence pure helper with the same row shape
//     executeSourceEvidenceQuery produces.
//
//   - Decision shape (what the mapper returns when the snapshot
//     announces a particular persistedLinkKind / missing key /
//     unknown network) is locked here so a change to the mapper
//     trips an immediate failure.
//
// Tests below correspond to the user required scenarios 1..8.

test(
  "Phase 20K 4A2 (1) valid persisted attribution: pending + confirmed_eligible + unique -> apply approved",
  () => {
    const d = mapSourceEvidenceToDecision(
      baseSnapshot({
        persistedLinkKind: "unique",
        currentStatus: "pending",
        sourceStatus: "confirmed_eligible",
      }),
    );
    assert.equal(d.kind, "apply");
    assert.equal(d.nextStatus, "approved");
  },
);

test(
  "Phase 20K 4A2 (2) missing publisher/user (persistedLinkKind=missing): never auto-approves",
  () => {
    const d = mapSourceEvidenceToDecision(
      baseSnapshot({
        persistedLinkKind: "missing",
        currentStatus: "pending",
        sourceStatus: "confirmed_eligible",
      }),
    );
    assert.equal(d.kind, "skip");
    assert.notEqual(d.kind, "apply");
  },
);

test(
  "Phase 20K 4A2 (3) missing tracking-link attribution (persistedLinkKind=missing): never auto-approves",
  () => {
    const d = mapSourceEvidenceToDecision(
      baseSnapshot({
        persistedLinkKind: "missing",
        currentStatus: "pending",
        sourceStatus: "confirmed_eligible",
      }),
    );
    assert.equal(d.kind, "skip");
    assert.notEqual(d.kind, "apply");
  },
);

test(
  "Phase 20K 4A2 (4) tracking link belongs to another publisher (persistedLinkKind=owner_mismatch): skipped with rejected_attribution_owner_mismatch",
  () => {
    const d = mapSourceEvidenceToDecision(
      baseSnapshot({
        persistedLinkKind: "owner_mismatch",
        currentStatus: "pending",
        sourceStatus: "confirmed_eligible",
      }),
    );
    assert.equal(d.kind, "skip");
    assert.notEqual(d.kind, "apply");
    assert.equal(d.reasonCode, "rejected_attribution_owner_mismatch");
  },
);

test(
  "Phase 20K 4A2 (5a) duplicate attribution (persistedLinkKind=source_key_collision): skipped with rejected_attribution_source_key_collision",
  () => {
    const d = mapSourceEvidenceToDecision(
      baseSnapshot({
        persistedLinkKind: "source_key_collision",
        currentStatus: "pending",
        sourceStatus: "confirmed_eligible",
      }),
    );
    assert.equal(d.kind, "skip");
    assert.equal(
      d.reasonCode,
      "rejected_attribution_source_key_collision",
    );
  },
);

test(
  "Phase 20K 4A2 (5b) ambiguous attribution (persistedLinkKind=order_id_collision): skipped with rejected_attribution_order_id_collision",
  () => {
    const d = mapSourceEvidenceToDecision(
      baseSnapshot({
        persistedLinkKind: "order_id_collision",
        currentStatus: "pending",
        sourceStatus: "confirmed_eligible",
      }),
    );
    assert.equal(d.kind, "skip");
    assert.equal(d.reasonCode, "rejected_attribution_order_id_collision");
  },
);

test(
  "Phase 20K 4A2 (6) missing source conversion key: never auto-approves",
  () => {
    const d = mapSourceEvidenceToDecision(
      baseSnapshot({
        sourceConversionKey: null,
        currentStatus: "pending",
        sourceStatus: "confirmed_eligible",
        persistedLinkKind: "unique",
      }),
    );
    assert.equal(d.kind, "skip");
    assert.equal(d.reasonCode, "rejected_missing_source_key");
  },
);

test(
  "Phase 20K 4A2 (7) unknown network: never auto-approves and fails closed (4A2B removes manual from the allowlist too)",
  () => {
    const d = mapSourceEvidenceToDecision(
      baseSnapshot({
        network: "tiktok",
        currentStatus: "pending",
        sourceStatus: "confirmed_eligible",
        persistedLinkKind: "unique",
      }),
    );
    assert.equal(d.kind, "skip");
    assert.equal(d.reasonCode, "rejected_unknown_network");
  },
);

test(
  "Phase 20K 4A2 (8) undefined persistedLinkKind is never accepted as unique: never auto-approves",
  () => {
    const d = mapSourceEvidenceToDecision(
      baseSnapshot({
        persistedLinkKind: undefined,
        currentStatus: "pending",
        sourceStatus: "confirmed_eligible",
      }),
    );
    assert.equal(d.kind, "skip");
    assert.equal(d.reasonCode, "rejected_missing_provenance");
  },
);
