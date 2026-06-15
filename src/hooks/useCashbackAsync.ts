import { getCashbackDataServiceAsync } from "@/services/cashback.service";
import type { CashbackData } from "@/types/cashback";

export async function useCashbackAsync(): Promise<CashbackData> {
  const response = await getCashbackDataServiceAsync();
  return response.data;
}
