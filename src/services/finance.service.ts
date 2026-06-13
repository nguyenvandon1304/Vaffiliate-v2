import { getFinanceData, getFinanceSummary, getFinanceTransactions } from "@/repositories/finance.repository";
import type { FinanceData } from "@/types/finance";

export const financeService = {
  getFinanceSummary,
  getFinanceTransactions,
  getFinanceData,
};

export function getFinanceDataService(): FinanceData {
  return getFinanceData();
}
