import { financeService } from "@/services/finance.service";

export function useFinance() {
  return financeService.getFinanceSummary();
}
