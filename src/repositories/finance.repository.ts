import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/constants/api";
import { financeSummary, financeTransactions } from "@/lib/mock";
import type { ApiResponse } from "@/types/api";
import type { FinanceData, FinanceSummary, FinanceTransaction } from "@/types/finance";

export function getFinanceSummary() {
  void API_ENDPOINTS.FINANCE.SUMMARY;
  return financeSummary;
}

export function getFinanceTransactions() {
  void API_ENDPOINTS.FINANCE.TRANSACTIONS;
  return financeTransactions;
}

export function getFinanceData(): FinanceData {
  return {
    summary: getFinanceSummary(),
    transactions: getFinanceTransactions(),
  };
}

export async function getFinanceDataAsync(): Promise<ApiResponse<FinanceData>> {
  const [summary, transactions] = await Promise.all([
    apiClient.get<FinanceSummary>(API_ENDPOINTS.FINANCE.SUMMARY),
    apiClient.get<FinanceTransaction[]>(API_ENDPOINTS.FINANCE.TRANSACTIONS),
  ]);
  return {
    success: true,
    data: {
      summary: summary.data,
      transactions: transactions.data,
    },
  };
}
