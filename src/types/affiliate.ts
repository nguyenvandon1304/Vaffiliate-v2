import type { PlatformLabel } from "./common";
import type {
  AdvertiserId,
  CampaignId,
  ConversionId,
  OfferId,
  OrderId,
  PublisherId,
  TrackingLinkId,
  WalletTransactionId,
  WithdrawRequestId,
} from "./ids";
import type { PublisherProfile } from "./publisher";

export type CommissionModel = "CPS" | "CPA" | "CPC" | "CPL";
export type CampaignStatus = "draft" | "active" | "paused" | "ended";
export type ConversionStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "payable"
  | "paid";
// TODO(domain): split conversion validation status
// from cashback/commission settlement status
// when backend settlement flow is implemented.

// Money model — canonical representation for all monetary values
export type CurrencyCode = "VND";

export interface Money {
  amount: number;
  currency: CurrencyCode;
}

// Tracking link lifecycle
export type TrackingLinkStatus = "active" | "paused" | "disabled";

export interface Advertiser {
  id: AdvertiserId;
  name: string;
  platform: PlatformLabel;
  logoUrl?: string;
}

export interface Campaign {
  id: CampaignId;
  advertiserId: AdvertiserId;
  name: string;
  status: CampaignStatus;
  startDate: string;
  endDate?: string;
}

export interface Offer {
  id: OfferId;
  campaignId: CampaignId;
  title: string;
  commissionModel: CommissionModel;
  commissionRate: string;
  category?: string;
}

export interface TrackingLink {
  id: TrackingLinkId;
  publisherId: PublisherId;
  campaignId: CampaignId;
  offerId: OfferId;
  destinationUrl: string;
  trackingUrl: string;
  shortCode: string;
  status: TrackingLinkStatus;
  createdAt: string;
  // TODO(migration): All consumers should migrate to trackingUrl.
  // legacy field — mirrors trackingUrl for backward compat.
  url?: string;
}

export interface Conversion {
  id: ConversionId;
  orderId: OrderId;
  advertiserId: AdvertiserId;
  campaignId: CampaignId;
  offerId: OfferId;
  publisherId: PublisherId;
  trackingLinkId: TrackingLinkId;
  status: ConversionStatus;
  orderAmount: Money;
  networkCommission: Money;
  userCashback: Money;
  platformProfit: Money;
  occurredAt: string;
  approvedAt?: string;
  payableAt?: string;
  paidAt?: string;
  rejectedAt?: string;
  rejectedReason?: string;
  // TODO: migrate UI to orderAmount — legacy field kept for backward compat
  orderValue?: string;
}

export interface AffiliateData {
  advertisers: Advertiser[];
  campaigns: Campaign[];
  offers: Offer[];
  trackingLinks: TrackingLink[];
  conversions: Conversion[];
  joinedOfferIds: OfferId[];
  publisherProfile: PublisherProfile;
  trackingLinkStats: TrackingLinkStatsMap;
}

export type OfferJoinStatus = "not_joined" | "joined" | "paused";

export interface TrackingLinkMetrics {
  epc: number;
  aov: number;
  conversionRate: number;
}

export interface TrackingLinkStats {
  clicks: number;
  uniqueClicks: number;
  conversionCount: number;
  commission: Money;
  metrics: TrackingLinkMetrics;
}

export type TrackingLinkStatsMap = Record<TrackingLinkId, TrackingLinkStats>;

export interface OfferRequirement {
  label: string;
  value: string;
}

export interface OfferTrackingRules {
  cookieDurationDays: number;
  allowedChannels: string[];
  trafficRules: string[];
}

export interface OfferDetail {
  offer: Offer;
  campaign: Campaign;
  advertiser: Advertiser;
  joinStatus: OfferJoinStatus;
  requirements: OfferRequirement[];
  trackingRules: OfferTrackingRules;
}

