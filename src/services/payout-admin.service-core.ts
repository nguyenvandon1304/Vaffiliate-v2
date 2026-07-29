import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppRole } from "@/lib/auth/roles";
import { PayoutApplicationError } from "@/lib/payout/errors";
import type { TrustedPayoutAdminActor } from "@/repositories/payout-admin.repository";
import type {
  ConfirmPayoutNonpaymentInput,
  ConfirmPayoutPaymentInput,
  MarkPayoutReviewRequiredInput,
  PayoutMutationResult,
  PayoutTransitionInput,
  RejectPayoutRequestInput,
  StartPayoutProcessingInput,
} from "@/types/payout";

export interface TrustedAdminSession {
  readonly userId: string;
  readonly role: AppRole | null;
}

interface PayoutAdminRepository {
  readonly approve: (
    client: SupabaseClient,
    actor: TrustedPayoutAdminActor,
    input: PayoutTransitionInput,
  ) => Promise<PayoutMutationResult>;
  readonly reject: (
    client: SupabaseClient,
    actor: TrustedPayoutAdminActor,
    input: RejectPayoutRequestInput,
  ) => Promise<PayoutMutationResult>;
  readonly startProcessing: (
    client: SupabaseClient,
    input: StartPayoutProcessingInput,
  ) => Promise<PayoutMutationResult>;
  readonly markReviewRequired: (
    client: SupabaseClient,
    input: MarkPayoutReviewRequiredInput,
  ) => Promise<PayoutMutationResult>;
  readonly confirmPayment: (
    client: SupabaseClient,
    input: ConfirmPayoutPaymentInput,
  ) => Promise<PayoutMutationResult>;
  readonly confirmNonpayment: (
    client: SupabaseClient,
    input: ConfirmPayoutNonpaymentInput,
  ) => Promise<PayoutMutationResult>;
}

export interface PayoutAdminServiceDependencies {
  readonly requireAdmin: (nextPath: string) => Promise<TrustedAdminSession>;
  readonly createServiceRoleClient: () => SupabaseClient;
  readonly repository: PayoutAdminRepository;
}

export function createPayoutAdminService(
  dependencies: PayoutAdminServiceDependencies,
) {
  async function authorizedContext(): Promise<{
    readonly actor: TrustedPayoutAdminActor;
    readonly client: SupabaseClient;
  }> {
    const authorized = await dependencies.requireAdmin("/app/admin");
    if (authorized.role !== "admin" && authorized.role !== "super_admin") {
      throw new PayoutApplicationError("PAYOUT_AUTHORIZATION_REQUIRED");
    }
    return {
      actor: { userId: authorized.userId, role: authorized.role },
      client: dependencies.createServiceRoleClient(),
    };
  }

  return Object.freeze({
    async approve(input: PayoutTransitionInput): Promise<PayoutMutationResult> {
      const context = await authorizedContext();
      return dependencies.repository.approve(context.client, context.actor, {
        payoutRequestId: input.payoutRequestId,
        idempotencyKey: input.idempotencyKey,
      });
    },
    async reject(
      input: RejectPayoutRequestInput,
    ): Promise<PayoutMutationResult> {
      const context = await authorizedContext();
      return dependencies.repository.reject(context.client, context.actor, {
        payoutRequestId: input.payoutRequestId,
        idempotencyKey: input.idempotencyKey,
        reasonCode: input.reasonCode,
        reason: input.reason,
      });
    },
    async startProcessing(
      input: StartPayoutProcessingInput,
    ): Promise<PayoutMutationResult> {
      const context = await authorizedContext();
      return dependencies.repository.startProcessing(context.client, {
        payoutRequestId: input.payoutRequestId,
        idempotencyKey: input.idempotencyKey,
        processorReference: input.processorReference,
      });
    },
    async markReviewRequired(
      input: MarkPayoutReviewRequiredInput,
    ): Promise<PayoutMutationResult> {
      const context = await authorizedContext();
      return dependencies.repository.markReviewRequired(context.client, {
        payoutRequestId: input.payoutRequestId,
        idempotencyKey: input.idempotencyKey,
        uncertaintyCode: input.uncertaintyCode,
        outcomeReference: input.outcomeReference,
      });
    },
    async confirmPayment(
      input: ConfirmPayoutPaymentInput,
    ): Promise<PayoutMutationResult> {
      const context = await authorizedContext();
      return dependencies.repository.confirmPayment(context.client, {
        payoutRequestId: input.payoutRequestId,
        idempotencyKey: input.idempotencyKey,
        paymentReference: input.paymentReference,
      });
    },
    async confirmNonpayment(
      input: ConfirmPayoutNonpaymentInput,
    ): Promise<PayoutMutationResult> {
      const context = await authorizedContext();
      return dependencies.repository.confirmNonpayment(context.client, {
        payoutRequestId: input.payoutRequestId,
        idempotencyKey: input.idempotencyKey,
        nonpaymentReference: input.nonpaymentReference,
        reasonCode: input.reasonCode,
        reason: input.reason,
      });
    },
  });
}
