/**
 * Phase 20M.2 -- shared payout entry-point contract.
 *
 * This module is the ONLY place where a Next.js server entry point is
 * allowed to translate between untrusted request input and the approved
 * Phase 20M.1 service surface. It owns three responsibilities and
 * nothing else:
 *
 *   1. Strict input parsing. Every command has a closed field
 *      allowlist. Unknown fields, duplicated fields, missing fields,
 *      non-string values, and the explicitly forbidden
 *      caller-controlled fields (user id, owner id, actor id, amount,
 *      status, audit payload, service-role option, raw account
 *      details) are refused before any service is reached.
 *   2. Public projection. Service DTOs are re-projected field by
 *      field so internal identifiers (event id, conversion id,
 *      payout request id on nested rows) and owner PII (account
 *      holder name) can never reach a response by accident. Money
 *      stays a decimal string end to end -- there is no Number,
 *      bigint, parseInt, or parseFloat path in this file.
 *   3. Error sanitization. Every Phase 20M.1 error code, plus any
 *      unexpected throw, is collapsed onto a small stable public
 *      vocabulary with a safe message. Postgres text, SQLSTATE
 *      details, Supabase error objects, table and function names,
 *      constraint names, actor ids, internal reasons, and processor
 *      evidence never appear in the result.
 *
 * The module is deliberately framework-free and side-effect-free so
 * it can be unit tested without a request scope. Validation is reused
 * from `./validation` (Phase 20M.1) rather than reimplemented, so
 * there is exactly one UUID rule, one reference rule, one reason
 * rule, and one decimal-string rule in the codebase.
 */

import type {
  DecimalVndString,
  OwnedPayoutRequest,
  PayoutEventType,
  PayoutMutationResult,
  PayoutOwnerReasonCode,
  PayoutRequestSummary,
  PayoutStatus,
} from "@/types/payout";

import { PayoutApplicationError, type PayoutErrorCode } from "./errors";
import {
  parsePayoutReason,
  parsePayoutReasonCode,
  parsePayoutReference,
  parsePayoutUuid,
} from "./validation";

/* ------------------------------------------------------------------ *
 * Public result envelope
 * ------------------------------------------------------------------ */

export const PAYOUT_PUBLIC_ERROR_CODES = [
  "PAYOUT_AUTH_REQUIRED",
  "PAYOUT_FORBIDDEN",
  "PAYOUT_INPUT_INVALID",
  "PAYOUT_REQUEST_NOT_FOUND",
  "PAYOUT_ACCOUNT_INVALID",
  "PAYOUT_NO_WITHDRAWABLE_CONVERSIONS",
  "PAYOUT_INVALID_TRANSITION",
  "PAYOUT_IDEMPOTENCY_CONFLICT",
  "PAYOUT_STATE_CONFLICT",
  "PAYOUT_REASON_REQUIRED",
  "PAYOUT_REFERENCE_INVALID",
  "PAYOUT_UNEXPECTED_ERROR",
] as const;

export type PayoutPublicErrorCode = (typeof PAYOUT_PUBLIC_ERROR_CODES)[number];

export interface PayoutPublicError {
  readonly code: PayoutPublicErrorCode;
  readonly message: string;
}

export type PayoutEntryPointResult<TData> =
  | { readonly ok: true; readonly data: TData }
  | { readonly ok: false; readonly error: PayoutPublicError };

/* ------------------------------------------------------------------ *
 * Public projections
 * ------------------------------------------------------------------ */

/**
 * Masked destination without the account holder name. The provider
 * plus the last four digits identify the destination for both the
 * owner and an administrator; the holder name is owner PII that no
 * payout entry point needs to echo back.
 */
export interface PublicPayoutDestination {
  readonly method: "bank";
  readonly provider: string;
  readonly accountNumberMasked: string;
}

