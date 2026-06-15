import type { PlatformLabel } from "./common";

export type AdvertiserId = string;
export type CampaignId = string;
export type OfferId = string;
export type TrackingLinkId = string;
export type ConversionId = string;

export type CommissionModel = "CPS" | "CPA" | "CPC" | "CPL";
export type CampaignStatus = "draft" | "active" | "paused" | "ended";
export type ConversionStatus = "pending" | "approved" | "rejected" | "paid";

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
  offerId: OfferId;
  url: string;
  shortCode: string;
  createdAt: string;
}

export interface Conversion {
  id: ConversionId;
  trackingLinkId: TrackingLinkId;
  status: ConversionStatus;
  orderValue: string;
  occurredAt: string;
}

export interface AffiliateData {
  advertisers: Advertiser[];
  campaigns: Campaign[];
  offers: Offer[];
  trackingLinks: TrackingLink[];
  conversions: Conversion[];
}

export type OfferPlatform = "shopee" | "tiktok";

export interface OfferView {
  id: OfferId;
  title: string;
  platform: OfferPlatform;
  category: string;
  commissionRate: string;
  status: CampaignStatus;
}

export interface OfferStat {
  label: string;
  value: string;
}

export type SupportedPlatformLabel = "Shopee" | "TikTok Shop";

export interface TrackingLinkView {
  id: TrackingLinkId;
  shortCode: string;
  destinationUrl: string;
  offerTitle: string;
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
  orderValue: string;
  commissionValue: string;
  status: ConversionStatus;
  createdAt: string;
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
  orderValue: string;
  commissionValue: string;
  status: ConversionStatus;
}

export interface CommissionStat {
  label: string;
  value: string;
}

export interface PlatformCommission {
  platform: SupportedPlatformLabel;
  conversions: number;
  totalCommission: string;
}

export interface CampaignCommission {
  campaignName: string;
  platform: SupportedPlatformLabel;
  conversions: number;
  totalCommission: string;
}

export interface RevenueStat {
  label: string;
  value: string;
}

export interface RevenuePlatform {
  platform: SupportedPlatformLabel;
  revenue: string;
  commission: string;
  conversions: number;
}

export interface RevenueCampaign {
  campaignName: string;
  platform: SupportedPlatformLabel;
  revenue: string;
  commission: string;
  conversionCount: number;
}

export interface RevenueOffer {
  offerTitle: string;
  platform: SupportedPlatformLabel;
  revenue: string;
  commission: string;
  conversionCount: number;
}
