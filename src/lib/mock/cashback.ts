import type { CashbackHistoryItem, CashbackPlatform } from "@/types/cashback";

export const cashbackPlatforms: CashbackPlatform[] = [
  { name: "Shopee", description: "Lấy link hoàn tiền và mua sắm như bình thường trên Shopee.", cta: "Lấy link hoàn tiền" },
  { name: "TikTok Shop", description: "Mua sắm qua link TikTok Shop và nhận hoàn tiền sau khi đơn được ghi nhận, hoa hồng được duyệt.", cta: "Lấy link hoàn tiền" },
];

export const cashbackHistory: CashbackHistoryItem[] = [
  { id: "cb-001", platform: "Shopee", title: "Máy sấy tóc ion âm", amount: "18.000đ", status: "approved", date: "2026-06-02" },
  { id: "cb-002", platform: "TikTok Shop", title: "Kem chống nắng SPF50", amount: "26.000đ", status: "pending", date: "2026-06-06" },
  { id: "cb-003", platform: "Shopee", title: "Tai nghe không dây", amount: "54.000đ", status: "paid", date: "2026-06-09" },
  { id: "cb-004", platform: "TikTok Shop", title: "Bình giữ nhiệt inox", amount: "22.000đ", status: "approved", date: "2026-06-11" },
  { id: "cb-005", platform: "Shopee", title: "Áo thun thể thao", amount: "12.000đ", status: "pending", date: "2026-06-13" },
];
