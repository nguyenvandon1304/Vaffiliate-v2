import type { PlatformLabel } from "./common";

export type NotificationType =
  | "order_recorded"
  | "commission_approved"
  | "commission_paid"
  | "campaign_new"
  | "offer_new";

export type NotificationPlatform = Extract<PlatformLabel, "Shopee" | "TikTok Shop">;

export interface NotificationItem {
  id: string;
  platform: NotificationPlatform;
  type: NotificationType;
  title: string;
  description: string;
  createdAt: string;
  isRead: boolean;
}

export interface NotificationData {
  notifications: NotificationItem[];
}

export interface NotificationStat {
  label: string;
  value: string;
}
