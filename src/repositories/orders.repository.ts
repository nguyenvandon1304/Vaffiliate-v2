import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/constants/api";
import { orderFilters, recentOrders } from "@/lib/mock";
import type { ApiResponse } from "@/types/api";
import type { OrdersData } from "@/types/orders";

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

export function getOrdersDataAsync(): Promise<ApiResponse<OrdersData>> {
  return apiClient.get(getOrdersData());
}