export interface CampaignDetail {
  campaign: Campaign;
  advertiser: Advertiser;
  commission: {
    model: CommissionModel;
    rate: string;
    note?: string;
  };
  trackingSettings: {
    baseUrl: string;
    defaultDestinationUrl: string;
    supportedParameters: string[];
  };
  statistics: CampaignStatistic[];
}

export interface CampaignStatistic {
  label: string;
  value: string;
}

export type OfferPlatform = "shopee" | "tiktok";

export interface OfferView {
  id: OfferId;
  title: string;
  platform: OfferPlatform;
  category: string;
  commissionRate: string;
  status: CampaignStatus;
  campaignId: CampaignId;
  campaignName: string;
}

export interface OfferStat {
  label: string;
  value: string;
}

export type SupportedPlatformLabel = "Shopee" | "TikTok Shop";

export interface TrackingLinkView {
  id: TrackingLinkId;
  shortCode: string;

  trackingUrl: string;
  destinationUrl: string;

  offerTitle: string;
  campaignId: CampaignId;
  campaignName: string;
  advertiserName: string;
  platform: SupportedPlatformLabel;
  commissionRate: string;
}

export interface TrackingLinkStat {
  label: string;
  value: string;
}

export interface ConversionView {
  id: ConversionId;
  platform: SupportedPlatformLabel;
  advertiserName: string;
  campaignName: string;
  offerTitle: string;
  trackingCode: string;
  commissionRate: string;
  orderAmount: Money;
  networkCommission: Money;
  userCashback: Money;
  status: ConversionStatus;
  occurredAt: string;
  // TODO: migrate UI to Money fields — legacy fields kept for backward compat
  orderValue?: string;
  commissionValue?: string;
}

export interface ConversionStat {
  label: string;
  value: string;
}

export interface CommissionView {
  id: ConversionId;
  platform: SupportedPlatformLabel;
  campaignName: string;
  offerTitle: string;
  orderAmount: Money;
  networkCommission: Money;
  userCashback: Money;
  status: ConversionStatus;
  // TODO: migrate UI to Money fields — legacy fields kept for backward compat
  orderValue?: string;
  commissionValue?: string;
}

export interface CommissionStat {
  label: string;
  value: string;
}

export interface PlatformCommission {
  platform: SupportedPlatformLabel;
  conversions: number;
  totalCommission: Money;
}

export interface CampaignCommission {
  campaignName: string;
  platform: SupportedPlatformLabel;
  conversions: number;
  totalCommission: Money;
}

export interface RevenueStat {
  label: string;
  value: string;
}

export interface RevenuePlatform {
  platform: SupportedPlatformLabel;
  gmv: Money;
  publisherCashback: Money;
  conversions: number;
}

export interface RevenueCampaign {
  campaignName: string;
  platform: SupportedPlatformLabel;
  gmv: Money;
  publisherCashback: Money;
  conversionCount: number;
}

export interface RevenueOffer {
  offerTitle: string;
  platform: SupportedPlatformLabel;
  gmv: Money;
  publisherCashback: Money;
  conversionCount: number;
}

// ─── Wallet Domain ───────────────────────────────────────────────────────────

export type WalletTransactionType =
  | "cashback_pending"
  | "cashback_available"
  | "withdraw_requested"
  | "withdraw_paid"
  | "adjustment";

export interface WalletTransaction {
  id: WalletTransactionId;
  publisherId: PublisherId;
  conversionId?: ConversionId;
  withdrawRequestId?: WithdrawRequestId;
  type: WalletTransactionType;
  amount: Money;
  balanceAfter: Money;
  note?: string;
  createdAt: string;
}

export type WithdrawStatus =
  | "requested"
  | "approved"
  | "rejected"
  | "paid"
  | "cancelled";

export interface WithdrawRequest {
  id: WithdrawRequestId;
  publisherId: PublisherId;
  amount: Money;
  status: WithdrawStatus;
  requestedAt: string;
  approvedAt?: string;
  paidAt?: string;
  rejectedAt?: string;
  cancelledAt?: string;
  rejectedReason?: string;
}
