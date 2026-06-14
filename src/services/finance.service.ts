import { getFinanceData, getFinanceDataAsync, getFinanceSummary, getFinanceTransactions } from "@/repositories/finance.repository";
import type { ApiResponse } from "@/types/api";
import type { FinanceData } from "@/types/finance";

export const financeService = {
  getFinanceSummary,
  getFinanceTransactions,
  getFinanceData,
  getFinanceDataAsync,
};

export function getFinanceDataService(): FinanceData {
  return getFinanceData();
}

export function getFinanceDataServiceAsync(): Promise<ApiResponse<FinanceData>> {
  return getFinanceDataAsync();
}
