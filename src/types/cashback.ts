import type { TrackingLinkStatus } from "./affiliate";
import type { PlatformLabel } from "./common";
import type {
  CampaignId,
  OfferId,
  TrackingLinkId,
} from "./ids";

export interface CashbackPlatform {
  name: Extract<PlatformLabel, "Shopee" | "TikTok Shop">;
  description: string;
  cta: string;
}

export type CashbackPlatformName = Extract<PlatformLabel, "Shopee" | "TikTok Shop">;

export type CashbackPlatformCode =
  | "shopee"
  | "tiktok";


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

export interface CashbackTrackingLinkResult {
  id: TrackingLinkId;
  shortCode: string;
  destinationUrl: string;
  platform: CashbackPlatformCode;
  campaignId: CampaignId | null;
  offerId: OfferId | null;
  status: TrackingLinkStatus;
  createdAt: string;
  trackingPath: string;
}

export interface CreateCashbackTrackingLinkActionState {
  success: boolean;
  message: string;
  trackingLink: CashbackTrackingLinkResult | null;
}
