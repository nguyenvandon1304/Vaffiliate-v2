/**
 * Phase 20M.2 -- privileged payout entry-point core.
 *
 * The six database transitions remain explicit. This boundary never accepts
 * an operation name, target status, actor identity, amount, audit payload, or
 * service-role option from the caller. Trusted authorization runs before
 * input parsing and before any Phase 20M.1 service method is reached.
 */

import {
  parseConfirmNonpaymentCommand,
  parseConfirmPaymentCommand,
  parsePayoutRequestCommand,
  parseRejectPayoutCommand,
  parseReviewRequiredCommand,
  parseStartProcessingCommand,
  toPayoutFailure,
  toPublicPayoutMutation,
  type PublicPayoutDestination,
  type PublicPayoutEvent,
  type PublicPayoutRequestItem,
  type PayoutEntryPointResult,
  type PublicPayoutMutation,
} from "@/lib/payout/entry-point";
import type {
  ConfirmPayoutNonpaymentInput,
  ConfirmPayoutPaymentInput,
  MarkPayoutReviewRequiredInput,
  PayoutMutationResult,
  PayoutTransitionInput,
  RejectPayoutRequestInput,
  StartPayoutProcessingInput,
  AdminPayoutRequestDetail,
  AdminPayoutRequestListInput,
  AdminPayoutRequestListResult,
  AdminPayoutRequestListItem,
  AdminPayoutListCursor,
  PayoutEventSummary,
  PayoutRequestItem,
  PayoutOwnerReasonCode,
  PayoutStatus,
  DecimalVndString,
} from "@/types/payout";
import { parsePayoutUuid } from "@/lib/payout/validation";

import {
  OWNER_PAYOUT_PATH,
  ownerPayoutDetailPath,
} from "../../payouts/payout-owner-entry-point-core";

export const ADMIN_PAYOUT_PATH = "/app/admin/payouts";

function toPublicPayoutRequestItem(item: PayoutRequestItem): PublicPayoutRequestItem {
  return { id: item.id, amountVnd: item.amountVnd, currency: item.currency, reservedAt: item.reservedAt, releasedAt: item.releasedAt, paidAt: item.paidAt, createdAt: item.createdAt };
}

function toPublicPayoutEvent(event: PayoutEventSummary): PublicPayoutEvent {
  return { sequenceNo: event.sequenceNo, eventType: event.eventType, previousStatus: event.previousStatus, nextStatus: event.nextStatus, requestedAmountVnd: event.requestedAmountVnd, reservedAmountVnd: event.reservedAmountVnd, approvedAmountVnd: event.approvedAmountVnd, paidAmountVnd: event.paidAmountVnd, releasedAmountVnd: event.releasedAmountVnd, ownerReasonCode: event.ownerReasonCode, createdAt: event.createdAt };
}

export function adminPayoutDetailPath(payoutRequestId: string): string {
  return `${ADMIN_PAYOUT_PATH}/${payoutRequestId}`;
}

/**
 * Phase 20M.3A2 -- admin read projections.
 *
 * The service DTO already excludes every raw destination field. This
 * strips one more layer for the eventual UI: the account holder name is
 * owner PII an admin list/detail screen does not need, matching the
 * owner-side `PublicPayoutDestination` decision.
 */
export interface PublicAdminPayoutListItem {
  readonly id: string;
  readonly userId: string;
  readonly ["status"]: PayoutStatus;
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
}

export interface PublicAdminPayoutList {
  readonly items: readonly PublicAdminPayoutListItem[];
  readonly nextCursor: AdminPayoutListCursor | null;
}

export interface PublicAdminPayoutDetail {
  readonly request: PublicAdminPayoutListItem;
  readonly items: readonly PublicPayoutRequestItem[];
  readonly events: readonly PublicPayoutEvent[];
}

