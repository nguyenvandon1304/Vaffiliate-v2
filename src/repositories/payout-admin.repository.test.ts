import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  TEST_ACTOR_ID,
  TEST_IDEMPOTENCY_KEY,
  TEST_REQUEST_ID,
  payoutRpcResponse,
} from "@/lib/payout/payout.test-helpers";

import {
  approvePayoutRequestWithClientAsync,
  confirmPayoutNonpaymentWithClientAsync,
  confirmPayoutPaymentWithClientAsync,
  markPayoutReviewRequiredWithClientAsync,
  rejectPayoutRequestWithClientAsync,
  startPayoutProcessingWithClientAsync,
  listPayoutRequestsForAdminWithClientAsync,
  getPayoutRequestForAdminWithClientAsync,
} from "./payout-admin.repository";

const adminReadRow = {
  id: TEST_REQUEST_ID,
  user_id: TEST_ACTOR_ID,
  status: "requested",
  currency: "VND",
  requested_amount_vnd: "100000",
  reserved_amount_vnd: "100000",
  approved_amount_vnd: "0",
  paid_amount_vnd: "0",
  released_amount_vnd: "0",
  item_count: 1,
  payout_method_snapshot: "bank",
  provider_snapshot: "Test Bank",
  account_name_snapshot: "TEST OWNER",
  account_number_masked: "1234",
  owner_reason_code: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

test("admin read RPCs preserve account name and pagination contract", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === "list_payout_requests_admin") {
        return { data: { items: [adminReadRow] }, error: null };
      }
      return { data: { request: adminReadRow, items: [], events: [] }, error: null };
    },
  } as unknown as SupabaseClient;

  const list = await listPayoutRequestsForAdminWithClientAsync(client, TEST_ACTOR_ID, {
    limit: 1,
    status: "requested",
    cursor: { createdAt: "2025-12-31T00:00:00.000Z", id: TEST_REQUEST_ID },
  });
  assert.equal(list.items[0]?.destination.accountName, "TEST OWNER");
  assert.deepEqual(calls[0]?.args, {
    p_actor_user_id: TEST_ACTOR_ID,
    p_status: "requested",
    p_cursor_created_at: "2025-12-31T00:00:00.000Z",
    p_cursor_id: TEST_REQUEST_ID,
    p_limit: 1,
  });

  const detail = await getPayoutRequestForAdminWithClientAsync(client, TEST_ACTOR_ID, TEST_REQUEST_ID);
  assert.equal(detail.request.destination.accountName, "TEST OWNER");
  assert.deepEqual(calls[1]?.args, {
    p_actor_user_id: TEST_ACTOR_ID,
    p_payout_request_id: TEST_REQUEST_ID,
  });
});

test("admin read mappers reject RPC payloads missing account_name_snapshot", async () => {
  const client = {
    async rpc(name: string) {
      const row = { ...adminReadRow };
      delete (row as Record<string, unknown>).account_name_snapshot;
      return { data: name === "list_payout_requests_admin" ? { items: [row] } : { request: row, items: [], events: [] }, error: null };
    },
  } as unknown as SupabaseClient;
  await assert.rejects(() => listPayoutRequestsForAdminWithClientAsync(client, TEST_ACTOR_ID, { limit: 25 }));
  await assert.rejects(() => getPayoutRequestForAdminWithClientAsync(client, TEST_ACTOR_ID, TEST_REQUEST_ID));
});

test("privileged repository calls the six exact RPCs with approved payloads", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return { data: payoutRpcResponse(), error: null };
    },
  } as unknown as SupabaseClient;
  const actor = { userId: TEST_ACTOR_ID, role: "admin" as const };
  const transition = {
    payoutRequestId: TEST_REQUEST_ID,
    idempotencyKey: TEST_IDEMPOTENCY_KEY,
  };

  await approvePayoutRequestWithClientAsync(client, actor, transition);
  await rejectPayoutRequestWithClientAsync(client, actor, {
    ...transition,
    reasonCode: "manual_rejection",
    reason: "Request evidence did not pass review.",
  });
  await startPayoutProcessingWithClientAsync(client, {
    ...transition,
    processorReference: " processor-reference ",
  });
  await markPayoutReviewRequiredWithClientAsync(client, {
    ...transition,
    uncertaintyCode: "processor_timeout",
    outcomeReference: " outcome-reference ",
  });
  await confirmPayoutPaymentWithClientAsync(client, {
    ...transition,
    paymentReference: " payment-reference ",
  });
  await confirmPayoutNonpaymentWithClientAsync(client, {
    ...transition,
    nonpaymentReference: " nonpayment-reference ",
    reasonCode: "confirmed_not_paid",
    reason: "Provider confirmed no payment.",
  });

  assert.deepEqual(calls.map((call) => call.name), [
    "approve_payout_request",
    "reject_payout_request",
    "start_payout_processing",
    "mark_payout_review_required",
    "complete_payout_request",
    "confirm_payout_nonpayment",
  ]);
  assert.deepEqual(calls[0]!.args, {
    p_payout_request_id: TEST_REQUEST_ID,
    p_idempotency_key: TEST_IDEMPOTENCY_KEY,
    p_actor_user_id: TEST_ACTOR_ID,
    p_actor_role: "admin",
  });
  assert.equal("p_actor_user_id" in calls[2]!.args, false);
  assert.equal(calls[2]!.args.p_processor_reference, "processor-reference");
  assert.equal(calls[3]!.args.p_outcome_reference, "outcome-reference");
  assert.equal(calls[4]!.args.p_payment_reference, "payment-reference");
  assert.equal(
    calls[5]!.args.p_nonpayment_reference,
    "nonpayment-reference",
  );
});
