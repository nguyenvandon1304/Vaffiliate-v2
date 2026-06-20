import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/constants/api";
import { matchesOrderStatusFilter } from "@/lib/filterUtils";
import type { ApiResponse } from "@/types/api";
import type {
Order,
OrderStatusFilter,
OrdersData,
} from "@/types/orders";

export async function getOrdersDataAsync(
filter: OrderStatusFilter = "all",
): Promise<ApiResponse<OrdersData>> {
const response = await apiClient.get<Order[]>(
API_ENDPOINTS.ORDERS.LIST,
);

return {
...response,
data: {
orders: response.data.filter((order) =>
matchesOrderStatusFilter(order.status, filter),
),
},
};
}
