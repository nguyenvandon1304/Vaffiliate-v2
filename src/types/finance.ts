export type FinanceTransactionStatus = "Hoàn tất" | "Đã cộng ví" | "Tạm giữ";

export interface FinanceTransaction {
  title: string;
  amount: string;
  time: string;
  status: FinanceTransactionStatus;
}

export interface FinanceSummaryItem {
  label: string;
  value: string;
}

export type FinanceSummary = FinanceSummaryItem[];

export interface FinanceData {
  summary: FinanceSummary;
  transactions: FinanceTransaction[];
}
