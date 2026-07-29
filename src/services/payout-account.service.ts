import "server-only";

import { requireUser } from "@/lib/auth/server-guard";
import { createClient } from "@/lib/supabase/server";
import { listVerifiedPayoutAccountsWithClientAsync } from "@/repositories/payout-account.repository";

import { createPayoutAccountService } from "./payout-account.service-core";

const productionService = createPayoutAccountService({
  requireUser,
  createClient,
  repository: {
    listVerified: listVerifiedPayoutAccountsWithClientAsync,
  },
});

export const listVerifiedOwnerPayoutAccountsAsync =
  productionService.listVerifiedAccounts;
