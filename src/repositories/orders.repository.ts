import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/constants/api";
import { orderFilters, recentOrders } from "@/lib/mock";
import type { ApiResponse } from "@/types/api";
import type { Order, OrderFilter, OrdersData } from "@/types/orders";

export function getOrders() {
  void API_ENDPOINTS.ORDERS.LIST;
  return recentOrders;
}

export function getOrderFilters() {
  void API_ENDPOINTS.ORDERS.FILTERS;
  return orderFilters;
}

export function getOrdersData(): OrdersData {
  return {
    filters: getOrderFilters(),
    orders: getOrders(),
  };
}

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
