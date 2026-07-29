import {
  PAYOUT_EVENT_TYPES,
  PAYOUT_OWNER_REASON_CODES,
  PAYOUT_STATUSES,
  type DecimalVndString,
  type MaskedPayoutDestination,
  type PayoutEventSummary,
  type PayoutEventType,
  type PayoutMutationResult,
  type PayoutOwnerReasonCode,
  type PayoutRequestItem,
  type PayoutRequestSummary,
  type PayoutStatus,
  type VerifiedPayoutAccountOption,
} from "@/types/payout";

import { PayoutApplicationError } from "./errors";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DECIMAL_VND_PATTERN = /^(0|[1-9][0-9]*)$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

type UnknownRecord = Record<string, unknown>;

function invalidResponse(): never {
  throw new PayoutApplicationError("PAYOUT_RESPONSE_INVALID");
}

function record(value: unknown): UnknownRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    invalidResponse();
  }
  return value as UnknownRecord;
}

export function parsePayoutUuid(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new PayoutApplicationError("PAYOUT_INPUT_INVALID");
  }
  return value;
}

function responseUuid(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) invalidResponse();
  return value;
}

export function isDecimalVndString(value: unknown): value is DecimalVndString {
  return typeof value === "string" && DECIMAL_VND_PATTERN.test(value);
}

export function parseDecimalVndString(value: unknown): DecimalVndString {
  if (!isDecimalVndString(value)) invalidResponse();
  return value;
}

function payoutStatus(value: unknown): PayoutStatus {
  if (
    typeof value !== "string" ||
    !(PAYOUT_STATUSES as readonly string[]).includes(value)
  ) {
    invalidResponse();
  }
  return value as PayoutStatus;
}

function nullablePayoutStatus(value: unknown): PayoutStatus | null {
  return value === null ? null : payoutStatus(value);
}

function payoutEventType(value: unknown): PayoutEventType {
  if (
    typeof value !== "string" ||
    !(PAYOUT_EVENT_TYPES as readonly string[]).includes(value)
  ) {
    invalidResponse();
  }
  return value as PayoutEventType;
}

function ownerReasonCode(value: unknown): PayoutOwnerReasonCode | null {
  if (value === null) return null;
  if (
    typeof value !== "string" ||
    !(PAYOUT_OWNER_REASON_CODES as readonly string[]).includes(value)
  ) {
    invalidResponse();
  }
  return value as PayoutOwnerReasonCode;
}

function timestamp(value: unknown): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    invalidResponse();
  }
  return value;
}

function nullableTimestamp(value: unknown): string | null {
  return value === null ? null : timestamp(value);
}

function integer(value: unknown, minimum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    invalidResponse();
  }
  return value as number;
}

function vndCurrency(value: unknown): "VND" {
  if (value !== "VND") invalidResponse();
  return "VND";
}

function safeText(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    invalidResponse();
  }
  return value;
}

function maskedDestinationFromView(row: UnknownRecord): MaskedPayoutDestination {
  if (row.payout_method_snapshot !== "bank") invalidResponse();
  const masked = safeText(row.account_number_masked);
  if (masked.length !== 4) invalidResponse();
  return {
    method: "bank",
    provider: safeText(row.provider_snapshot),
    accountName: safeText(row.account_name_snapshot),
    accountNumberMasked: masked,
  };
}

function maskedDestinationFromRpc(value: unknown): MaskedPayoutDestination {
  const row = record(value);
  if (row.method !== "bank") invalidResponse();
  const masked = safeText(row.accountNumberMasked);
  if (masked.length !== 4) invalidResponse();
  return {
    method: "bank",
    provider: safeText(row.provider),
    accountName: safeText(row.accountName),
    accountNumberMasked: masked,
  };
}

export function mapVerifiedPayoutAccountOption(
  value: unknown,
): VerifiedPayoutAccountOption {
  const row = record(value);
  if (row.method !== "bank" || row.status !== "verified") invalidResponse();
  const accountNumber = safeText(row.account_number).trim();
  const providerLabel = safeText(row.provider).trim();
  if (!/^\d{6,34}$/.test(accountNumber)) invalidResponse();
  if (providerLabel.length > 120) invalidResponse();

  return {
    payoutAccountId: responseUuid(row.id),
    method: "bank",
    providerLabel,
    maskedDestination: `****${accountNumber.slice(-4)}`,
    verification: "verified",
  };
}

