import { getCashbackData, getCashbackPlatforms } from "@/repositories/cashback.repository";
import type { CashbackData } from "@/types/cashback";

export const cashbackService = {
  getCashbackPlatforms,
  getCashbackData,
};

export function getCashbackDataService(): CashbackData {
  return getCashbackData();
}
