export const PAYOUT_STATUSES = [
  "requested",
  "approved",
  "processing",
  "review_required",
  "paid",
  "rejected",
  "cancelled",
  "failed",
] as const;

export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export const PAYOUT_OWNER_REASON_CODES = [
  "user_cancelled",
  "request_rejected",
  "payment_under_review",
  "payment_not_completed",
] as const;

export type PayoutOwnerReasonCode =
  (typeof PAYOUT_OWNER_REASON_CODES)[number];

export const PAYOUT_EVENT_TYPES = [
  "request_created",
  "request_approved",
  "request_rejected",
  "request_cancelled",
  "processing_started",
  "outcome_uncertain",
  "payment_confirmed",
  "nonpayment_confirmed",
] as const;

export type PayoutEventType = (typeof PAYOUT_EVENT_TYPES)[number];

declare const decimalVndBrand: unique symbol;

/** An unsigned base-10 VND integer that is safe to transport through JSON. */
export type DecimalVndString = string & {
  readonly [decimalVndBrand]: "DecimalVndString";
};

export interface MaskedPayoutDestination {
  readonly method: "bank";
  readonly provider: string;
  readonly accountName: string;
  readonly accountNumberMasked: string;
}

/** Owner-safe verified destination used to create a payout request. */
export interface VerifiedPayoutAccountOption {
  readonly payoutAccountId: string;
  readonly method: "bank";
  readonly providerLabel: string;
  readonly maskedDestination: string;
  readonly verification: "verified";
}

export interface PayoutRequestSummary {
  readonly id: string;
  readonly status: PayoutStatus;
  readonly currency: "VND";
  readonly requestedAmountVnd: DecimalVndString;
  readonly reservedAmountVnd: DecimalVndString;
  readonly approvedAmountVnd: DecimalVndString;
  readonly paidAmountVnd: DecimalVndString;
  readonly releasedAmountVnd: DecimalVndString;
  readonly itemCount: number;
  readonly destination: MaskedPayoutDestination;
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

export interface PayoutRequestItem {
  readonly id: string;
  readonly payoutRequestId: string;
  readonly conversionId: string;
  readonly amountVnd: DecimalVndString;
  readonly currency: "VND";
  readonly conversionStatusSnapshot: "payable";
  readonly reservedAt: string;
  readonly releasedAt: string | null;
  readonly paidAt: string | null;
  readonly createdAt: string;
}

export interface PayoutEventSummary {
  readonly id: string;
  readonly payoutRequestId: string;
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

export interface OwnedPayoutRequest {
  readonly request: PayoutRequestSummary;
  readonly items: readonly PayoutRequestItem[];
  readonly events: readonly PayoutEventSummary[];
}

export interface PayoutMutationResult {
  readonly requestId: string;
  readonly status: PayoutStatus;
  readonly currency: "VND";
  readonly requestedAmountVnd: DecimalVndString;
  readonly reservedAmountVnd: DecimalVndString;
  readonly approvedAmountVnd: DecimalVndString;
  readonly paidAmountVnd: DecimalVndString;
  readonly releasedAmountVnd: DecimalVndString;
  readonly itemCount: number;
  readonly destination: MaskedPayoutDestination;
  readonly ownerReasonCode: PayoutOwnerReasonCode | null;
  readonly eventId: string;
  readonly eventCreatedAt: string;
  readonly requestCreatedAt: string;
  readonly replayed: boolean;
}

/* ------------------------------------------------------------------ *
 * Phase 20M.3A2 -- admin read projections
 *
 * Separate from the owner types on purpose: an administrator reads
 * across users, so the list item carries `userId`, and the amounts an
 * admin needs are the reconciliation-relevant ones. Every field here
 * is already safe to hand to a server component -- the destination
 * arrives masked from the database, and no raw account number,
 * destination fingerprint, provider reference, or internal reason
 * code is part of the shape.
 * ------------------------------------------------------------------ */

export interface AdminPayoutRequestListItem {
  readonly id: string;
  readonly userId: string;
  readonly status: PayoutStatus;
  readonly currency: "VND";
  readonly requestedAmountVnd: DecimalVndString;
  readonly reservedAmountVnd: DecimalVndString;
  readonly approvedAmountVnd: DecimalVndString;
  readonly paidAmountVnd: DecimalVndString;
  readonly releasedAmountVnd: DecimalVndString;
  readonly itemCount: number;
  readonly destination: MaskedPayoutDestination;
  readonly ownerReasonCode: PayoutOwnerReasonCode | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Keyset cursor. Both halves are required; a partial cursor is rejected. */
export interface AdminPayoutListCursor {
  readonly createdAt: string;
  readonly id: string;
}

export interface AdminPayoutRequestListInput {
  readonly status?: PayoutStatus;
  readonly cursor?: AdminPayoutListCursor;
  readonly limit?: number;
}

export interface AdminPayoutRequestListResult {
  readonly items: readonly AdminPayoutRequestListItem[];
  readonly nextCursor: AdminPayoutListCursor | null;
}

export interface AdminPayoutRequestDetail {
  readonly request: AdminPayoutRequestListItem;
  readonly items: readonly PayoutRequestItem[];
  readonly events: readonly PayoutEventSummary[];
}

export interface CreatePayoutRequestInput {
  readonly payoutAccountId: string;
  readonly idempotencyKey: string;
}

export interface CancelPayoutRequestInput {
  readonly payoutRequestId: string;
  readonly idempotencyKey: string;
}

export interface PayoutTransitionInput {
  readonly payoutRequestId: string;
  readonly idempotencyKey: string;
}

export interface RejectPayoutRequestInput extends PayoutTransitionInput {
  readonly reasonCode: string;
  readonly reason: string;
}

export interface StartPayoutProcessingInput extends PayoutTransitionInput {
  readonly processorReference: string;
}

export interface MarkPayoutReviewRequiredInput extends PayoutTransitionInput {
  readonly uncertaintyCode: string;
  readonly outcomeReference: string;
}

export interface ConfirmPayoutPaymentInput extends PayoutTransitionInput {
  readonly paymentReference: string;
}

export interface ConfirmPayoutNonpaymentInput extends PayoutTransitionInput {
  readonly nonpaymentReference: string;
  readonly reasonCode: string;
  readonly reason: string;
}
