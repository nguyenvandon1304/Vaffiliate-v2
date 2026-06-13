import { API_ENDPOINTS } from "@/lib/constants/api";
import { cashbackPlatforms } from "@/lib/mock";
import type { CashbackData } from "@/types/cashback";

export function getCashbackPlatforms() {
  void API_ENDPOINTS.CASHBACK.PLATFORMS;
  return cashbackPlatforms;
}

export function getCashbackData(): CashbackData {
  return {
    platforms: getCashbackPlatforms(),
  };
}
