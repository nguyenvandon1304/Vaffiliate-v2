import assert from "node:assert/strict";
import test from "node:test";

import { PayoutApplicationError } from "./errors";
import {
  isDecimalVndString,
  mapPayoutEventSummary,
  mapPayoutMutationResult,
  mapPayoutRequestItem,
  mapPayoutRequestSummary,
  parseDecimalVndString,
} from "./validation";
import {
  payoutEventViewRow,
  payoutItemViewRow,
  payoutRequestViewRow,
  payoutRpcResponse,
} from "./payout.test-helpers";

test("payout DTO mapping preserves money above Number.MAX_SAFE_INTEGER", () => {
  const value = "90071992547409931234567890";
  const request = mapPayoutRequestSummary(payoutRequestViewRow());
  const item = mapPayoutRequestItem(payoutItemViewRow());
  const event = mapPayoutEventSummary(payoutEventViewRow());
  const mutation = mapPayoutMutationResult(payoutRpcResponse());

  assert.equal(request.requestedAmountVnd, value);
  assert.equal(item.amountVnd, value);
  assert.equal(event.reservedAmountVnd, value);
  assert.equal(mutation.requestedAmountVnd, value);
  assert.equal(typeof request.requestedAmountVnd, "string");
});

test("decimal VND accepts canonical unsigned decimal strings only", () => {
  assert.equal(isDecimalVndString("0"), true);
  assert.equal(isDecimalVndString("90071992547409931234567890"), true);
  for (const value of [1, "", "01", "-1", "+1", "1.0", "1e3"] as const) {
    assert.equal(isDecimalVndString(value), false);
    assert.throws(
      () => parseDecimalVndString(value),
      (error) =>
        error instanceof PayoutApplicationError &&
        error.code === "PAYOUT_RESPONSE_INVALID",
    );
  }
});

test("payout mappers validate statuses, UUIDs, and timestamps", () => {
  for (const row of [
    payoutRequestViewRow({ status: "unknown" }),
    payoutRequestViewRow({ id: "not-a-uuid" }),
    payoutRequestViewRow({ created_at: "not-a-timestamp" }),
  ]) {
    assert.throws(
      () => mapPayoutRequestSummary(row),
      (error) =>
        error instanceof PayoutApplicationError &&
        error.code === "PAYOUT_RESPONSE_INVALID",
    );
  }
});

test("owner DTOs whitelist fields and discard sensitive database data", () => {
  const request = mapPayoutRequestSummary(
    payoutRequestViewRow({
      account_number_snapshot: "4111111111111111",
      destination_fingerprint: "sensitive-fingerprint",
      internal_reason: "sensitive-reason",
    }),
  );
  const event = mapPayoutEventSummary(
    payoutEventViewRow({
      actor_user_id: "sensitive-actor",
      before_snapshot: { raw: true },
      after_snapshot: { raw: true },
      evidence_reference: "sensitive-evidence",
    }),
  );
  const serialized = JSON.stringify({ request, event });

  for (const forbidden of [
    "4111111111111111",
    "sensitive-fingerprint",
    "sensitive-reason",
    "sensitive-actor",
    "sensitive-evidence",
    "before_snapshot",
    "after_snapshot",
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});
