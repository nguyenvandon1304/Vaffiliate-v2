import assert from "node:assert/strict";
import test from "node:test";

import { PayoutApplicationError } from "./errors";
import {
  parseConfirmNonpaymentCommand,
  parseCreatePayoutCommand,
  parsePayoutRequestCommand,
  parseStartProcessingCommand,
  readPayoutFields,
  toPayoutPublicError,
  toPublicOwnedPayoutRequest,
  toPublicPayoutMutation,
} from "./entry-point";
import {
  TEST_ACCOUNT_ID,
  TEST_CONVERSION_ID,
  TEST_EVENT_ID,
  TEST_IDEMPOTENCY_KEY,
  TEST_NOW,
  TEST_REQUEST_ID,
} from "./payout.test-helpers";
import type {
  DecimalVndString,
  OwnedPayoutRequest,
  PayoutMutationResult,
} from "@/types/payout";

const LARGE_MONEY = "90071992547409931234567890" as DecimalVndString;
const ZERO = "0" as DecimalVndString;

function mutationResult(): PayoutMutationResult {
  return {
    requestId: TEST_REQUEST_ID,
    status: "requested",
    currency: "VND",
    requestedAmountVnd: LARGE_MONEY,
    reservedAmountVnd: LARGE_MONEY,
    approvedAmountVnd: ZERO,
    paidAmountVnd: ZERO,
    releasedAmountVnd: ZERO,
    itemCount: 1,
    destination: {
      method: "bank",
      provider: "TESTBANK",
      accountName: "PRIVATE ACCOUNT HOLDER",
      accountNumberMasked: "1234",
    },
    ownerReasonCode: null,
    eventId: TEST_EVENT_ID,
    eventCreatedAt: TEST_NOW,
    requestCreatedAt: TEST_NOW,
    replayed: false,
  };
}

function ownedRequest(): OwnedPayoutRequest {
  const result = mutationResult();
  return {
    request: {
      id: result.requestId,
      status: result.status,
      currency: result.currency,
      requestedAmountVnd: result.requestedAmountVnd,
      reservedAmountVnd: result.reservedAmountVnd,
      approvedAmountVnd: result.approvedAmountVnd,
      paidAmountVnd: result.paidAmountVnd,
      releasedAmountVnd: result.releasedAmountVnd,
      itemCount: result.itemCount,
      destination: result.destination,
      ownerReasonCode: null,
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
      approvedAt: null,
      processingAt: null,
      reviewRequiredAt: null,
      paidAt: null,
      rejectedAt: null,
      cancelledAt: null,
      failedAt: null,
    },
    items: [
      {
        id: "77777777-7777-4777-8777-777777777777",
        payoutRequestId: TEST_REQUEST_ID,
        conversionId: TEST_CONVERSION_ID,
        amountVnd: LARGE_MONEY,
        currency: "VND",
        conversionStatusSnapshot: "payable",
        reservedAt: TEST_NOW,
        releasedAt: null,
        paidAt: null,
        createdAt: TEST_NOW,
      },
    ],
    events: [
      {
        id: TEST_EVENT_ID,
        payoutRequestId: TEST_REQUEST_ID,
        sequenceNo: 1,
        eventType: "request_created",
        previousStatus: null,
        nextStatus: "requested",
        requestedAmountVnd: LARGE_MONEY,
        reservedAmountVnd: LARGE_MONEY,
        approvedAmountVnd: ZERO,
        paidAmountVnd: ZERO,
        releasedAmountVnd: ZERO,
        ownerReasonCode: null,
        createdAt: TEST_NOW,
      },
    ],
  };
}

function assertPayoutCode(
  action: () => unknown,
  expectedCode: string,
): void {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof PayoutApplicationError);
    assert.equal(error.code, expectedCode);
    return true;
  });
}

test("entry point preserves valid UUID idempotency keys exactly", () => {
  const create = parseCreatePayoutCommand({
    payoutAccountId: TEST_ACCOUNT_ID,
    idempotencyKey: TEST_IDEMPOTENCY_KEY,
  });
  const cancel = parsePayoutRequestCommand({
    payoutRequestId: TEST_REQUEST_ID,
    idempotencyKey: TEST_IDEMPOTENCY_KEY,
  });

  assert.equal(create.idempotencyKey, TEST_IDEMPOTENCY_KEY);
  assert.equal(cancel.idempotencyKey, TEST_IDEMPOTENCY_KEY);
});

