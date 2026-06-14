import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/constants/api";
import { cashbackPlatforms } from "@/lib/mock";
import type { ApiResponse } from "@/types/api";
import type { CashbackData, CashbackPlatform } from "@/types/cashback";

export function getCashbackPlatforms() {
  void API_ENDPOINTS.CASHBACK.PLATFORMS;
  return cashbackPlatforms;
}

export function getCashbackData(): CashbackData {
  return {
    platforms: getCashbackPlatforms(),
  };
}

export async function getCashbackDataAsync(): Promise<ApiResponse<CashbackData>> {
  const platforms = await apiClient.get<CashbackPlatform[]>(
    API_ENDPOINTS.CASHBACK.PLATFORMS
  );
  return {
    success: true,
    data: {
      platforms: platforms.data,
    },
  };
}
