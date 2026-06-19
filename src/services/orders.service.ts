import { getOrdersDataAsync } from "@/repositories/orders.repository";
import type { ApiResponse } from "@/types/api";
import type { OrderStatusFilter, OrdersData } from "@/types/orders";

export function getOrdersDataServiceAsync(
  statusFilter?: OrderStatusFilter,
): Promise<ApiResponse<OrdersData>> {
  return getOrdersDataAsync(statusFilter);
}
