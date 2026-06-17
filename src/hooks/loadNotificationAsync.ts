import { getNotificationDataServiceAsync } from "@/services/notification.service";
import type { NotificationData } from "@/types/notification";

export async function loadNotificationAsync(): Promise<NotificationData> {
  const response = await getNotificationDataServiceAsync();
  return response.data;
}
