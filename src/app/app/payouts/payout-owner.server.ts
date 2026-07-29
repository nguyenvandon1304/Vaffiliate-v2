import "server-only";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { requireUser } from "@/lib/auth/server-guard";
import {
  cancelOwnerPayoutRequestAsync,
  createOwnerPayoutRequestAsync,
  listOwnerPayoutRequestsAsync,
  loadOwnerPayoutRequestAsync,
} from "@/services/payout.service";

import { createPayoutOwnerEntryPoint } from "./payout-owner-entry-point-core";

export const payoutOwnerEntryPoint = createPayoutOwnerEntryPoint({
  requireUser,
  service: {
    listRequests: listOwnerPayoutRequestsAsync,
    loadRequest: loadOwnerPayoutRequestAsync,
    createRequest: createOwnerPayoutRequestAsync,
    cancelRequest: cancelOwnerPayoutRequestAsync,
  },
  revalidate: revalidatePath,
  rethrow: unstable_rethrow,
});
