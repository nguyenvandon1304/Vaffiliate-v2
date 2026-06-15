import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/constants/api";
import { cashbackHistory, cashbackPlatforms } from "@/lib/mock";
import type { ApiResponse } from "@/types/api";
import type { CashbackData, CashbackHistoryItem, CashbackPlatform } from "@/types/cashback";

export function getCashbackPlatforms() {
  void API_ENDPOINTS.CASHBACK.PLATFORMS;
  return cashbackPlatforms;
}

export function getCashbackHistory() {
  void API_ENDPOINTS.CASHBACK.HISTORY;
  return cashbackHistory;
}

export function getCashbackData(): CashbackData {
  return {
    platforms: getCashbackPlatforms(),
    history: getCashbackHistory(),
  };
}

export async function getCashbackDataAsync(): Promise<ApiResponse<CashbackData>> {
  const [platforms, history] = await Promise.all([
    apiClient.get<CashbackPlatform[]>(API_ENDPOINTS.CASHBACK.PLATFORMS),
    apiClient.get<CashbackHistoryItem[]>(API_ENDPOINTS.CASHBACK.HISTORY),
  ]);
  return {
    success: true,
    data: {
      platforms: platforms.data,
      history: history.data,
    },
  };
}
