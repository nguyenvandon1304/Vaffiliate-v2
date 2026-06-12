export type FinanceTransactionStatus = "Hoàn tất" | "Đã cộng ví" | "Tạm giữ";

export interface FinanceTransaction {
  title: string;
  amount: string;
  time: string;
  status: FinanceTransactionStatus;
}
