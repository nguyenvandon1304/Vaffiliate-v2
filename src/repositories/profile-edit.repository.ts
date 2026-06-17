import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/constants/api";
import type { ApiResponse } from "@/types/api";
import type { PayoutAccount, PayoutAccountUpdateInput, Profile, ProfileUpdateInput } from "@/types/profile";

export async function saveProfileEditAsync(
  input: ProfileUpdateInput,
): Promise<ApiResponse<Profile>> {
  return apiClient.post<Profile, ProfileUpdateInput>(API_ENDPOINTS.PROFILE.UPDATE, input);
}

export async function savePayoutAccountAsync(
  input: PayoutAccountUpdateInput,
): Promise<ApiResponse<PayoutAccount>> {
  return apiClient.post<PayoutAccount, PayoutAccountUpdateInput>(
    API_ENDPOINTS.PROFILE.PAYOUT_UPDATE,
    input,
  );
}
