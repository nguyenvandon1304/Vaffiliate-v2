import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/constants/api";
import type { ApiResponse } from "@/types/api";
import type { FinanceData, FinanceSummary, FinanceTransaction } from "@/types/finance";

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
