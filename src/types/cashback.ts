import type { PlatformLabel } from "./common";

export interface CashbackPlatform {
  name: Extract<PlatformLabel, "Shopee" | "TikTok Shop">;
  description: string;
  cta: string;
}

export type CashbackPlatformName = Extract<PlatformLabel, "Shopee" | "TikTok Shop">;

export type CashbackStatus = "pending" | "approved" | "paid";

export interface CashbackHistoryItem {
  id: string;
  platform: CashbackPlatformName;
  title: string;
  amount: string;
  status: CashbackStatus;
  date: string;
}

export interface CashbackData {
  platforms: CashbackPlatform[];
  history: CashbackHistoryItem[];
}

export interface CashbackStat {
  label: string;
  value: string;
}
