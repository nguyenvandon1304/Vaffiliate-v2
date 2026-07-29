import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  TEST_ACCOUNT_ID,
  TEST_IDEMPOTENCY_KEY,
  TEST_REQUEST_ID,
  payoutEventViewRow,
  payoutItemViewRow,
  payoutRequestViewRow,
  payoutRpcResponse,
} from "@/lib/payout/payout.test-helpers";

import {
  cancelPayoutRequestWithClientAsync,
  createPayoutRequestWithClientAsync,
  listOwnerPayoutRequestsWithClientAsync,
  loadOwnerPayoutRequestWithClientAsync,
} from "./payout.repository";

interface QueryCall {
  readonly relation: string;
  readonly columns: string;
  readonly filters: ReadonlyArray<readonly [string, unknown]>;
  readonly order: readonly [string, boolean] | null;
}

function viewClient(
  values: Readonly<Record<string, unknown>>,
  calls: QueryCall[],
): SupabaseClient {
  return {
    from(relation: string) {
      let columns = "";
      const filters: Array<readonly [string, unknown]> = [];
      let order: readonly [string, boolean] | null = null;
      const result = () => ({ data: values[relation] ?? null, error: null });
      const builder = {
        select(value: string) {
          columns = value;
          return builder;
        },
        eq(column: string, value: unknown) {
          filters.push([column, value]);
          return builder;
        },
        order(column: string, options: { ascending: boolean }) {
          order = [column, options.ascending];
          return builder;
        },
        maybeSingle() {
          calls.push({ relation, columns, filters: [...filters], order });
          return Promise.resolve(result());
        },
        then<TResult1 = unknown, TResult2 = never>(
          onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ) {
          calls.push({ relation, columns, filters: [...filters], order });
          return Promise.resolve(result()).then(onfulfilled, onrejected);
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

test("owner repository reads only owner-safe projections", async () => {
  const calls: QueryCall[] = [];
  const client = viewClient(
    {
      payout_requests_owner: [payoutRequestViewRow()],
    },
    calls,
  );
  const requests = await listOwnerPayoutRequestsWithClientAsync(client);
  assert.equal(requests.length, 1);
  assert.deepEqual(calls.map((call) => call.relation), ["payout_requests_owner"]);
  assert.equal(calls[0]!.columns.includes("account_number_snapshot"), false);
  assert.equal(calls[0]!.columns.includes("destination_fingerprint"), false);
});

test("owned request detail loads safe request, item, and event projections", async () => {
  const calls: QueryCall[] = [];
  const client = viewClient(
    {
      payout_requests_owner: payoutRequestViewRow(),
      payout_request_items_owner: [payoutItemViewRow()],
      payout_events_owner: [payoutEventViewRow()],
    },
    calls,
  );
  const detail = await loadOwnerPayoutRequestWithClientAsync(
    client,
    TEST_REQUEST_ID,
  );
  assert.equal(detail.items.length, 1);
  assert.equal(detail.events.length, 1);
  assert.deepEqual(
    calls.map((call) => call.relation).sort(),
    [
      "payout_events_owner",
      "payout_request_items_owner",
      "payout_requests_owner",
    ],
  );
});

test("create and cancel use exact authenticated RPC payloads", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return { data: payoutRpcResponse(), error: null };
    },
  } as unknown as SupabaseClient;

  await createPayoutRequestWithClientAsync(client, {
    payoutAccountId: TEST_ACCOUNT_ID,
    idempotencyKey: TEST_IDEMPOTENCY_KEY,
  });
  await cancelPayoutRequestWithClientAsync(client, {
    payoutRequestId: TEST_REQUEST_ID,
    idempotencyKey: TEST_IDEMPOTENCY_KEY,
  });

  assert.deepEqual(calls, [
    {
      name: "create_payout_request",
      args: {
        p_payout_account_id: TEST_ACCOUNT_ID,
        p_idempotency_key: TEST_IDEMPOTENCY_KEY,
      },
    },
    {
      name: "cancel_payout_request",
      args: {
        p_payout_request_id: TEST_REQUEST_ID,
        p_idempotency_key: TEST_IDEMPOTENCY_KEY,
      },
    },
  ]);
});
