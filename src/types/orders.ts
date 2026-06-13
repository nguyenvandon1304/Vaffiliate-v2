import type { PlatformLabel } from "./common";

export type OrderStatus =
  | "Đã ghi nhận"
  | "Chờ đối soát"
  | "Đã duyệt hoa hồng"
  | "Có thể rút"
  | "Từ chối";

export interface RecentOrder {
  store: Extract<PlatformLabel, "Shopee" | "TikTok Shop">;
  item: string;
  status: OrderStatus;
  amount: string;
  total: string;
  time: string;
}

export type Order = RecentOrder;

export type OrderFilter = string;

export interface OrdersData {
  filters: OrderFilter[];
  orders: Order[];
}