export interface PublicPayoutRequestSummary {
  readonly id: string;
  readonly status: PayoutStatus;
  readonly currency: "VND";
  readonly requestedAmountVnd: DecimalVndString;
  readonly reservedAmountVnd: DecimalVndString;
  readonly approvedAmountVnd: DecimalVndString;
  readonly paidAmountVnd: DecimalVndString;
  readonly releasedAmountVnd: DecimalVndString;
  readonly itemCount: number;
  readonly destination: PublicPayoutDestination;
  readonly ownerReasonCode: PayoutOwnerReasonCode | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly approvedAt: string | null;
  readonly processingAt: string | null;
  readonly reviewRequiredAt: string | null;
  readonly paidAt: string | null;
  readonly rejectedAt: string | null;
  readonly cancelledAt: string | null;
  readonly failedAt: string | null;
}

/** No `conversionId`, no `payoutRequestId`, no status snapshot. */
export interface PublicPayoutRequestItem {
  readonly id: string;
  readonly amountVnd: DecimalVndString;
  readonly currency: "VND";
  readonly reservedAt: string;
  readonly releasedAt: string | null;
  readonly paidAt: string | null;
  readonly createdAt: string;
}

/** No event id, no `payoutRequestId`. The sequence number is enough. */
export interface PublicPayoutEvent {
  readonly sequenceNo: number;
  readonly eventType: PayoutEventType;
  readonly previousStatus: PayoutStatus | null;
  readonly nextStatus: PayoutStatus;
  readonly requestedAmountVnd: DecimalVndString;
  readonly reservedAmountVnd: DecimalVndString;
  readonly approvedAmountVnd: DecimalVndString;
  readonly paidAmountVnd: DecimalVndString;
  readonly releasedAmountVnd: DecimalVndString;
  readonly ownerReasonCode: PayoutOwnerReasonCode | null;
  readonly createdAt: string;
}

export interface PublicOwnedPayoutRequest {
  readonly request: PublicPayoutRequestSummary;
  readonly items: readonly PublicPayoutRequestItem[];
  readonly events: readonly PublicPayoutEvent[];
}

/** No event id, no event timestamp, no actor, no evidence. */
export interface PublicPayoutMutation {
  readonly requestId: string;
  readonly status: PayoutStatus;
  readonly currency: "VND";
  readonly requestedAmountVnd: DecimalVndString;
  readonly reservedAmountVnd: DecimalVndString;
  readonly approvedAmountVnd: DecimalVndString;
  readonly paidAmountVnd: DecimalVndString;
  readonly releasedAmountVnd: DecimalVndString;
  readonly itemCount: number;
  readonly destination: PublicPayoutDestination;
  readonly ownerReasonCode: PayoutOwnerReasonCode | null;
  readonly requestCreatedAt: string;
  readonly replayed: boolean;
}

function publicDestination(
  destination: PayoutRequestSummary["destination"],
): PublicPayoutDestination {
  return {
    method: destination.method,
    provider: destination.provider,
    accountNumberMasked: destination.accountNumberMasked,
  };
}

export function toPublicPayoutRequestSummary(
  summary: PayoutRequestSummary,
): PublicPayoutRequestSummary {
  return {
    id: summary.id,
    status: summary.status,
    currency: summary.currency,
    requestedAmountVnd: summary.requestedAmountVnd,
    reservedAmountVnd: summary.reservedAmountVnd,
    approvedAmountVnd: summary.approvedAmountVnd,
    paidAmountVnd: summary.paidAmountVnd,
    releasedAmountVnd: summary.releasedAmountVnd,
    itemCount: summary.itemCount,
    destination: publicDestination(summary.destination),
    ownerReasonCode: summary.ownerReasonCode,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    approvedAt: summary.approvedAt,
    processingAt: summary.processingAt,
    reviewRequiredAt: summary.reviewRequiredAt,
    paidAt: summary.paidAt,
    rejectedAt: summary.rejectedAt,
    cancelledAt: summary.cancelledAt,
    failedAt: summary.failedAt,
  };
}

export function toPublicOwnedPayoutRequest(
  owned: OwnedPayoutRequest,
): PublicOwnedPayoutRequest {
  return {
    request: toPublicPayoutRequestSummary(owned.request),
    items: owned.items.map((item) => ({
      id: item.id,
      amountVnd: item.amountVnd,
      currency: item.currency,
      reservedAt: item.reservedAt,
      releasedAt: item.releasedAt,
      paidAt: item.paidAt,
      createdAt: item.createdAt,
    })),
    events: owned.events.map((event) => ({
      sequenceNo: event.sequenceNo,
      eventType: event.eventType,
      previousStatus: event.previousStatus,
      nextStatus: event.nextStatus,
      requestedAmountVnd: event.requestedAmountVnd,
      reservedAmountVnd: event.reservedAmountVnd,
      approvedAmountVnd: event.approvedAmountVnd,
      paidAmountVnd: event.paidAmountVnd,
      releasedAmountVnd: event.releasedAmountVnd,
      ownerReasonCode: event.ownerReasonCode,
      createdAt: event.createdAt,
    })),
  };
}

