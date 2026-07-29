"use server";

import "server-only";

import type { PayoutAdminMutationActionState } from "./action-state";
import { payoutAdminEntryPoint } from "./payout-admin.server";

export async function approvePayoutRequestAction(
  _previousState: PayoutAdminMutationActionState,
  formData: FormData,
): Promise<PayoutAdminMutationActionState> {
  return payoutAdminEntryPoint.approve(formData);
}

export async function rejectPayoutRequestAction(
  _previousState: PayoutAdminMutationActionState,
  formData: FormData,
): Promise<PayoutAdminMutationActionState> {
  return payoutAdminEntryPoint.reject(formData);
}

export async function startPayoutProcessingAction(
  _previousState: PayoutAdminMutationActionState,
  formData: FormData,
): Promise<PayoutAdminMutationActionState> {
  return payoutAdminEntryPoint.startProcessing(formData);
}

export async function markPayoutReviewRequiredAction(
  _previousState: PayoutAdminMutationActionState,
  formData: FormData,
): Promise<PayoutAdminMutationActionState> {
  return payoutAdminEntryPoint.markReviewRequired(formData);
}

export async function confirmPayoutPaymentAction(
  _previousState: PayoutAdminMutationActionState,
  formData: FormData,
): Promise<PayoutAdminMutationActionState> {
  return payoutAdminEntryPoint.confirmPayment(formData);
}

export async function confirmPayoutNonpaymentAction(
  _previousState: PayoutAdminMutationActionState,
  formData: FormData,
): Promise<PayoutAdminMutationActionState> {
  return payoutAdminEntryPoint.confirmNonpayment(formData);
}