export function mapPayoutRequestSummary(value: unknown): PayoutRequestSummary {
  const row = record(value);
  return {
    id: responseUuid(row.id),
    status: payoutStatus(row.status),
    currency: vndCurrency(row.currency),
    requestedAmountVnd: parseDecimalVndString(row.requested_amount_vnd),
    reservedAmountVnd: parseDecimalVndString(row.reserved_amount_vnd),
    approvedAmountVnd: parseDecimalVndString(row.approved_amount_vnd),
    paidAmountVnd: parseDecimalVndString(row.paid_amount_vnd),
    releasedAmountVnd: parseDecimalVndString(row.released_amount_vnd),
    itemCount: integer(row.item_count, 1),
    destination: maskedDestinationFromView(row),
    ownerReasonCode: ownerReasonCode(row.owner_reason_code),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    approvedAt: nullableTimestamp(row.approved_at),
    processingAt: nullableTimestamp(row.processing_at),
    reviewRequiredAt: nullableTimestamp(row.review_required_at),
    paidAt: nullableTimestamp(row.paid_at),
    rejectedAt: nullableTimestamp(row.rejected_at),
    cancelledAt: nullableTimestamp(row.cancelled_at),
    failedAt: nullableTimestamp(row.failed_at),
  };
}

export function mapPayoutRequestItem(value: unknown): PayoutRequestItem {
  const row = record(value);
  if (row.conversion_status_snapshot !== "payable") invalidResponse();
  return {
    id: responseUuid(row.id),
    payoutRequestId: responseUuid(row.payout_request_id),
    conversionId: responseUuid(row.conversion_id),
    amountVnd: parseDecimalVndString(row.amount_vnd),
    currency: vndCurrency(row.currency),
    conversionStatusSnapshot: "payable",
    reservedAt: timestamp(row.reserved_at),
    releasedAt: nullableTimestamp(row.released_at),
    paidAt: nullableTimestamp(row.paid_at),
    createdAt: timestamp(row.created_at),
  };
}

export function mapPayoutEventSummary(value: unknown): PayoutEventSummary {
  const row = record(value);
  return {
    id: responseUuid(row.id),
    payoutRequestId: responseUuid(row.payout_request_id),
    sequenceNo: integer(row.sequence_no, 1),
    eventType: payoutEventType(row.event_type),
    previousStatus: nullablePayoutStatus(row.previous_status),
    nextStatus: payoutStatus(row.next_status),
    requestedAmountVnd: parseDecimalVndString(row.requested_amount_vnd),
    reservedAmountVnd: parseDecimalVndString(row.reserved_amount_vnd),
    approvedAmountVnd: parseDecimalVndString(row.approved_amount_vnd),
    paidAmountVnd: parseDecimalVndString(row.paid_amount_vnd),
    releasedAmountVnd: parseDecimalVndString(row.released_amount_vnd),
    ownerReasonCode: ownerReasonCode(row.owner_reason_code),
    createdAt: timestamp(row.created_at),
  };
}

export function mapPayoutMutationResult(value: unknown): PayoutMutationResult {
  const row = record(value);
  if (typeof row.replayed !== "boolean") invalidResponse();
  return {
    requestId: responseUuid(row.requestId),
    status: payoutStatus(row.status),
    currency: vndCurrency(row.currency),
    requestedAmountVnd: parseDecimalVndString(row.requestedAmountVnd),
    reservedAmountVnd: parseDecimalVndString(row.reservedAmountVnd),
    approvedAmountVnd: parseDecimalVndString(row.approvedAmountVnd),
    paidAmountVnd: parseDecimalVndString(row.paidAmountVnd),
    releasedAmountVnd: parseDecimalVndString(row.releasedAmountVnd),
    itemCount: integer(row.itemCount, 1),
    destination: maskedDestinationFromRpc(row.payoutAccount),
    ownerReasonCode: ownerReasonCode(row.ownerReasonCode),
    eventId: responseUuid(row.eventId),
    eventCreatedAt: timestamp(row.eventCreatedAt),
    requestCreatedAt: timestamp(row.requestCreatedAt),
    replayed: row.replayed,
  };
}

export function parsePayoutReference(value: unknown): string {
  if (typeof value !== "string") {
    throw new PayoutApplicationError("PAYOUT_INPUT_INVALID");
  }
  const trimmed = value.trim();
  if (
    trimmed.length < 1 ||
    trimmed.length > 200 ||
    CONTROL_CHARACTER_PATTERN.test(trimmed)
  ) {
    throw new PayoutApplicationError("PAYOUT_EVIDENCE_REFERENCE_INVALID");
  }
  return trimmed;
}

export function parsePayoutReasonCode(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z0-9_]{1,64}$/.test(value.trim())) {
    throw new PayoutApplicationError("PAYOUT_REASON_REQUIRED");
  }
  return value.trim();
}

export function parsePayoutReason(value: unknown): string {
  if (typeof value !== "string") {
    throw new PayoutApplicationError("PAYOUT_REASON_REQUIRED");
  }
  const trimmed = value.trim();
  if (
    trimmed.length < 1 ||
    trimmed.length > 500 ||
    CONTROL_CHARACTER_PATTERN.test(trimmed)
  ) {
    throw new PayoutApplicationError("PAYOUT_REASON_REQUIRED");
  }
  return trimmed;
}
