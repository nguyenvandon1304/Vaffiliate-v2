import type { RecentOrder } from "@/types/orders";

export const recentOrders: RecentOrder[] = [
  { store: "Shopee", item: "Máy sấy tóc ion âm", status: "Đã ghi nhận", amount: "+18.000đ", total: "879.000đ", time: "2 giờ trước" },
  { store: "TikTok Shop", item: "Kem chống nắng SPF50", status: "Chờ đối soát", amount: "+26.000đ", total: "520.000đ", time: "Hôm qua" },
  { store: "Shopee", item: "Tai nghe không dây", status: "Đã duyệt hoa hồng", amount: "+54.000đ", total: "1.290.000đ", time: "3 ngày trước" },
  { store: "TikTok Shop", item: "Bình giữ nhiệt inox", status: "Có thể rút", amount: "+22.000đ", total: "339.000đ", time: "5 ngày trước" },
  { store: "Shopee", item: "Áo thun thể thao", status: "Từ chối", amount: "+0đ", total: "199.000đ", time: "1 tuần trước" },
];

export const orderFilters = ["Tất cả", "Đã ghi nhận", "Chờ đối soát", "Đã duyệt hoa hồng", "Có thể rút", "Từ chối"];
