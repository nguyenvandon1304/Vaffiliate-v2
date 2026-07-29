import type {
  PayoutEntryPointResult,
  PublicPayoutMutation,
} from "@/lib/payout/entry-point";

export type PayoutMutationActionState =
  | { readonly ok: null }
  | PayoutEntryPointResult<PublicPayoutMutation>;

export const INITIAL_PAYOUT_MUTATION_ACTION_STATE: PayoutMutationActionState = {
  ok: null,
};
