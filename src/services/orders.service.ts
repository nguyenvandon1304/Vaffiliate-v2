import { getOrderFilters, getOrders, getOrdersData } from "@/repositories/orders.repository";
import type { OrdersData } from "@/types/orders";

export const ordersService = {
  getOrderFilters,
  getOrders,
  getOrdersData,
};

export function getOrdersDataService(): OrdersData {
  return getOrdersData();
}
