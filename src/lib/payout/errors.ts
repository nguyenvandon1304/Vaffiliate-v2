export const PAYOUT_DATABASE_ERROR_CODES = [
  "PAYOUT_ACCOUNT_INVALID",
  "PAYOUT_ACCOUNT_NOT_OWNED",
  "PAYOUT_ACCOUNT_NOT_VERIFIED",
  "PAYOUT_ACTOR_INVALID",
  "PAYOUT_AUTH_REQUIRED",
  "PAYOUT_CONVERSION_DRIFT",
  "PAYOUT_DESTINATION_CHANGED",
  "PAYOUT_EVENT_IMMUTABLE",
  "PAYOUT_EVIDENCE_REFERENCE_INVALID",
  "PAYOUT_IDEMPOTENCY_KEY_CONFLICT",
  "PAYOUT_INPUT_INVALID",
  "PAYOUT_INVALID_TRANSITION",
  "PAYOUT_ITEM_CONVERSION_INVALID",
  "PAYOUT_ITEM_CORE_IMMUTABLE",
  "PAYOUT_ITEM_IMMUTABLE",
  "PAYOUT_ITEM_LIFECYCLE_INVALID",
  "PAYOUT_ITEM_REQUEST_INVALID",
  "PAYOUT_ITEM_TERMINAL",
  "PAYOUT_NO_WITHDRAWABLE_CONVERSIONS",
  "PAYOUT_OPERATION_INVALID",
  "PAYOUT_PAYMENT_REFERENCE_CONFLICT",
  "PAYOUT_PROCESSOR_REFERENCE_CONFLICT",
  "PAYOUT_PROFILE_NOT_FOUND",
  "PAYOUT_REASON_REQUIRED",
  "PAYOUT_REQUEST_AGGREGATE_MISMATCH",
  "PAYOUT_REQUEST_CORE_IMMUTABLE",
  "PAYOUT_REQUEST_IMMUTABLE",
  "PAYOUT_REQUEST_LIFECYCLE_MISMATCH",
  "PAYOUT_REQUEST_NOT_FOUND",
  "PAYOUT_REQUEST_NOT_OWNED",
  "PAYOUT_REQUEST_OWNERSHIP_OR_MONEY_DRIFT",
  "PAYOUT_REQUEST_VERSION_INVALID",
] as const;

export type PayoutDatabaseErrorCode =
  (typeof PAYOUT_DATABASE_ERROR_CODES)[number];

export type PayoutErrorCode =
  | PayoutDatabaseErrorCode
  | "PAYOUT_AUTHORIZATION_REQUIRED"
  | "PAYOUT_RESPONSE_INVALID"
  | "PAYOUT_UNEXPECTED_ERROR";

const DATABASE_CODES = new Set<string>(PAYOUT_DATABASE_ERROR_CODES);

export class PayoutApplicationError extends Error {
  readonly code: PayoutErrorCode;

  constructor(code: PayoutErrorCode) {
    super(code);
    this.name = "PayoutApplicationError";
    this.code = code;
  }
}

function readPayoutCode(value: unknown): PayoutDatabaseErrorCode | null {
  if (typeof value !== "string") return null;
  const match = /PAYOUT_[A-Z0-9_]+/.exec(value);
  if (!match || !DATABASE_CODES.has(match[0])) return null;
  return match[0] as PayoutDatabaseErrorCode;
}

export function mapPayoutError(error: unknown): PayoutApplicationError {
  if (error instanceof PayoutApplicationError) return error;

  if (typeof error === "object" && error !== null) {
    const candidate = error as Record<string, unknown>;
    for (const field of ["message", "details", "hint", "code"] as const) {
      const code = readPayoutCode(candidate[field]);
      if (code) return new PayoutApplicationError(code);
    }
  }

  const directCode = readPayoutCode(error);
  return new PayoutApplicationError(
    directCode ?? "PAYOUT_UNEXPECTED_ERROR",
  );
}
