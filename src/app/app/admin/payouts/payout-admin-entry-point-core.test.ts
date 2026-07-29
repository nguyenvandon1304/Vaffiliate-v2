import assert from "node:assert/strict";
import test from "node:test";

import { PayoutApplicationError } from "@/lib/payout/errors";
import {
  TEST_IDEMPOTENCY_KEY,
  TEST_REQUEST_ID,
  payoutRpcResponse,
} from "@/lib/payout/payout.test-helpers";
import { mapPayoutMutationResult } from "@/lib/payout/validation";
import type { PayoutMutationResult } from "@/types/payout";

import {
  ADMIN_PAYOUT_PATH,
  adminPayoutDetailPath,
  createPayoutAdminEntryPoint,
  type PayoutAdminEntryPointDependencies,
} from "./payout-admin-entry-point-core";
import {
  OWNER_PAYOUT_PATH,
  ownerPayoutDetailPath,
} from "../../payouts/payout-owner-entry-point-core";

const MUTATION: PayoutMutationResult = mapPayoutMutationResult(
  payoutRpcResponse(),
);

function dependencies(
  overrides: Partial<PayoutAdminEntryPointDependencies> = {},
): PayoutAdminEntryPointDependencies {
  return {
    async requireAdmin() {},
    service: {
      async approve() {
        return MUTATION;
      },
      async reject() {
        return MUTATION;
      },
      async startProcessing() {
        return MUTATION;
      },
      async markReviewRequired() {
        return MUTATION;
      },
      async confirmPayment() {
        return MUTATION;
      },
      async confirmNonpayment() {
        return MUTATION;
      },
    },
    revalidate() {},
    rethrow() {},
    ...overrides,
  };
}

test("admin entry point authorizes before parsing and service execution", async () => {
  const calls: string[] = [];
  const entryPoint = createPayoutAdminEntryPoint(
    dependencies({
      async requireAdmin(path) {
        calls.push(`auth:${path}`);
      },
      service: {
        async approve(input) {
          calls.push(`approve:${input.idempotencyKey}`);
          return MUTATION;
        },
        async reject() {
          throw new Error("unused");
        },
        async startProcessing() {
          throw new Error("unused");
        },
        async markReviewRequired() {
          throw new Error("unused");
        },
        async confirmPayment() {
          throw new Error("unused");
        },
        async confirmNonpayment() {
          throw new Error("unused");
        },
      },
    }),
  );

  await entryPoint.approve({
    payoutRequestId: TEST_REQUEST_ID,
    idempotencyKey: TEST_IDEMPOTENCY_KEY,
  });
  assert.deepEqual(calls, [
    `auth:${ADMIN_PAYOUT_PATH}`,
    `approve:${TEST_IDEMPOTENCY_KEY}`,
  ]);
});

test("admin entry point propagates authorization redirects and stops", async () => {
  const redirect = new Error("NEXT_REDIRECT");
  let serviceCalled = false;
  const entryPoint = createPayoutAdminEntryPoint(
    dependencies({
      async requireAdmin() {
        throw redirect;
      },
      service: {
        async approve() {
          serviceCalled = true;
          return MUTATION;
        },
        async reject() {
          throw new Error("unused");
        },
        async startProcessing() {
          throw new Error("unused");
        },
        async markReviewRequired() {
          throw new Error("unused");
        },
        async confirmPayment() {
          throw new Error("unused");
        },
        async confirmNonpayment() {
          throw new Error("unused");
        },
      },
      rethrow(error) {
        if (error === redirect) throw error;
      },
    }),
  );

  await assert.rejects(
    entryPoint.approve({
      payoutRequestId: TEST_REQUEST_ID,
      idempotencyKey: TEST_IDEMPOTENCY_KEY,
    }),
    (error) => error === redirect,
  );
  assert.equal(serviceCalled, false);
});

