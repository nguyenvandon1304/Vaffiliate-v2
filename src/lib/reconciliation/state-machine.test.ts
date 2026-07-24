/**
 * Phase 20K -- reconciliation state machine tests.
 */

import test from "node:test";
import assert from "node:assert/strict";

import type { ConversionStatus } from "@/types/affiliate";

import {
  ALLOWED_TRANSITIONS,
  assertCanTransition,
  canTransition,
  isForwardTarget,
  isTerminalStatus,
  StateTransitionError,
} from "./state-machine";

const ALL_STATUSES: ReadonlyArray<ConversionStatus> = [
  "pending",
  "approved",
  "rejected",
  "payable",
  "paid",
];

test("Phase 20K canTransition: pending -> approved is allowed", () => {
  assert.equal(canTransition("pending", "approved"), true);
});

test("Phase 20K canTransition: pending -> rejected is allowed", () => {
  assert.equal(canTransition("pending", "rejected"), true);
});

test("Phase 20K canTransition: pending -> payable is forbidden (must go via approved)", () => {
  assert.equal(canTransition("pending", "payable"), false);
});

test("Phase 20K canTransition: pending -> paid is forbidden", () => {
  assert.equal(canTransition("pending", "paid"), false);
});

test("Phase 20K canTransition: approved -> payable is allowed", () => {
  assert.equal(canTransition("approved", "payable"), true);
});

test("Phase 20K canTransition: approved -> rejected is allowed (with explicit reason)", () => {
  assert.equal(canTransition("approved", "rejected"), true);
});

test("Phase 20K canTransition: approved -> pending is forbidden", () => {
  assert.equal(canTransition("approved", "pending"), false);
});

test("Phase 20K canTransition: payable -> paid is allowed", () => {
  assert.equal(canTransition("payable", "paid"), true);
});

test("Phase 20K canTransition: payable -> rejected is forbidden", () => {
  assert.equal(canTransition("payable", "rejected"), false);
});

test("Phase 20K canTransition: payable -> approved is forbidden", () => {
  assert.equal(canTransition("payable", "approved"), false);
});

test("Phase 20K canTransition: rejected is terminal -- no forward transition is allowed", () => {
  for (const next of ALL_STATUSES) {
    if (next === "rejected") continue;
    assert.equal(canTransition("rejected", next), false);
  }
});

test("Phase 20K canTransition: paid is terminal -- no forward transition is allowed", () => {
  for (const next of ALL_STATUSES) {
    if (next === "paid") continue;
    assert.equal(canTransition("paid", next), false);
  }
});

test("Phase 20K canTransition: self-transitions are forbidden", () => {
  for (const status of ALL_STATUSES) {
    assert.equal(canTransition(status, status), false);
  }
});

test("Phase 20K assertCanTransition: passes a valid transition silently", () => {
  assert.doesNotThrow(() => assertCanTransition("pending", "approved"));
});

test("Phase 20K assertCanTransition: throws on terminal state attempts", () => {
  assert.throws(
    () => assertCanTransition("paid", "rejected"),
    StateTransitionError,
  );
  assert.throws(
    () => assertCanTransition("rejected", "approved"),
    StateTransitionError,
  );
});

test("Phase 20K assertCanTransition: throws on unknown transitions", () => {
  assert.throws(
    () => assertCanTransition("pending", "paid"),
    StateTransitionError,
  );
});

test("Phase 20K assertCanTransition: throws on no-op self transition", () => {
  assert.throws(
    () => assertCanTransition("pending", "pending"),
    StateTransitionError,
  );
});

test("Phase 20K isTerminalStatus: matches the contract", () => {
  assert.equal(isTerminalStatus("paid"), true);
  assert.equal(isTerminalStatus("rejected"), true);
  assert.equal(isTerminalStatus("pending"), false);
  assert.equal(isTerminalStatus("approved"), false);
  assert.equal(isTerminalStatus("payable"), false);
});

test("Phase 20K isForwardTarget: matches canTransition for every (source, target) pair", () => {
  for (const source of ALL_STATUSES) {
    for (const target of ALL_STATUSES) {
      if (source === target) continue;
      assert.equal(
        isForwardTarget(source, target),
        canTransition(source, target),
      );
    }
  }
});

test("Phase 20K state machine: every ConversionStatus has a table entry", () => {
  for (const status of ALL_STATUSES) {
    assert.ok(ALLOWED_TRANSITIONS[status]);
    assert.ok(Array.isArray(ALLOWED_TRANSITIONS[status]));
  }
});
