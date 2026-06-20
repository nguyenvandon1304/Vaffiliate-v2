import type { PlatformLabel } from "./common";

export type OrderStatus =
| "recorded"
| "reconciling"
| "approved"
| "rejected"
| "payable"
| "paid";

export type OrderStatusFilter =
| "all"
| "pending"
| "approved"
| "rejected"
| "payable"
| "paid";

export type OrderDisplayStatus =
| "Đã ghi nhận"
| "Chờ đối soát"
| "Đã duyệt hoa hồng"
| "Có thể rút"
| "Đã thanh toán"
| "Từ chối";

export interface Order {
store: Extract<PlatformLabel, "Shopee" | "TikTok Shop">;
item: string;
status: OrderStatus;
amount: string;
total: string;
time: string;
}

export type RecentOrder = Order;

export interface OrdersData {
orders: Order[];
}
