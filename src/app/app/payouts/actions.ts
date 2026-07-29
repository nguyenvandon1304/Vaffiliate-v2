"use server";

import "server-only";

import type {
  PayoutEntryPointResult,
  PublicOwnedPayoutRequest,
  PublicPayoutRequestSummary,
} from "@/lib/payout/entry-point";

import type { PayoutMutationActionState } from "./action-state";
import { payoutOwnerEntryPoint } from "./payout-owner.server";

export async function listOwnerPayoutRequestsAction(): Promise<
  PayoutEntryPointResult<readonly PublicPayoutRequestSummary[]>
> {
  return payoutOwnerEntryPoint.listRequests();
}

export async function loadOwnerPayoutRequestAction(
  payoutRequestId: string,
): Promise<PayoutEntryPointResult<PublicOwnedPayoutRequest>> {
  return payoutOwnerEntryPoint.loadRequest(payoutRequestId);
}

export async function createOwnerPayoutRequestAction(
  _previousState: PayoutMutationActionState,
  formData: FormData,
): Promise<PayoutMutationActionState> {
  return payoutOwnerEntryPoint.createRequest(formData);
}

export async function cancelOwnerPayoutRequestAction(
  _previousState: PayoutMutationActionState,
  formData: FormData,
): Promise<PayoutMutationActionState> {
  return payoutOwnerEntryPoint.cancelRequest(formData);
}
