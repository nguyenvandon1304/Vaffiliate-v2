import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/constants/api";
import { financeSummary, financeTransactions } from "@/lib/mock";
import type { ApiResponse } from "@/types/api";
import type { FinanceData } from "@/types/finance";

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

export function getFinanceDataAsync(): Promise<ApiResponse<FinanceData>> {
  return apiClient.get(getFinanceData());
}
