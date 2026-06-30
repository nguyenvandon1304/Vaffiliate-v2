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
  networkSubId: string;
  affiliateUrl: string | null;
  trackingPath: string;
}

export interface CreateCashbackTrackingLinkActionState {
  success: boolean;
  message: string;
  trackingLink: CashbackTrackingLinkResult | null;
}
export interface ProvisionShopeeAffiliateUrlActionState {
  success: boolean;
  message: string;
  trackingLinkId: TrackingLinkId | null;
  affiliateUrl: string | null;
}
export type ShopeeProductPreviewErrorCode =
  | "invalid_url"
  | "unsupported_host"
  | "not_product_url"
  | "redirect_failed"
  | "too_many_redirects"
  | "request_timeout"
  | "service_unavailable"
  | "product_not_found"
  | "invalid_response"
  | "commission_unavailable";

export interface ShopeeProductPreview {
  platform: "shopee";

  shopId: string;
  itemId: string;

  productUrl: string;
  productName: string;
  shopName: string | null;
  imageUrl: string | null;

  priceVnd: number;
  sales: number | null;
  rating: number | null;

  estimatedCommissionVnd: number;
  sellerCommissionVnd: number;
  shopeeCommissionVnd: number;

  cashbackShareBps: number;
  estimatedCashbackVnd: number;
  estimatedCashbackRatePercent: number;

  isXtra: boolean;
  isCapped: boolean;
  commissionCapVnd: number | null;

  partnerDataUpdatedAt: string | null;
  fetchedAt: string;
  dataSource: "api" | "db";
}

export interface PreviewShopeeProductActionState {
  success: boolean;
  message: string;
  errorCode: ShopeeProductPreviewErrorCode | null;
  preview: ShopeeProductPreview | null;
}