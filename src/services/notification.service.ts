import { getNotificationDataAsync } from "@/repositories/notification.repository";
import type { ApiResponse } from "@/types/api";
import type { NotificationData } from "@/types/notification";

export const notificationService = {
  getNotificationDataAsync,
};

export function getNotificationDataServiceAsync(): Promise<ApiResponse<NotificationData>> {
  return getNotificationDataAsync();
}