export function toPublicPayoutMutation(
  result: PayoutMutationResult,
): PublicPayoutMutation {
  return {
    requestId: result.requestId,
    status: result.status,
    currency: result.currency,
    requestedAmountVnd: result.requestedAmountVnd,
    reservedAmountVnd: result.reservedAmountVnd,
    approvedAmountVnd: result.approvedAmountVnd,
    paidAmountVnd: result.paidAmountVnd,
    releasedAmountVnd: result.releasedAmountVnd,
    itemCount: result.itemCount,
    destination: publicDestination(result.destination),
    ownerReasonCode: result.ownerReasonCode,
    requestCreatedAt: result.requestCreatedAt,
    replayed: result.replayed,
  };
}

/* ------------------------------------------------------------------ *
 * Error sanitization
 * ------------------------------------------------------------------ */

/**
 * Every Phase 20M.1 code maps onto the small public vocabulary.
 * Ownership-revealing codes deliberately collapse: `NOT_OWNED`
 * becomes `NOT_FOUND` so a caller cannot probe for the existence of
 * another owner's payout request or payout account.
 */
const PUBLIC_ERROR_BY_PAYOUT_CODE: Readonly<
  Record<PayoutErrorCode, PayoutPublicErrorCode>
> = {
  PAYOUT_ACCOUNT_INVALID: "PAYOUT_ACCOUNT_INVALID",
  PAYOUT_ACCOUNT_NOT_OWNED: "PAYOUT_ACCOUNT_INVALID",
  PAYOUT_ACCOUNT_NOT_VERIFIED: "PAYOUT_ACCOUNT_INVALID",
  PAYOUT_PROFILE_NOT_FOUND: "PAYOUT_ACCOUNT_INVALID",
  PAYOUT_ACTOR_INVALID: "PAYOUT_FORBIDDEN",
  PAYOUT_AUTHORIZATION_REQUIRED: "PAYOUT_FORBIDDEN",
  PAYOUT_AUTH_REQUIRED: "PAYOUT_AUTH_REQUIRED",
  PAYOUT_INPUT_INVALID: "PAYOUT_INPUT_INVALID",
  PAYOUT_REQUEST_NOT_FOUND: "PAYOUT_REQUEST_NOT_FOUND",
  PAYOUT_REQUEST_NOT_OWNED: "PAYOUT_REQUEST_NOT_FOUND",
  PAYOUT_NO_WITHDRAWABLE_CONVERSIONS: "PAYOUT_NO_WITHDRAWABLE_CONVERSIONS",
  PAYOUT_INVALID_TRANSITION: "PAYOUT_INVALID_TRANSITION",
  PAYOUT_OPERATION_INVALID: "PAYOUT_INVALID_TRANSITION",
  PAYOUT_IDEMPOTENCY_KEY_CONFLICT: "PAYOUT_IDEMPOTENCY_CONFLICT",
  PAYOUT_REASON_REQUIRED: "PAYOUT_REASON_REQUIRED",
  PAYOUT_EVIDENCE_REFERENCE_INVALID: "PAYOUT_REFERENCE_INVALID",
  PAYOUT_CONVERSION_DRIFT: "PAYOUT_STATE_CONFLICT",
  PAYOUT_DESTINATION_CHANGED: "PAYOUT_STATE_CONFLICT",
  PAYOUT_EVENT_IMMUTABLE: "PAYOUT_STATE_CONFLICT",
  PAYOUT_ITEM_CONVERSION_INVALID: "PAYOUT_STATE_CONFLICT",
  PAYOUT_ITEM_CORE_IMMUTABLE: "PAYOUT_STATE_CONFLICT",
  PAYOUT_ITEM_IMMUTABLE: "PAYOUT_STATE_CONFLICT",
  PAYOUT_ITEM_LIFECYCLE_INVALID: "PAYOUT_STATE_CONFLICT",
  PAYOUT_ITEM_REQUEST_INVALID: "PAYOUT_STATE_CONFLICT",
  PAYOUT_ITEM_TERMINAL: "PAYOUT_STATE_CONFLICT",
  PAYOUT_PAYMENT_REFERENCE_CONFLICT: "PAYOUT_STATE_CONFLICT",
  PAYOUT_PROCESSOR_REFERENCE_CONFLICT: "PAYOUT_STATE_CONFLICT",
  PAYOUT_REQUEST_AGGREGATE_MISMATCH: "PAYOUT_STATE_CONFLICT",
  PAYOUT_REQUEST_CORE_IMMUTABLE: "PAYOUT_STATE_CONFLICT",
  PAYOUT_REQUEST_IMMUTABLE: "PAYOUT_STATE_CONFLICT",
  PAYOUT_REQUEST_LIFECYCLE_MISMATCH: "PAYOUT_STATE_CONFLICT",
  PAYOUT_REQUEST_OWNERSHIP_OR_MONEY_DRIFT: "PAYOUT_STATE_CONFLICT",
  PAYOUT_REQUEST_VERSION_INVALID: "PAYOUT_STATE_CONFLICT",
  PAYOUT_RESPONSE_INVALID: "PAYOUT_UNEXPECTED_ERROR",
  PAYOUT_UNEXPECTED_ERROR: "PAYOUT_UNEXPECTED_ERROR",
};

