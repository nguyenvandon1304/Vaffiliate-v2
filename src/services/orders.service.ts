import { getOrdersDataAsync } from "@/repositories/orders.repository";
import type { ApiResponse } from "@/types/api";
import type { OrdersData } from "@/types/orders";

export function getOrdersDataServiceAsync(): Promise<ApiResponse<OrdersData>> {
  return getOrdersDataAsync();
}
