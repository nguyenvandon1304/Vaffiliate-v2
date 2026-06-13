import { API_ENDPOINTS } from "@/lib/constants/api";
import { financeSummary, financeTransactions } from "@/lib/mock";

export function getFinanceSummary() {
  void API_ENDPOINTS.FINANCE.SUMMARY;
  return financeSummary;
}

export function getFinanceTransactions() {
  void API_ENDPOINTS.FINANCE.TRANSACTIONS;
  return financeTransactions;
}
