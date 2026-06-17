import { getFinanceDataServiceAsync } from "@/services/finance.service";
import type { FinanceData } from "@/types/finance";

export async function loadFinanceAsync(): Promise<FinanceData> {
  const response = await getFinanceDataServiceAsync();
  return response.data;
}