const PUBLIC_MESSAGE_BY_CODE: Readonly<
  Record<PayoutPublicErrorCode, string>
> = {
  PAYOUT_AUTH_REQUIRED: "Vui lòng đăng nhập để tiếp tục.",
  PAYOUT_FORBIDDEN: "Bạn không có quyền thực hiện thao tác này.",
  PAYOUT_INPUT_INVALID: "Dữ liệu gửi lên không hợp lệ.",
  PAYOUT_REQUEST_NOT_FOUND: "Không tìm thấy yêu cầu rút tiền.",
  PAYOUT_ACCOUNT_INVALID:
    "Tài khoản nhận tiền không hợp lệ hoặc chưa được xác minh.",
  PAYOUT_NO_WITHDRAWABLE_CONVERSIONS:
    "Hiện chưa có khoản nào đủ điều kiện để rút.",
  PAYOUT_INVALID_TRANSITION:
    "Yêu cầu rút tiền đang ở trạng thái không cho phép thao tác này.",
  PAYOUT_IDEMPOTENCY_CONFLICT:
    "Thao tác này đã được ghi nhận với một nội dung khác.",
  PAYOUT_STATE_CONFLICT:
    "Yêu cầu rút tiền đã thay đổi. Vui lòng tải lại và thử lại.",
  PAYOUT_REASON_REQUIRED: "Cần cung cấp lý do hợp lệ.",
  PAYOUT_REFERENCE_INVALID: "Mã tham chiếu không hợp lệ.",
  PAYOUT_UNEXPECTED_ERROR:
    "Không thể xử lý yêu cầu rút tiền. Vui lòng thử lại sau.",
};

export function toPayoutPublicError(error: unknown): PayoutPublicError {
  const code =
    error instanceof PayoutApplicationError
      ? PUBLIC_ERROR_BY_PAYOUT_CODE[error.code]
      : "PAYOUT_UNEXPECTED_ERROR";
  return { code, message: PUBLIC_MESSAGE_BY_CODE[code] };
}

export function toPayoutFailure<TData>(
  error: unknown,
): PayoutEntryPointResult<TData> {
  return { ok: false, error: toPayoutPublicError(error) };
}

export function payoutFailure<TData>(
  code: PayoutPublicErrorCode,
): PayoutEntryPointResult<TData> {
  return {
    ok: false,
    error: { code, message: PUBLIC_MESSAGE_BY_CODE[code] },
  };
}

/* ------------------------------------------------------------------ *
 * Strict input parsing
 * ------------------------------------------------------------------ */

