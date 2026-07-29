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
} from "@/types/payout";

import {
  OWNER_PAYOUT_PATH,
  ownerPayoutDetailPath,
} from "../../payouts/payout-owner-entry-point-core";

export const ADMIN_PAYOUT_PATH = "/app/admin/payouts";

export function adminPayoutDetailPath(payoutRequestId: string): string {
  return `${ADMIN_PAYOUT_PATH}/${payoutRequestId}`;
}

export interface PayoutAdminEntryPointDependencies {
  readonly requireAdmin: (nextPath: string) => Promise<unknown>;
  readonly service: {
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
