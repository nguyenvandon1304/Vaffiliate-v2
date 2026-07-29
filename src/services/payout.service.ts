import "server-only";

import { requireUser } from "@/lib/auth/server-guard";
import { createClient } from "@/lib/supabase/server";
import {
  cancelPayoutRequestWithClientAsync,
  createPayoutRequestWithClientAsync,
  listOwnerPayoutRequestsWithClientAsync,
  loadOwnerPayoutRequestWithClientAsync,
} from "@/repositories/payout.repository";
import { createPayoutOwnerService } from "./payout-owner.service-core";

const productionService = createPayoutOwnerService({
  requireUser,
  createClient,
  repository: {
    list: listOwnerPayoutRequestsWithClientAsync,
    load: loadOwnerPayoutRequestWithClientAsync,
    create: createPayoutRequestWithClientAsync,
    cancel: cancelPayoutRequestWithClientAsync,
  },
});

export const listOwnerPayoutRequestsAsync = productionService.listRequests;
export const loadOwnerPayoutRequestAsync = productionService.loadRequest;
export const createOwnerPayoutRequestAsync = productionService.createRequest;
export const cancelOwnerPayoutRequestAsync = productionService.cancelRequest;
