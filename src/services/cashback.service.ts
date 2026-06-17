import { getCashbackDataAsync } from "@/repositories/cashback.repository";
import type { ApiResponse } from "@/types/api";
import type { CashbackData } from "@/types/cashback";

export function getCashbackDataServiceAsync(): Promise<ApiResponse<CashbackData>> {
  return getCashbackDataAsync();
}
