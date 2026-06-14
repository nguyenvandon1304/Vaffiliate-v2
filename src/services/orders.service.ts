import { getOrderFilters, getOrders, getOrdersData, getOrdersDataAsync } from "@/repositories/orders.repository";
import type { ApiResponse } from "@/types/api";
import type { OrdersData } from "@/types/orders";

export const ordersService = {
  getOrderFilters,
  getOrders,
  getOrdersData,
  getOrdersDataAsync,
};

export function getOrdersDataService(): OrdersData {
  return getOrdersData();
}

export function getOrdersDataServiceAsync(): Promise<ApiResponse<OrdersData>> {
  return getOrdersDataAsync();
}
