import "server-only";

import { requireAdmin } from "@/lib/auth/server-guard";
import { createServiceRoleClient } from "@/lib/supabase/service-role.server";
import {
  approvePayoutRequestWithClientAsync,
  confirmPayoutNonpaymentWithClientAsync,
  confirmPayoutPaymentWithClientAsync,
  markPayoutReviewRequiredWithClientAsync,
  rejectPayoutRequestWithClientAsync,
  startPayoutProcessingWithClientAsync,
} from "@/repositories/payout-admin.repository";
import { createPayoutAdminService } from "./payout-admin.service-core";

const productionService = createPayoutAdminService({
  requireAdmin,
  createServiceRoleClient,
  repository: {
    approve: approvePayoutRequestWithClientAsync,
    reject: rejectPayoutRequestWithClientAsync,
    startProcessing: startPayoutProcessingWithClientAsync,
    markReviewRequired: markPayoutReviewRequiredWithClientAsync,
    confirmPayment: confirmPayoutPaymentWithClientAsync,
    confirmNonpayment: confirmPayoutNonpaymentWithClientAsync,
  },
});

export const approvePayoutRequestAsync = productionService.approve;
export const rejectPayoutRequestAsync = productionService.reject;
export const startPayoutProcessingAsync = productionService.startProcessing;
export const markPayoutReviewRequiredAsync =
  productionService.markReviewRequired;
export const confirmPayoutPaymentAsync = productionService.confirmPayment;
export const confirmPayoutNonpaymentAsync = productionService.confirmNonpayment;
