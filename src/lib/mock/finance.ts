import type { FinanceTransaction } from "@/types/finance";

export const financeSummary = [
  { label: "Có thể rút", value: "245.000đ" },
  { label: "Chờ đối soát", value: "128.000đ" },
  { label: "Tổng đã rút", value: "1.420.000đ" },
];

export const financeTransactions: FinanceTransaction[] = [
  { title: "Rút tiền về tài khoản", amount: "-500.000đ", time: "06/06/2026", status: "Hoàn tất" },
  { title: "Hoa hồng được duyệt", amount: "+54.000đ", time: "04/06/2026", status: "Đã cộng ví" },
  { title: "Tiền hoàn chờ đối soát", amount: "+26.000đ", time: "03/06/2026", status: "Tạm giữ" },
];
