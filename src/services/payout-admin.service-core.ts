import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppRole } from "@/lib/auth/roles";
import { PayoutApplicationError } from "@/lib/payout/errors";
import { parsePayoutUuid } from "@/lib/payout/validation";
import type { TrustedPayoutAdminActor } from "@/repositories/payout-admin.repository";
import { PAYOUT_STATUSES } from "@/types/payout";
import type {
  AdminPayoutListCursor,
  AdminPayoutRequestDetail,
  AdminPayoutRequestListInput,
  AdminPayoutRequestListResult,
  PayoutStatus,
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

/**
 * Phase 20M.3A2 -- admin read limits.
 *
 * The database clamps to 100 as well; validating here keeps a bad limit
 * from reaching the RPC at all and gives the caller the same
 * `PAYOUT_INPUT_INVALID` contract as every other payout input error.
 */
export const ADMIN_PAYOUT_LIST_DEFAULT_LIMIT = 25;
export const ADMIN_PAYOUT_LIST_MAX_LIMIT = 100;

interface PayoutAdminRepository {
  readonly listForAdmin?: (
    client: SupabaseClient,
    actorUserId: string,
    input: AdminPayoutRequestListInput & { readonly limit: number },
  ) => Promise<AdminPayoutRequestListResult>;
  readonly getForAdmin?: (
    client: SupabaseClient,
    actorUserId: string,
    payoutRequestId: string,
  ) => Promise<AdminPayoutRequestDetail>;
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

  function listLimit(value: number | undefined): number {
    if (value === undefined) return ADMIN_PAYOUT_LIST_DEFAULT_LIMIT;
    if (
      !Number.isSafeInteger(value) ||
      value < 1 ||
      value > ADMIN_PAYOUT_LIST_MAX_LIMIT
    ) {
      throw new PayoutApplicationError("PAYOUT_INPUT_INVALID");
    }
    return value;
  }

  function listCursor(
    cursor: AdminPayoutListCursor | undefined,
  ): AdminPayoutListCursor | undefined {
    if (cursor === undefined) return undefined;
    parsePayoutUuid(cursor.id);
    if (
      typeof cursor.createdAt !== "string" ||
      !Number.isFinite(Date.parse(cursor.createdAt))
    ) {
      throw new PayoutApplicationError("PAYOUT_INPUT_INVALID");
    }
    return cursor;
  }

  function listStatus(
    status: PayoutStatus | undefined,
  ): PayoutStatus | undefined {
    if (status === undefined) return undefined;
    if (!(PAYOUT_STATUSES as readonly string[]).includes(status)) {
      throw new PayoutApplicationError("PAYOUT_INPUT_INVALID");
    }
    return status;
  }

  return Object.freeze({
    async listRequests(
      input: AdminPayoutRequestListInput = {},
    ): Promise<AdminPayoutRequestListResult> {
      const limit = listLimit(input.limit);
      const cursor = listCursor(input.cursor);
      const status = listStatus(input.status);
      const context = await authorizedContext();
      if (!dependencies.repository.listForAdmin) {
        throw new PayoutApplicationError("PAYOUT_UNEXPECTED_ERROR");
      }
      return dependencies.repository.listForAdmin(
        context.client,
        context.actor.userId,
        { status, cursor, limit },
      );
    },

    async getRequestDetail(
      payoutRequestId: string,
    ): Promise<AdminPayoutRequestDetail> {
      const requestId = parsePayoutUuid(payoutRequestId);
      const context = await authorizedContext();
      if (!dependencies.repository.getForAdmin) {
        throw new PayoutApplicationError("PAYOUT_UNEXPECTED_ERROR");
      }
      return dependencies.repository.getForAdmin(
        context.client,
        context.actor.userId,
        requestId,
      );
    },

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
