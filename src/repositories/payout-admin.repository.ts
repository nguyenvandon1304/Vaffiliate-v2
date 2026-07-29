import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppRole } from "@/lib/auth/roles";
import { mapPayoutError } from "@/lib/payout/errors";
import {
  mapPayoutMutationResult,
  parsePayoutReason,
  parsePayoutReasonCode,
  parsePayoutReference,
  parsePayoutUuid,
} from "@/lib/payout/validation";
import type {
  ConfirmPayoutNonpaymentInput,
  ConfirmPayoutPaymentInput,
  MarkPayoutReviewRequiredInput,
  PayoutMutationResult,
  PayoutTransitionInput,
  RejectPayoutRequestInput,
  StartPayoutProcessingInput,
} from "@/types/payout";

export interface TrustedPayoutAdminActor {
  readonly userId: string;
  readonly role: Extract<AppRole, "admin" | "super_admin">;
}

async function callPayoutRpc(
  client: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
): Promise<PayoutMutationResult> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw mapPayoutError(error);
  return mapPayoutMutationResult(data);
}

function transitionIds(input: PayoutTransitionInput) {
  return {
    payoutRequestId: parsePayoutUuid(input.payoutRequestId),
    idempotencyKey: parsePayoutUuid(input.idempotencyKey),
  };
}

export async function approvePayoutRequestWithClientAsync(
  client: SupabaseClient,
  actor: TrustedPayoutAdminActor,
  input: PayoutTransitionInput,
): Promise<PayoutMutationResult> {
  const ids = transitionIds(input);
  return callPayoutRpc(client, "approve_payout_request", {
    p_payout_request_id: ids.payoutRequestId,
    p_idempotency_key: ids.idempotencyKey,
    p_actor_user_id: parsePayoutUuid(actor.userId),
    p_actor_role: actor.role,
  });
}

export async function rejectPayoutRequestWithClientAsync(
  client: SupabaseClient,
  actor: TrustedPayoutAdminActor,
  input: RejectPayoutRequestInput,
): Promise<PayoutMutationResult> {
  const ids = transitionIds(input);
  return callPayoutRpc(client, "reject_payout_request", {
    p_payout_request_id: ids.payoutRequestId,
    p_idempotency_key: ids.idempotencyKey,
    p_actor_user_id: parsePayoutUuid(actor.userId),
    p_actor_role: actor.role,
    p_reason_code: parsePayoutReasonCode(input.reasonCode),
    p_reason: parsePayoutReason(input.reason),
  });
}

export async function startPayoutProcessingWithClientAsync(
  client: SupabaseClient,
  input: StartPayoutProcessingInput,
): Promise<PayoutMutationResult> {
  const ids = transitionIds(input);
  return callPayoutRpc(client, "start_payout_processing", {
    p_payout_request_id: ids.payoutRequestId,
    p_idempotency_key: ids.idempotencyKey,
    p_processor_reference: parsePayoutReference(input.processorReference),
  });
}

export async function markPayoutReviewRequiredWithClientAsync(
  client: SupabaseClient,
  input: MarkPayoutReviewRequiredInput,
): Promise<PayoutMutationResult> {
  const ids = transitionIds(input);
  return callPayoutRpc(client, "mark_payout_review_required", {
    p_payout_request_id: ids.payoutRequestId,
    p_idempotency_key: ids.idempotencyKey,
    p_uncertainty_code: parsePayoutReasonCode(input.uncertaintyCode),
    p_outcome_reference: parsePayoutReference(input.outcomeReference),
  });
}

export async function confirmPayoutPaymentWithClientAsync(
  client: SupabaseClient,
  input: ConfirmPayoutPaymentInput,
): Promise<PayoutMutationResult> {
  const ids = transitionIds(input);
  return callPayoutRpc(client, "complete_payout_request", {
    p_payout_request_id: ids.payoutRequestId,
    p_idempotency_key: ids.idempotencyKey,
    p_payment_reference: parsePayoutReference(input.paymentReference),
  });
}

export async function confirmPayoutNonpaymentWithClientAsync(
  client: SupabaseClient,
  input: ConfirmPayoutNonpaymentInput,
): Promise<PayoutMutationResult> {
  const ids = transitionIds(input);
  return callPayoutRpc(client, "confirm_payout_nonpayment", {
    p_payout_request_id: ids.payoutRequestId,
    p_idempotency_key: ids.idempotencyKey,
    p_nonpayment_reference: parsePayoutReference(input.nonpaymentReference),
    p_reason_code: parsePayoutReasonCode(input.reasonCode),
    p_reason: parsePayoutReason(input.reason),
  });
}
