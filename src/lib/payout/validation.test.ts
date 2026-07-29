import assert from "node:assert/strict";
import test from "node:test";

import { PayoutApplicationError } from "./errors";
import {
  isDecimalVndString,
  mapPayoutEventSummary,
  mapPayoutMutationResult,
  mapPayoutRequestItem,
  mapPayoutRequestSummary,
  mapVerifiedPayoutAccountOption,
  parseDecimalVndString,
} from "./validation";
import {
  payoutEventViewRow,
  payoutItemViewRow,
  payoutRequestViewRow,
  payoutRpcResponse,
} from "./payout.test-helpers";

const RAW_ACCOUNT_NUMBER = "4" + "1".repeat(15);

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
      account_number_snapshot: RAW_ACCOUNT_NUMBER,
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
    RAW_ACCOUNT_NUMBER,
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

test("verified payout-account mapper returns only a UUID and masked destination", () => {
  const rawAccountNumber = "1".repeat(12) + "3456";
  const option = mapVerifiedPayoutAccountOption({
    id: "22222222-2222-4222-8222-222222222222",
    method: "bank",
    provider: "TESTBANK",
    account_number: rawAccountNumber,
    status: "verified",
    user_id: "private-owner-id",
    account_name: "PRIVATE ACCOUNT HOLDER",
    verification_evidence: { internal: true },
  });
  const serialized = JSON.stringify(option);

  assert.deepEqual(option, {
    payoutAccountId: "22222222-2222-4222-8222-222222222222",
    method: "bank",
    providerLabel: "TESTBANK",
    maskedDestination: "****3456",
    verification: "verified",
  });
  for (const forbidden of [
    rawAccountNumber,
    "private-owner-id",
    "PRIVATE ACCOUNT HOLDER",
    "verification_evidence",
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("verified payout-account mapper rejects malformed or ineligible rows", () => {
  const rawAccountNumber = "1".repeat(12) + "3456";
  const base = {
    id: "22222222-2222-4222-8222-222222222222",
    method: "bank",
    provider: "TESTBANK",
    account_number: rawAccountNumber,
    status: "verified",
  };

  for (const row of [
    { ...base, id: "not-a-uuid" },
    { ...base, status: "unverified" },
    { ...base, status: "disabled" },
    { ...base, status: "rejected" },
    { ...base, method: "wallet" },
    { ...base, provider: "" },
    { ...base, provider: "A".repeat(121) },
    { ...base, account_number: "raw-account" },
  ]) {
    assert.throws(
      () => mapVerifiedPayoutAccountOption(row),
      (error) =>
        error instanceof PayoutApplicationError &&
        error.code === "PAYOUT_RESPONSE_INVALID",
    );
  }
});
