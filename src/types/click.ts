import type { PlatformLabel } from "@/types/common";

export type ClickPlatform = Extract<PlatformLabel, "Shopee" | "TikTok Shop">;

export interface ClickItem {
  id: string;
  platform: ClickPlatform;
  trackingCode: string;
  isUnique: boolean;
  createdAt: string;
}

export interface ClickData {
  clicks: ClickItem[];
}
