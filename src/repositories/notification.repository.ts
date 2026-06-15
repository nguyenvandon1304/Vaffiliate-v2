import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/constants/api";
import type { ApiResponse } from "@/types/api";
import type { NotificationData, NotificationItem } from "@/types/notification";

export async function getNotificationDataAsync(): Promise<ApiResponse<NotificationData>> {
  const notifications = await apiClient.get<NotificationItem[]>(
    API_ENDPOINTS.NOTIFICATION.LIST
  );
  return {
    success: true,
    data: {
      notifications: notifications.data,
    },
  };
}