/**
 * React injects bookkeeping fields prefixed with `$ACTION_` into the
 * FormData of every server action. They are the only keys allowed to
 * fall outside a command's allowlist.
 */
const REACT_ACTION_FIELD_PREFIX = "$ACTION_";

/**
 * Fields a caller must never be able to supply. Unknown-field
 * rejection already refuses all of them because they are absent from
 * every allowlist; the explicit set exists so the refusal is
 * self-documenting and independently testable.
 */
const FORBIDDEN_FIELDS: ReadonlySet<string> = new Set([
  "userId",
  "user_id",
  "ownerId",
  "owner_id",
  "ownerUserId",
  "owner_user_id",
  "actorId",
  "actor_id",
  "actorUserId",
  "actor_user_id",
  "actorRole",
  "actor_role",
  "adminUserId",
  "admin_user_id",
  "amount",
  "amountVnd",
  "amount_vnd",
  "requestedAmountVnd",
  "requested_amount_vnd",
  "approvedAmountVnd",
  "paidAmountVnd",
  "status",
  "targetStatus",
  "target_status",
  "nextStatus",
  "next_status",
  "previousStatus",
  "transition",
  "auditEvent",
  "audit_event",
  "auditJson",
  "audit",
  "serviceRole",
  "serviceRoleKey",
  "service_role_key",
  "accountNumber",
  "account_number",
  "accountName",
  "account_name",
  "provider",
]);

function inputInvalid(): never {
  throw new PayoutApplicationError("PAYOUT_INPUT_INVALID");
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof FormData)
  );
}

/**
 * Read exactly the allowed fields out of a FormData payload or a
 * plain object. Every allowed field is required and must carry a
 * single string value. Anything else -- an unknown key, a forbidden
 * key, a repeated key, a File, a missing key, a non-string value --
 * is refused with `PAYOUT_INPUT_INVALID`.
 */
export function readPayoutFields<TField extends string>(
  source: unknown,
  allowed: readonly TField[],
): Readonly<Record<TField, string>> {
  const allowedSet: ReadonlySet<string> = new Set<string>(allowed);
  const raw = new Map<string, string>();

  if (source instanceof FormData) {
    for (const key of new Set(source.keys())) {
      if (key.startsWith(REACT_ACTION_FIELD_PREFIX)) continue;
      if (FORBIDDEN_FIELDS.has(key) || !allowedSet.has(key)) inputInvalid();
      const values = source.getAll(key);
      if (values.length !== 1) inputInvalid();
      const value = values[0];
      if (typeof value !== "string") inputInvalid();
      raw.set(key, value);
    }
  } else if (isPlainRecord(source)) {
    for (const key of Object.keys(source)) {
      if (FORBIDDEN_FIELDS.has(key) || !allowedSet.has(key)) inputInvalid();
      const value = source[key];
      if (typeof value !== "string") inputInvalid();
      raw.set(key, value);
    }
  } else {
    inputInvalid();
  }

  const parsed: Record<string, string> = {};
  for (const field of allowed) {
    const value = raw.get(field);
    if (value === undefined) inputInvalid();
    parsed[field] = value;
  }
  return parsed as Readonly<Record<TField, string>>;
}

/* ------------------------------------------------------------------ *
 * Command parsers
 *
 * Every parser returns exactly the Phase 20M.1 service input shape.
 * UUIDs and idempotency keys go through `parsePayoutUuid`, which
 * validates without transforming, so a valid idempotency key is
 * forwarded byte for byte. Reference / reason fields go through the
 * Phase 20M.1 parsers so there is a single rule per field.
 * ------------------------------------------------------------------ */

export interface ParsedCreatePayoutCommand {
  readonly payoutAccountId: string;
  readonly idempotencyKey: string;
}

export interface ParsedPayoutRequestCommand {
  readonly payoutRequestId: string;
  readonly idempotencyKey: string;
}

export interface ParsedRejectPayoutCommand
  extends ParsedPayoutRequestCommand {
  readonly reasonCode: string;
  readonly reason: string;
}

export interface ParsedStartProcessingCommand
  extends ParsedPayoutRequestCommand {
  readonly processorReference: string;
}

