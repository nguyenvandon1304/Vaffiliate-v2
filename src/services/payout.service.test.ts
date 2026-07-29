import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AuthorizedUser } from "@/lib/auth/server-guard";
import { PayoutApplicationError } from "@/lib/payout/errors";
import {
  TEST_ACCOUNT_ID,
  TEST_ACTOR_ID,
  TEST_IDEMPOTENCY_KEY,
  TEST_REQUEST_ID,
} from "@/lib/payout/payout.test-helpers";
import type { PayoutMutationResult } from "@/types/payout";

import { createPayoutAdminService } from "./payout-admin.service-core";
import { createPayoutOwnerService } from "./payout-owner.service-core";

const RESULT = {} as PayoutMutationResult;
const CLIENT = {} as SupabaseClient;

function actor(role: AuthorizedUser["role"]): AuthorizedUser {
  return {
    userId: TEST_ACTOR_ID,
    email: null,
    role,
    claims: {},
  };
}

test("owner service authenticates first and strips caller user/money fields", async () => {
  const calls: string[] = [];
  let repositoryInput: unknown;
  const service = createPayoutOwnerService({
    async requireUser() {
      calls.push("requireUser");
      return actor("user");
    },
    async createClient() {
      calls.push("createClient");
      return CLIENT;
    },
    repository: {
      async list() {
        return [];
      },
      async load() {
        throw new Error("unused");
      },
      async create(_client, input) {
        calls.push("repository.create");
        repositoryInput = input;
        return RESULT;
      },
      async cancel() {
        return RESULT;
      },
    },
  });

  await service.createRequest({
    payoutAccountId: TEST_ACCOUNT_ID,
    idempotencyKey: TEST_IDEMPOTENCY_KEY,
    userId: "attacker-controlled",
    amount: 999,
  } as never);

  assert.deepEqual(calls, ["requireUser", "createClient", "repository.create"]);
  assert.deepEqual(repositoryInput, {
    payoutAccountId: TEST_ACCOUNT_ID,
    idempotencyKey: TEST_IDEMPOTENCY_KEY,
  });
});

test("owner create and cancel forward idempotency UUIDs unchanged", async () => {
  const forwarded: string[] = [];
  const service = createPayoutOwnerService({
    async requireUser() {
      return actor("user");
    },
    async createClient() {
      return CLIENT;
    },
    repository: {
      async list() {
        return [];
      },
      async load() {
        throw new Error("unused");
      },
      async create(_client, input) {
        forwarded.push(input.idempotencyKey);
        return RESULT;
      },
      async cancel(_client, input) {
        forwarded.push(input.idempotencyKey);
        return RESULT;
      },
    },
  });

  await service.createRequest({
    payoutAccountId: TEST_ACCOUNT_ID,
    idempotencyKey: TEST_IDEMPOTENCY_KEY,
  });
  await service.cancelRequest({
    payoutRequestId: TEST_REQUEST_ID,
    idempotencyKey: TEST_IDEMPOTENCY_KEY,
  });
  assert.deepEqual(forwarded, [TEST_IDEMPOTENCY_KEY, TEST_IDEMPOTENCY_KEY]);
});

test("privileged service authorizes before service-role client creation", async () => {
  const calls: string[] = [];
  const service = createPayoutAdminService({
    async requireAdmin() {
      calls.push("requireAdmin");
      return actor("admin");
    },
    createServiceRoleClient() {
      calls.push("createServiceRoleClient");
      return CLIENT;
    },
    repository: {
      async approve(_client, trustedActor) {
        calls.push(`approve:${trustedActor.userId}:${trustedActor.role}`);
        return RESULT;
      },
      async reject() {
        return RESULT;
      },
      async startProcessing() {
        return RESULT;
      },
      async markReviewRequired() {
        return RESULT;
      },
      async confirmPayment() {
        return RESULT;
      },
      async confirmNonpayment() {
        return RESULT;
      },
    },
  });

  await service.approve({
    payoutRequestId: TEST_REQUEST_ID,
    idempotencyKey: TEST_IDEMPOTENCY_KEY,
    actorUserId: "attacker-controlled",
    actorRole: "super_admin",
  } as never);
  assert.deepEqual(calls, [
    "requireAdmin",
    "createServiceRoleClient",
    `approve:${TEST_ACTOR_ID}:admin`,
  ]);
});

test("privileged service fails closed before constructing service-role client", async () => {
  let clientCreated = false;
  const service = createPayoutAdminService({
    async requireAdmin() {
      return actor("user");
    },
    createServiceRoleClient() {
      clientCreated = true;
      return CLIENT;
    },
    repository: {
      async approve() {
        return RESULT;
      },
      async reject() {
        return RESULT;
      },
      async startProcessing() {
        return RESULT;
      },
      async markReviewRequired() {
        return RESULT;
      },
      async confirmPayment() {
        return RESULT;
      },
      async confirmNonpayment() {
        return RESULT;
      },
    },
  });

  await assert.rejects(
    service.approve({
      payoutRequestId: TEST_REQUEST_ID,
      idempotencyKey: TEST_IDEMPOTENCY_KEY,
    }),
    (error) =>
      error instanceof PayoutApplicationError &&
      error.code === "PAYOUT_AUTHORIZATION_REQUIRED",
  );
  assert.equal(clientCreated, false);
});

test("service-role credential module is server-only and absent from browser client", () => {
  const serviceRoleSource = readFileSync(
    "src/lib/supabase/service-role.server.ts",
    "utf8",
  );
  const browserSource = readFileSync("src/lib/supabase/client.ts", "utf8");
  assert.match(serviceRoleSource, /import "server-only"/);
  assert.match(serviceRoleSource, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(browserSource, /SUPABASE_SERVICE_ROLE_KEY/);
});
