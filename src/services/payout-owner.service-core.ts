import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  CancelPayoutRequestInput,
  CreatePayoutRequestInput,
  OwnedPayoutRequest,
  PayoutMutationResult,
  PayoutRequestSummary,
} from "@/types/payout";

export interface PayoutOwnerServiceDependencies {
  readonly requireUser: (nextPath: string) => Promise<unknown>;
  readonly createClient: () => Promise<SupabaseClient>;
  readonly repository: {
    readonly list: (
      client: SupabaseClient,
    ) => Promise<readonly PayoutRequestSummary[]>;
    readonly load: (
      client: SupabaseClient,
      payoutRequestId: string,
    ) => Promise<OwnedPayoutRequest>;
    readonly create: (
      client: SupabaseClient,
      input: CreatePayoutRequestInput,
    ) => Promise<PayoutMutationResult>;
    readonly cancel: (
      client: SupabaseClient,
      input: CancelPayoutRequestInput,
    ) => Promise<PayoutMutationResult>;
  };
}

export function createPayoutOwnerService(
  dependencies: PayoutOwnerServiceDependencies,
) {
  async function authenticatedClient(): Promise<SupabaseClient> {
    await dependencies.requireUser("/app");
    return dependencies.createClient();
  }

  return Object.freeze({
    async listRequests(): Promise<readonly PayoutRequestSummary[]> {
      return dependencies.repository.list(await authenticatedClient());
    },
    async loadRequest(payoutRequestId: string): Promise<OwnedPayoutRequest> {
      return dependencies.repository.load(
        await authenticatedClient(),
        payoutRequestId,
      );
    },
    async createRequest(
      input: CreatePayoutRequestInput,
    ): Promise<PayoutMutationResult> {
      return dependencies.repository.create(await authenticatedClient(), {
        payoutAccountId: input.payoutAccountId,
        idempotencyKey: input.idempotencyKey,
      });
    },
    async cancelRequest(
      input: CancelPayoutRequestInput,
    ): Promise<PayoutMutationResult> {
      return dependencies.repository.cancel(await authenticatedClient(), {
        payoutRequestId: input.payoutRequestId,
        idempotencyKey: input.idempotencyKey,
      });
    },
  });
}
