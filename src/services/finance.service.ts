import { getFinanceDataAsync } from "@/repositories/finance.repository";
import type { ApiResponse } from "@/types/api";
import type { FinanceData } from "@/types/finance";

export function getFinanceDataServiceAsync(): Promise<ApiResponse<FinanceData>> {
  return getFinanceDataAsync();
}