export interface ParsedReviewRequiredCommand
  extends ParsedPayoutRequestCommand {
  readonly uncertaintyCode: string;
  readonly outcomeReference: string;
}

export interface ParsedConfirmPaymentCommand
  extends ParsedPayoutRequestCommand {
  readonly paymentReference: string;
}

export interface ParsedConfirmNonpaymentCommand
  extends ParsedPayoutRequestCommand {
  readonly nonpaymentReference: string;
  readonly reasonCode: string;
  readonly reason: string;
}

export function parseCreatePayoutCommand(
  source: unknown,
): ParsedCreatePayoutCommand {
  const fields = readPayoutFields(source, [
    "payoutAccountId",
    "idempotencyKey",
  ] as const);
  return {
    payoutAccountId: parsePayoutUuid(fields.payoutAccountId),
    idempotencyKey: parsePayoutUuid(fields.idempotencyKey),
  };
}

export function parsePayoutRequestCommand(
  source: unknown,
): ParsedPayoutRequestCommand {
  const fields = readPayoutFields(source, [
    "payoutRequestId",
    "idempotencyKey",
  ] as const);
  return {
    payoutRequestId: parsePayoutUuid(fields.payoutRequestId),
    idempotencyKey: parsePayoutUuid(fields.idempotencyKey),
  };
}

export function parseRejectPayoutCommand(
  source: unknown,
): ParsedRejectPayoutCommand {
  const fields = readPayoutFields(source, [
    "payoutRequestId",
    "idempotencyKey",
    "reasonCode",
    "reason",
  ] as const);
  return {
    payoutRequestId: parsePayoutUuid(fields.payoutRequestId),
    idempotencyKey: parsePayoutUuid(fields.idempotencyKey),
    reasonCode: parsePayoutReasonCode(fields.reasonCode),
    reason: parsePayoutReason(fields.reason),
  };
}

export function parseStartProcessingCommand(
  source: unknown,
): ParsedStartProcessingCommand {
  const fields = readPayoutFields(source, [
    "payoutRequestId",
    "idempotencyKey",
    "processorReference",
  ] as const);
  return {
    payoutRequestId: parsePayoutUuid(fields.payoutRequestId),
    idempotencyKey: parsePayoutUuid(fields.idempotencyKey),
    processorReference: parsePayoutReference(fields.processorReference),
  };
}

export function parseReviewRequiredCommand(
  source: unknown,
): ParsedReviewRequiredCommand {
  const fields = readPayoutFields(source, [
    "payoutRequestId",
    "idempotencyKey",
    "uncertaintyCode",
    "outcomeReference",
  ] as const);
  return {
    payoutRequestId: parsePayoutUuid(fields.payoutRequestId),
    idempotencyKey: parsePayoutUuid(fields.idempotencyKey),
    uncertaintyCode: parsePayoutReasonCode(fields.uncertaintyCode),
    outcomeReference: parsePayoutReference(fields.outcomeReference),
  };
}

export function parseConfirmPaymentCommand(
  source: unknown,
): ParsedConfirmPaymentCommand {
  const fields = readPayoutFields(source, [
    "payoutRequestId",
    "idempotencyKey",
    "paymentReference",
  ] as const);
  return {
    payoutRequestId: parsePayoutUuid(fields.payoutRequestId),
    idempotencyKey: parsePayoutUuid(fields.idempotencyKey),
    paymentReference: parsePayoutReference(fields.paymentReference),
  };
}

export function parseConfirmNonpaymentCommand(
  source: unknown,
): ParsedConfirmNonpaymentCommand {
  const fields = readPayoutFields(source, [
    "payoutRequestId",
    "idempotencyKey",
    "nonpaymentReference",
    "reasonCode",
    "reason",
  ] as const);
  return {
    payoutRequestId: parsePayoutUuid(fields.payoutRequestId),
    idempotencyKey: parsePayoutUuid(fields.idempotencyKey),
    nonpaymentReference: parsePayoutReference(fields.nonpaymentReference),
    reasonCode: parsePayoutReasonCode(fields.reasonCode),
    reason: parsePayoutReason(fields.reason),
  };
}

/** Parse a bare payout request id used by the owner detail read. */
export function parsePayoutRequestId(value: unknown): string {
  return parsePayoutUuid(value);
}
