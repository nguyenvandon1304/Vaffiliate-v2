import { API_ENDPOINTS } from "@/lib/constants/api";
import { orderFilters, recentOrders } from "@/lib/mock";

export function getOrders() {
  void API_ENDPOINTS.ORDERS.LIST;
  return recentOrders;
}

export function getOrderFilters() {
  void API_ENDPOINTS.ORDERS.FILTERS;
  return orderFilters;
}
