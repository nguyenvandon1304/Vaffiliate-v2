import type {
  PayoutEntryPointResult,
  PublicPayoutMutation,
} from "@/lib/payout/entry-point";

export type PayoutAdminMutationActionState =
  | { readonly ok: null }
  | PayoutEntryPointResult<PublicPayoutMutation>;

export const INITIAL_PAYOUT_ADMIN_MUTATION_ACTION_STATE: PayoutAdminMutationActionState =
  { ok: null };
