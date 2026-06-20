import { getOrdersDataServiceAsync } from "@/services/orders.service";
import type { OrderStatusFilter, OrdersData } from "@/types/orders";

export async function loadOrdersAsync(
  statusFilter?: OrderStatusFilter,
): Promise<OrdersData> {
  const response = await getOrdersDataServiceAsync(statusFilter);
  return response.data;
}
