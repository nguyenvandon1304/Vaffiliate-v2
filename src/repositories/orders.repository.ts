import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/constants/api";
import type { ApiResponse } from "@/types/api";
import type { Order, OrderFilter, OrdersData } from "@/types/orders";

export async function getOrdersDataAsync(): Promise<ApiResponse<OrdersData>> {
  const [filters, orders] = await Promise.all([
    apiClient.get<OrderFilter[]>(API_ENDPOINTS.ORDERS.FILTERS),
    apiClient.get<Order[]>(API_ENDPOINTS.ORDERS.LIST),
  ]);
  return {
    success: true,
    data: {
      filters: filters.data,
      orders: orders.data,
    },
  };
}
