import assert from "node:assert/strict";
import test from "node:test";

import { PayoutApplicationError } from "@/lib/payout/errors";
import {
  TEST_ACCOUNT_ID,
  TEST_IDEMPOTENCY_KEY,
  TEST_REQUEST_ID,
  payoutRpcResponse,
} from "@/lib/payout/payout.test-helpers";
import { mapPayoutMutationResult } from "@/lib/payout/validation";
import type {
  OwnedPayoutRequest,
  PayoutMutationResult,
  PayoutRequestSummary,
} from "@/types/payout";

import {
  createPayoutOwnerEntryPoint,
  OWNER_PAYOUT_PATH,
  ownerPayoutDetailPath,
  type PayoutOwnerEntryPointDependencies,
} from "./payout-owner-entry-point-core";

const MUTATION: PayoutMutationResult = mapPayoutMutationResult(
  payoutRpcResponse(),
);

function dependencies(
  overrides: Partial<PayoutOwnerEntryPointDependencies> = {},
): PayoutOwnerEntryPointDependencies {
  return {
    async requireUser() {},
    service: {
      async listRequests() {
        return [] as readonly PayoutRequestSummary[];
      },
      async loadRequest() {
        return {} as OwnedPayoutRequest;
      },
      async createRequest() {
        return MUTATION;
      },
      async cancelRequest() {
        return MUTATION;
      },
    },
    revalidate() {},
    rethrow() {},
    ...overrides,
  };
}

test("owner entry point authenticates before parsing or calling the service", async () => {
  const calls: string[] = [];
  const entryPoint = createPayoutOwnerEntryPoint(
    dependencies({
      async requireUser(path) {
        calls.push(`auth:${path}`);
      },
      service: {
        async listRequests() {
          throw new Error("unused");
        },
        async loadRequest() {
          throw new Error("unused");
        },
        async createRequest(input) {
          calls.push(`service:${input.idempotencyKey}`);
          return MUTATION;
        },
        async cancelRequest() {
          throw new Error("unused");
        },
      },
    }),
  );

  await entryPoint.createRequest({
    payoutAccountId: TEST_ACCOUNT_ID,
    idempotencyKey: TEST_IDEMPOTENCY_KEY,
  });
  assert.deepEqual(calls, [
    `auth:${OWNER_PAYOUT_PATH}`,
    `service:${TEST_IDEMPOTENCY_KEY}`,
  ]);
});

test("owner entry point propagates framework redirect errors and stops", async () => {
  const redirect = new Error("NEXT_REDIRECT");
  let serviceCalled = false;
  const entryPoint = createPayoutOwnerEntryPoint(
    dependencies({
      async requireUser() {
        throw redirect;
      },
      service: {
        async listRequests() {
          serviceCalled = true;
          return [];
        },
        async loadRequest() {
          throw new Error("unused");
        },
        async createRequest() {
          throw new Error("unused");
        },
        async cancelRequest() {
          throw new Error("unused");
        },
      },
      rethrow(error) {
        if (error === redirect) throw error;
      },
    }),
  );

  await assert.rejects(entryPoint.listRequests(), (error) => error === redirect);
  assert.equal(serviceCalled, false);
});

test("owner entry point refuses caller-controlled money before service call", async () => {
  let serviceCalled = false;
  const entryPoint = createPayoutOwnerEntryPoint(
    dependencies({
      service: {
        async listRequests() {
          return [];
        },
        async loadRequest() {
          throw new Error("unused");
        },
        async createRequest() {
          serviceCalled = true;
          return MUTATION;
        },
        async cancelRequest() {
          throw new Error("unused");
        },
      },
    }),
  );

  const result = await entryPoint.createRequest({
    payoutAccountId: TEST_ACCOUNT_ID,
    idempotencyKey: TEST_IDEMPOTENCY_KEY,
    amount: "999",
  });
  assert.deepEqual(result.ok, false);
  assert.equal(serviceCalled, false);
});

test("owner mutations revalidate exact payout paths only after success", async () => {
  const revalidated: string[] = [];
  const entryPoint = createPayoutOwnerEntryPoint(
    dependencies({ revalidate: (path) => revalidated.push(path) }),
  );

  await entryPoint.createRequest({
    payoutAccountId: TEST_ACCOUNT_ID,
    idempotencyKey: TEST_IDEMPOTENCY_KEY,
  });
  await entryPoint.cancelRequest({
    payoutRequestId: TEST_REQUEST_ID,
    idempotencyKey: TEST_IDEMPOTENCY_KEY,
  });

  assert.deepEqual(revalidated, [
    OWNER_PAYOUT_PATH,
    OWNER_PAYOUT_PATH,
    ownerPayoutDetailPath(TEST_REQUEST_ID),
  ]);
});

test("owner service failure is sanitized and never revalidates", async () => {
  const revalidated: string[] = [];
  const entryPoint = createPayoutOwnerEntryPoint(
    dependencies({
      service: {
        async listRequests() {
          return [];
        },
        async loadRequest() {
          throw new Error("unused");
        },
        async createRequest() {
          throw new PayoutApplicationError("PAYOUT_ACCOUNT_NOT_OWNED");
        },
        async cancelRequest() {
          throw new Error("unused");
        },
      },
      revalidate: (path) => revalidated.push(path),
    }),
  );

  const result = await entryPoint.createRequest({
    payoutAccountId: TEST_ACCOUNT_ID,
    idempotencyKey: TEST_IDEMPOTENCY_KEY,
  });
  assert.deepEqual(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "PAYOUT_ACCOUNT_INVALID");
  assert.deepEqual(revalidated, []);
});
