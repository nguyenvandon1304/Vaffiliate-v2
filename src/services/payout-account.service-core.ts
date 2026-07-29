import type { SupabaseClient } from "@supabase/supabase-js";

import type { VerifiedPayoutAccountOption } from "@/types/payout";

export interface PayoutAccountServiceDependencies {
  readonly requireUser: (nextPath: string) => Promise<unknown>;
  readonly createClient: () => Promise<SupabaseClient>;
  readonly repository: {
    readonly listVerified: (
      client: SupabaseClient,
    ) => Promise<readonly VerifiedPayoutAccountOption[]>;
  };
}

export function createPayoutAccountService(
  dependencies: PayoutAccountServiceDependencies,
) {
  return Object.freeze({
    async listVerifiedAccounts(): Promise<
      readonly VerifiedPayoutAccountOption[]
    > {
      await dependencies.requireUser("/app/payouts");
      const client = await dependencies.createClient();
      return dependencies.repository.listVerified(client);
    },
  });
}
