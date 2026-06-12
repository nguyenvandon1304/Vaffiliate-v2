import { ordersService } from "@/services/orders.service";

export function useOrders() {
  return ordersService.getOrders();
}
