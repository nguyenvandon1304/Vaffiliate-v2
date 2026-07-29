import "server-only";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { requireAdmin } from "@/lib/auth/server-guard";
import {
  approvePayoutRequestAsync,
  confirmPayoutNonpaymentAsync,
  confirmPayoutPaymentAsync,
  markPayoutReviewRequiredAsync,
  rejectPayoutRequestAsync,
  startPayoutProcessingAsync,
} from "@/services/payout-admin.service";

import { createPayoutAdminEntryPoint } from "./payout-admin-entry-point-core";

export const payoutAdminEntryPoint = createPayoutAdminEntryPoint({
  requireAdmin,
  service: {
    approve: approvePayoutRequestAsync,
    reject: rejectPayoutRequestAsync,
    startProcessing: startPayoutProcessingAsync,
    markReviewRequired: markPayoutReviewRequiredAsync,
    confirmPayment: confirmPayoutPaymentAsync,
    confirmNonpayment: confirmPayoutNonpaymentAsync,
  },
  revalidate: revalidatePath,
  rethrow: unstable_rethrow,
});
