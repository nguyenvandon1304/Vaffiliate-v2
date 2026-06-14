import { getOrdersDataServiceAsync } from "@/services/orders.service";
import type { OrdersData } from "@/types/orders";

export async function useOrdersAsync(): Promise<OrdersData> {
  const response = await getOrdersDataServiceAsync();
  return response.data;
}