test("all six admin transitions are explicit and preserve exact payloads", async () => {
  const received: Array<readonly [string, unknown]> = [];
  const entryPoint = createPayoutAdminEntryPoint(
    dependencies({
      service: {
        async approve(input) {
          received.push(["approve", input]);
          return MUTATION;
        },
        async reject(input) {
          received.push(["reject", input]);
          return MUTATION;
        },
        async startProcessing(input) {
          received.push(["startProcessing", input]);
          return MUTATION;
        },
        async markReviewRequired(input) {
          received.push(["markReviewRequired", input]);
          return MUTATION;
        },
        async confirmPayment(input) {
          received.push(["confirmPayment", input]);
          return MUTATION;
        },
        async confirmNonpayment(input) {
          received.push(["confirmNonpayment", input]);
          return MUTATION;
        },
      },
    }),
  );
  const common = {
    payoutRequestId: TEST_REQUEST_ID,
    idempotencyKey: TEST_IDEMPOTENCY_KEY,
  };

  await entryPoint.approve(common);
  await entryPoint.reject({
    ...common,
    reasonCode: "request_rejected",
    reason: "Policy review rejected the request",
  });
  await entryPoint.startProcessing({
    ...common,
    processorReference: "processor-001",
  });
  await entryPoint.markReviewRequired({
    ...common,
    uncertaintyCode: "payment_under_review",
    outcomeReference: "outcome-001",
  });
  await entryPoint.confirmPayment({
    ...common,
    paymentReference: "payment-001",
  });
  await entryPoint.confirmNonpayment({
    ...common,
    nonpaymentReference: "nonpayment-001",
    reasonCode: "payment_not_completed",
    reason: "Processor confirmed non-payment",
  });

  assert.deepEqual(
    received.map(([operation]) => operation),
    [
      "approve",
      "reject",
      "startProcessing",
      "markReviewRequired",
      "confirmPayment",
      "confirmNonpayment",
    ],
  );
  for (const [, input] of received) {
    assert.equal(
      (input as { idempotencyKey: string }).idempotencyKey,
      TEST_IDEMPOTENCY_KEY,
    );
    assert.equal("actorId" in (input as object), false);
    assert.equal("status" in (input as object), false);
    assert.equal("amount" in (input as object), false);
  }
});

test("admin transition rejects caller actor/status fields before service call", async () => {
  let serviceCalled = false;
  const entryPoint = createPayoutAdminEntryPoint(
    dependencies({
      service: {
        async approve() {
          serviceCalled = true;
          return MUTATION;
        },
        async reject() {
          throw new Error("unused");
        },
        async startProcessing() {
          throw new Error("unused");
        },
        async markReviewRequired() {
          throw new Error("unused");
        },
        async confirmPayment() {
          throw new Error("unused");
        },
        async confirmNonpayment() {
          throw new Error("unused");
        },
      },
    }),
  );

  const result = await entryPoint.approve({
    payoutRequestId: TEST_REQUEST_ID,
    idempotencyKey: TEST_IDEMPOTENCY_KEY,
    actorId: TEST_REQUEST_ID,
    status: "paid",
  });
  assert.equal(result.ok, false);
  assert.equal(serviceCalled, false);
});

test("successful admin transition revalidates only exact payout paths", async () => {
  const revalidated: string[] = [];
  const entryPoint = createPayoutAdminEntryPoint(
    dependencies({ revalidate: (path) => revalidated.push(path) }),
  );

  await entryPoint.approve({
    payoutRequestId: TEST_REQUEST_ID,
    idempotencyKey: TEST_IDEMPOTENCY_KEY,
  });
  assert.deepEqual(revalidated, [
    ADMIN_PAYOUT_PATH,
    adminPayoutDetailPath(TEST_REQUEST_ID),
    OWNER_PAYOUT_PATH,
    ownerPayoutDetailPath(TEST_REQUEST_ID),
  ]);
});

test("admin service errors are sanitized and do not revalidate", async () => {
  const revalidated: string[] = [];
  const entryPoint = createPayoutAdminEntryPoint(
    dependencies({
      service: {
        async approve() {
          throw new PayoutApplicationError("PAYOUT_INVALID_TRANSITION");
        },
        async reject() {
          throw new Error("unused");
        },
        async startProcessing() {
          throw new Error("unused");
        },
        async markReviewRequired() {
          throw new Error("unused");
        },
        async confirmPayment() {
          throw new Error("unused");
        },
        async confirmNonpayment() {
          throw new Error("unused");
        },
      },
      revalidate: (path) => revalidated.push(path),
    }),
  );

  const result = await entryPoint.approve({
    payoutRequestId: TEST_REQUEST_ID,
    idempotencyKey: TEST_IDEMPOTENCY_KEY,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "PAYOUT_INVALID_TRANSITION");
  assert.deepEqual(revalidated, []);
});