test("entry point rejects unknown, repeated, and caller-controlled fields", () => {
  assertPayoutCode(
    () =>
      parseCreatePayoutCommand({
        payoutAccountId: TEST_ACCOUNT_ID,
        idempotencyKey: TEST_IDEMPOTENCY_KEY,
        amount: "1",
      }),
    "PAYOUT_INPUT_INVALID",
  );

  const repeated = new FormData();
  repeated.append("payoutRequestId", TEST_REQUEST_ID);
  repeated.append("payoutRequestId", TEST_REQUEST_ID);
  repeated.append("idempotencyKey", TEST_IDEMPOTENCY_KEY);
  assertPayoutCode(
    () => parsePayoutRequestCommand(repeated),
    "PAYOUT_INPUT_INVALID",
  );

  assertPayoutCode(
    () =>
      readPayoutFields(
        { actorId: TEST_REQUEST_ID, payoutRequestId: TEST_REQUEST_ID },
        ["payoutRequestId"] as const,
      ),
    "PAYOUT_INPUT_INVALID",
  );
});

test("entry point ignores only React action bookkeeping fields", () => {
  const form = new FormData();
  form.set("$ACTION_ID_test", "framework-owned");
  form.set("payoutRequestId", TEST_REQUEST_ID);
  form.set("idempotencyKey", TEST_IDEMPOTENCY_KEY);
  assert.deepEqual(parsePayoutRequestCommand(form), {
    payoutRequestId: TEST_REQUEST_ID,
    idempotencyKey: TEST_IDEMPOTENCY_KEY,
  });
});

test("entry point validates references and reasons through Phase 20M.1 rules", () => {
  assert.deepEqual(
    parseStartProcessingCommand({
      payoutRequestId: TEST_REQUEST_ID,
      idempotencyKey: TEST_IDEMPOTENCY_KEY,
      processorReference: "  processor-001  ",
    }),
    {
      payoutRequestId: TEST_REQUEST_ID,
      idempotencyKey: TEST_IDEMPOTENCY_KEY,
      processorReference: "processor-001",
    },
  );

  assertPayoutCode(
    () =>
      parseConfirmNonpaymentCommand({
        payoutRequestId: TEST_REQUEST_ID,
        idempotencyKey: TEST_IDEMPOTENCY_KEY,
        nonpaymentReference: "bad\u0000reference",
        reasonCode: "payment_not_completed",
        reason: "Confirmed non-payment",
      }),
    "PAYOUT_EVIDENCE_REFERENCE_INVALID",
  );
});

test("public projections preserve decimal strings and remove sensitive fields", () => {
  const mutation = toPublicPayoutMutation(mutationResult());
  const owned = toPublicOwnedPayoutRequest(ownedRequest());
  const serialized = JSON.stringify({ mutation, owned });

  assert.equal(mutation.requestedAmountVnd, LARGE_MONEY);
  assert.equal(typeof mutation.requestedAmountVnd, "string");
  assert.equal(owned.items[0]?.amountVnd, LARGE_MONEY);
  assert.equal(serialized.includes(TEST_CONVERSION_ID), false);
  assert.equal(serialized.includes(TEST_EVENT_ID), false);
  assert.equal(serialized.includes("PRIVATE ACCOUNT HOLDER"), false);
  assert.equal(serialized.includes("accountName"), false);
  assert.equal(serialized.includes("eventId"), false);
});

test("public error mapping is stable and never leaks database details", () => {
  assert.deepEqual(
    toPayoutPublicError(
      new PayoutApplicationError("PAYOUT_REQUEST_NOT_OWNED"),
    ).code,
    "PAYOUT_REQUEST_NOT_FOUND",
  );
  const unknown = toPayoutPublicError({
    message: "duplicate key violates payout_internal_constraint",
    details: "service-role evidence",
  });
  assert.equal(unknown.code, "PAYOUT_UNEXPECTED_ERROR");
  assert.equal(unknown.message.includes("constraint"), false);
  assert.equal(unknown.message.includes("service-role"), false);
});
