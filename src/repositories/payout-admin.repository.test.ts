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
} from "./payout-admin.repository";

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
