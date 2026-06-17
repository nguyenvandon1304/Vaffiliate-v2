import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/constants/api";
import type { ApiResponse } from "@/types/api";
import type { PayoutAccount, Profile, ProfileData } from "@/types/profile";

export async function getProfileDataAsync(): Promise<ApiResponse<ProfileData>> {
  const [profile, payoutAccount] = await Promise.all([
    apiClient.get<Profile>(API_ENDPOINTS.PROFILE.DETAIL),
    apiClient.get<PayoutAccount>(API_ENDPOINTS.PROFILE.PAYOUT_ACCOUNT),
  ]);
  return {
    success: true,
    data: {
      profile: {
        ...profile.data,
        payoutAccount: payoutAccount.data,
      },
    },
  };
}
