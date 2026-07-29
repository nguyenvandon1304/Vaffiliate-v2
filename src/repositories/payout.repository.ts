import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { mapPayoutError, PayoutApplicationError } from "@/lib/payout/errors";
import {
  mapPayoutEventSummary,
  mapPayoutMutationResult,
  mapPayoutRequestItem,
  mapPayoutRequestSummary,
  parsePayoutUuid,
} from "@/lib/payout/validation";
import type {
  CancelPayoutRequestInput,
  CreatePayoutRequestInput,
  OwnedPayoutRequest,
  PayoutMutationResult,
  PayoutRequestSummary,
} from "@/types/payout";

const REQUEST_COLUMNS = [
  "id",
  "status",
  "currency",
  "requested_amount_vnd",
  "reserved_amount_vnd",
  "approved_amount_vnd",
  "paid_amount_vnd",
  "released_amount_vnd",
  "item_count",
  "payout_method_snapshot",
  "provider_snapshot",
  "account_name_snapshot",
  "account_number_masked",
  "owner_reason_code",
  "created_at",
  "updated_at",
  "approved_at",
  "processing_at",
  "review_required_at",
  "paid_at",
  "rejected_at",
  "cancelled_at",
  "failed_at",
].join(",");

const ITEM_COLUMNS = [
  "id",
  "payout_request_id",
  "conversion_id",
  "amount_vnd",
  "currency",
  "conversion_status_snapshot",
  "reserved_at",
  "released_at",
  "paid_at",
  "created_at",
].join(",");

const EVENT_COLUMNS = [
  "id",
  "payout_request_id",
  "sequence_no",
  "event_type",
  "previous_status",
  "next_status",
  "requested_amount_vnd",
  "reserved_amount_vnd",
  "approved_amount_vnd",
  "paid_amount_vnd",
  "released_amount_vnd",
  "owner_reason_code",
  "created_at",
].join(",");

function throwQueryError(error: unknown): never {
  throw mapPayoutError(error);
}

export async function listOwnerPayoutRequestsWithClientAsync(
  client: SupabaseClient,
): Promise<readonly PayoutRequestSummary[]> {
  const { data, error } = await client
    .from("payout_requests_owner")
    .select(REQUEST_COLUMNS)
    .order("created_at", { ascending: false });

  if (error) throwQueryError(error);
  if (!Array.isArray(data)) {
    throw new PayoutApplicationError("PAYOUT_RESPONSE_INVALID");
  }
  return data.map(mapPayoutRequestSummary);
}

export async function loadOwnerPayoutRequestWithClientAsync(
  client: SupabaseClient,
  payoutRequestId: string,
): Promise<OwnedPayoutRequest> {
  const requestId = parsePayoutUuid(payoutRequestId);
  const requestResult = await client
    .from("payout_requests_owner")
    .select(REQUEST_COLUMNS)
    .eq("id", requestId)
    .maybeSingle();

  if (requestResult.error) throwQueryError(requestResult.error);
  if (!requestResult.data) {
    throw new PayoutApplicationError("PAYOUT_REQUEST_NOT_FOUND");
  }

  const [itemsResult, eventsResult] = await Promise.all([
    client
      .from("payout_request_items_owner")
      .select(ITEM_COLUMNS)
      .eq("payout_request_id", requestId)
      .order("reserved_at", { ascending: true }),
    client
      .from("payout_events_owner")
      .select(EVENT_COLUMNS)
      .eq("payout_request_id", requestId)
      .order("sequence_no", { ascending: true }),
  ]);

  if (itemsResult.error) throwQueryError(itemsResult.error);
  if (eventsResult.error) throwQueryError(eventsResult.error);
  if (!Array.isArray(itemsResult.data) || !Array.isArray(eventsResult.data)) {
    throw new PayoutApplicationError("PAYOUT_RESPONSE_INVALID");
  }

  return {
    request: mapPayoutRequestSummary(requestResult.data),
    items: itemsResult.data.map(mapPayoutRequestItem),
    events: eventsResult.data.map(mapPayoutEventSummary),
  };
}

export async function createPayoutRequestWithClientAsync(
  client: SupabaseClient,
  input: CreatePayoutRequestInput,
): Promise<PayoutMutationResult> {
  const payoutAccountId = parsePayoutUuid(input.payoutAccountId);
  const idempotencyKey = parsePayoutUuid(input.idempotencyKey);
  const { data, error } = await client.rpc("create_payout_request", {
    p_payout_account_id: payoutAccountId,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throwQueryError(error);
  return mapPayoutMutationResult(data);
}

export async function cancelPayoutRequestWithClientAsync(
  client: SupabaseClient,
  input: CancelPayoutRequestInput,
): Promise<PayoutMutationResult> {
  const payoutRequestId = parsePayoutUuid(input.payoutRequestId);
  const idempotencyKey = parsePayoutUuid(input.idempotencyKey);
  const { data, error } = await client.rpc("cancel_payout_request", {
    p_payout_request_id: payoutRequestId,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throwQueryError(error);
  return mapPayoutMutationResult(data);
}
