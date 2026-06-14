import { getCashbackData, getCashbackDataAsync, getCashbackPlatforms } from "@/repositories/cashback.repository";
import type { ApiResponse } from "@/types/api";
import type { CashbackData } from "@/types/cashback";

export const cashbackService = {
  getCashbackPlatforms,
  getCashbackData,
  getCashbackDataAsync,
};

export function getCashbackDataService(): CashbackData {
  return getCashbackData();
}

export function getCashbackDataServiceAsync(): Promise<ApiResponse<CashbackData>> {
  return getCashbackDataAsync();
}
