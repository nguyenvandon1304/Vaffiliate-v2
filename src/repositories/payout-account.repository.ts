import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { mapPayoutError, PayoutApplicationError } from "@/lib/payout/errors";
import { mapVerifiedPayoutAccountOption } from "@/lib/payout/validation";
import type { VerifiedPayoutAccountOption } from "@/types/payout";

const VERIFIED_ACCOUNT_COLUMNS = [
  "id",
  "method",
  "provider",
  "account_number",
  "status",
].join(",");

export async function listVerifiedPayoutAccountsWithClientAsync(
  client: SupabaseClient,
): Promise<readonly VerifiedPayoutAccountOption[]> {
  const { data, error } = await client
    .from("payout_accounts")
    .select(VERIFIED_ACCOUNT_COLUMNS)
    .eq("status", "verified");

  if (error) throw mapPayoutError(error);
  if (!Array.isArray(data)) {
    throw new PayoutApplicationError("PAYOUT_RESPONSE_INVALID");
  }
  return data.map(mapVerifiedPayoutAccountOption);
}
