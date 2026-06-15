import { getNotificationDataServiceAsync } from "@/services/notification.service";
import type { NotificationData } from "@/types/notification";

export async function useNotificationAsync(): Promise<NotificationData> {
  const response = await getNotificationDataServiceAsync();
  return response.data;
}