function toPublicAdminPayoutListItem(
  item: AdminPayoutRequestListItem,
): PublicAdminPayoutListItem {
  return {
    id: item.id,
    userId: item.userId,
    ["status"]: item.status,
    currency: item.currency,
    requestedAmountVnd: item.requestedAmountVnd,
    reservedAmountVnd: item.reservedAmountVnd,
    approvedAmountVnd: item.approvedAmountVnd,
    paidAmountVnd: item.paidAmountVnd,
    releasedAmountVnd: item.releasedAmountVnd,
    itemCount: item.itemCount,
    destination: {
      method: "bank",
      provider: item.destination.provider,
      accountNumberMasked: item.destination.accountNumberMasked,
    },
    ownerReasonCode: item.ownerReasonCode,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export interface PayoutAdminEntryPointDependencies {
  readonly requireAdmin: (nextPath: string) => Promise<unknown>;
  readonly service: {
    readonly listRequests?: (
      input: AdminPayoutRequestListInput,
    ) => Promise<AdminPayoutRequestListResult>;
    readonly getRequestDetail?: (
      payoutRequestId: string,
    ) => Promise<AdminPayoutRequestDetail>;
    readonly approve: (
      input: PayoutTransitionInput,
    ) => Promise<PayoutMutationResult>;
    readonly reject: (
      input: RejectPayoutRequestInput,
    ) => Promise<PayoutMutationResult>;
    readonly startProcessing: (
      input: StartPayoutProcessingInput,
    ) => Promise<PayoutMutationResult>;
    readonly markReviewRequired: (
      input: MarkPayoutReviewRequiredInput,
    ) => Promise<PayoutMutationResult>;
    readonly confirmPayment: (
      input: ConfirmPayoutPaymentInput,
    ) => Promise<PayoutMutationResult>;
    readonly confirmNonpayment: (
      input: ConfirmPayoutNonpaymentInput,
    ) => Promise<PayoutMutationResult>;
  };
  readonly revalidate: (path: string) => void;
  readonly rethrow: (error: unknown) => void;
}

export function createPayoutAdminEntryPoint(
  dependencies: PayoutAdminEntryPointDependencies,
) {
  function failure(
    error: unknown,
  ): PayoutEntryPointResult<PublicPayoutMutation> {
    dependencies.rethrow(error);
    return toPayoutFailure<PublicPayoutMutation>(error);
  }

  function success(
    result: PayoutMutationResult,
    payoutRequestId: string,
  ): PayoutEntryPointResult<PublicPayoutMutation> {
    for (const path of [
      ADMIN_PAYOUT_PATH,
      adminPayoutDetailPath(payoutRequestId),
      OWNER_PAYOUT_PATH,
      ownerPayoutDetailPath(payoutRequestId),
    ]) {
      dependencies.revalidate(path);
    }
    return { ok: true, data: toPublicPayoutMutation(result) };
  }

  return Object.freeze({
    async loadAdminPayoutList(
      input: AdminPayoutRequestListInput = {},
    ): Promise<PayoutEntryPointResult<PublicAdminPayoutList>> {
      try {
        await dependencies.requireAdmin(ADMIN_PAYOUT_PATH);
        if (!dependencies.service.listRequests) throw new Error("Admin payout list service is unavailable");
        const result = await dependencies.service.listRequests(input);
        return {
          ok: true,
          data: {
            items: result.items.map(toPublicAdminPayoutListItem),
            nextCursor: result.nextCursor,
          },
        };
      } catch (error) {
        dependencies.rethrow(error);
        return toPayoutFailure<PublicAdminPayoutList>(error);
      }
    },

    async loadAdminPayoutDetail(
      payoutRequestId: unknown,
    ): Promise<PayoutEntryPointResult<PublicAdminPayoutDetail>> {
      try {
        await dependencies.requireAdmin(ADMIN_PAYOUT_PATH);
        const requestId = parsePayoutUuid(payoutRequestId);
        if (!dependencies.service.getRequestDetail) throw new Error("Admin payout detail service is unavailable");
        const detail = await dependencies.service.getRequestDetail(requestId);
        return {
          ok: true,
          data: {
            request: toPublicAdminPayoutListItem(detail.request),
            items: detail.items.map(toPublicPayoutRequestItem),
            events: detail.events.map(toPublicPayoutEvent),
          },
        };
      } catch (error) {
        dependencies.rethrow(error);
        return toPayoutFailure<PublicAdminPayoutDetail>(error);
      }
    },

    async approve(
      input: unknown,
    ): Promise<PayoutEntryPointResult<PublicPayoutMutation>> {
      try {
        await dependencies.requireAdmin(ADMIN_PAYOUT_PATH);
        const command = parsePayoutRequestCommand(input);
        return success(await dependencies.service.approve(command), command.payoutRequestId);
      } catch (error) {
        return failure(error);
      }
    },

    async reject(
      input: unknown,
    ): Promise<PayoutEntryPointResult<PublicPayoutMutation>> {
      try {
        await dependencies.requireAdmin(ADMIN_PAYOUT_PATH);
        const command = parseRejectPayoutCommand(input);
        return success(await dependencies.service.reject(command), command.payoutRequestId);
      } catch (error) {
        return failure(error);
      }
    },

    async startProcessing(
      input: unknown,
    ): Promise<PayoutEntryPointResult<PublicPayoutMutation>> {
      try {
        await dependencies.requireAdmin(ADMIN_PAYOUT_PATH);
        const command = parseStartProcessingCommand(input);
        return success(
          await dependencies.service.startProcessing(command),
          command.payoutRequestId,
        );
      } catch (error) {
        return failure(error);
      }
    },

    async markReviewRequired(
      input: unknown,
    ): Promise<PayoutEntryPointResult<PublicPayoutMutation>> {
      try {
        await dependencies.requireAdmin(ADMIN_PAYOUT_PATH);
        const command = parseReviewRequiredCommand(input);
        return success(
          await dependencies.service.markReviewRequired(command),
          command.payoutRequestId,
        );
      } catch (error) {
        return failure(error);
      }
    },

    async confirmPayment(
      input: unknown,
    ): Promise<PayoutEntryPointResult<PublicPayoutMutation>> {
      try {
        await dependencies.requireAdmin(ADMIN_PAYOUT_PATH);
        const command = parseConfirmPaymentCommand(input);
        return success(
          await dependencies.service.confirmPayment(command),
          command.payoutRequestId,
        );
      } catch (error) {
        return failure(error);
      }
    },

    async confirmNonpayment(
      input: unknown,
    ): Promise<PayoutEntryPointResult<PublicPayoutMutation>> {
      try {
        await dependencies.requireAdmin(ADMIN_PAYOUT_PATH);
        const command = parseConfirmNonpaymentCommand(input);
        return success(
          await dependencies.service.confirmNonpayment(command),
          command.payoutRequestId,
        );
      } catch (error) {
        return failure(error);
      }
    },
  });
}
