import type {
  Order,
  OrderStatusFilter,
  } from "@/types/orders";

  export const orderFilters: OrderStatusFilter[] = [
  "all",
  "pending",
  "approved",
  "rejected",
  "payable",
  "paid",
  ];

  export const recentOrders: Order[] = [
  {
  store: "Shopee",
  item: "Máy sấy tóc ion âm",
  status: "recorded",
  amount: "+18.000đ",
  total: "879.000đ",
  time: "2 giờ trước",
  },
  {
  store: "TikTok Shop",
  item: "Kem chống nắng SPF50",
  status: "reconciling",
  amount: "+26.000đ",
  total: "520.000đ",
  time: "Hôm qua",
  },
  {
  store: "Shopee",
  item: "Tai nghe không dây",
  status: "approved",
  amount: "+54.000đ",
  total: "1.290.000đ",
  time: "3 ngày trước",
  },
  {
  store: "TikTok Shop",
  item: "Bình giữ nhiệt inox",
  status: "payable",
  amount: "+22.000đ",
  total: "339.000đ",
  time: "5 ngày trước",
  },
  {
  store: "Shopee",
  item: "Áo thun thể thao",
  status: "rejected",
  amount: "+0đ",
  total: "199.000đ",
  time: "1 tuần trước",
  },
  {
  store: "TikTok Shop",
  item: "Máy xay sinh tố mini",
  status: "paid",
  amount: "+31.000đ",
  total: "629.000đ",
  time: "2 tuần trước",
  },
  ];
