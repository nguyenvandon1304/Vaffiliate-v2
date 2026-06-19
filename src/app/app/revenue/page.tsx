import AppShell from "@/components/layout/AppShell";
import AppSection from "@/components/layout/AppSection";
import PageHeader from "@/components/layout/PageHeader";
import RevenueCampaignTable from "@/features/revenue/RevenueCampaignTable";
import RevenueOfferTable from "@/features/revenue/RevenueOfferTable";
import RevenuePlatformBreakdown from "@/features/revenue/RevenuePlatformBreakdown";
import RevenueStats from "@/features/revenue/RevenueStats";
import RevenueTopLinksTable from "@/features/revenue/RevenueTopLinksTable";
import RevenueTrendTable from "@/features/revenue/RevenueTrendTable";
import { loadAffiliateAsync } from "@/hooks/loadAffiliateAsync";
import {
  formatDate,
  formatVnd,
  supportedPlatforms,
} from "@/lib/analytics/format";
import type {
  RevenueCampaign,
  RevenueOffer,
  RevenuePlatform,
  RevenueStat,
  SupportedPlatformLabel,
} from "@/types/affiliate";

type RevenueRow = {
  platform: SupportedPlatformLabel;
  campaignName: string;
  campaignId: string;
  offerTitle: string;
  offerId: string;
  trackingCode: string;
  date: string;
  gmv: number;
  cashback: number;
};

type RevenuePlatformAnalytics = RevenuePlatform & {
  share: number;
};

export default async function RevenuePage() {
  const { advertisers, campaigns, offers, trackingLinks, conversions } = await loadAffiliateAsync();

  const estimatedConversions = conversions.filter(
    (c) => c.status !== "rejected"
  );

  const rows: RevenueRow[] = estimatedConversions.flatMap((conversion) => {
    const link = trackingLinks.find((item) => item.id === conversion.trackingLinkId);
    if (!link) return [];
    const offer = offers.find((item) => item.id === link.offerId);
    if (!offer) return [];
    const campaign = campaigns.find((item) => item.id === offer.campaignId);
    if (!campaign) return [];
    const advertiser = advertisers.find((item) => item.id === campaign.advertiserId);
    if (!advertiser) return [];
    const platform = supportedPlatforms[advertiser.platform];
    if (!platform) return [];
    return [
      {
        platform,
        campaignName: campaign.name,
        campaignId: campaign.id,
        offerTitle: offer.title,
        offerId: offer.id,
        trackingCode: link.shortCode,
        date: conversion.occurredAt,
        gmv: conversion.orderAmount.amount,
        cashback: conversion.userCashback.amount,
      },
    ];
  });

  const totalGmv = rows.reduce((sum, row) => sum + row.gmv, 0);

  const platformTotals = new Map<
    SupportedPlatformLabel,
    { gmv: number; cashback: number; conversions: number }
  >();
  const campaignTotals = new Map<
    string,
    {
      campaignName: string;
      platform: SupportedPlatformLabel;
      gmv: number;
      cashback: number;
      conversionCount: number;
    }
  >();
  const offerTotals = new Map<
    string,
    {
      offerTitle: string;
      platform: SupportedPlatformLabel;
      gmv: number;
      cashback: number;
      conversionCount: number;
    }
  >();
  const trackingTotals = new Map<
    string,
    {
      trackingCode: string;
      platform: SupportedPlatformLabel;
      gmv: number;
      cashback: number;
      conversionCount: number;
    }
  >();
  const dateTotals = new Map<string, { gmv: number; conversionCount: number }>();

  for (const row of rows) {
    const p = platformTotals.get(row.platform) ?? { gmv: 0, cashback: 0, conversions: 0 };
    p.gmv += row.gmv;
    p.cashback += row.cashback;
    p.conversions += 1;
    platformTotals.set(row.platform, p);

    const campaignKey = `${row.campaignId}__${row.platform}`;
    const c =
      campaignTotals.get(campaignKey) ?? {
        campaignName: row.campaignName,
        platform: row.platform,
        gmv: 0,
        cashback: 0,
        conversionCount: 0,
      };
    c.gmv += row.gmv;
    c.cashback += row.cashback;
    c.conversionCount += 1;
    campaignTotals.set(campaignKey, c);

    const offerKey = `${row.offerId}__${row.platform}`;
    const o =
      offerTotals.get(offerKey) ?? {
        offerTitle: row.offerTitle,
        platform: row.platform,
        gmv: 0,
        cashback: 0,
        conversionCount: 0,
      };
    o.gmv += row.gmv;
    o.cashback += row.cashback;
    o.conversionCount += 1;
    offerTotals.set(offerKey, o);

    const t =
      trackingTotals.get(row.trackingCode) ?? {
        trackingCode: row.trackingCode,
        platform: row.platform,
        gmv: 0,
        cashback: 0,
        conversionCount: 0,
      };
    t.gmv += row.gmv;
    t.cashback += row.cashback;
    t.conversionCount += 1;
    trackingTotals.set(row.trackingCode, t);

    const dateKey = row.date.split("T")[0];
    const d = dateTotals.get(dateKey) ?? { gmv: 0, conversionCount: 0 };
    d.gmv += row.gmv;
    d.conversionCount += 1;
    dateTotals.set(dateKey, d);
  }

  const platforms: RevenuePlatformAnalytics[] = (["Shopee", "TikTok Shop"] as const)
    .filter((platform) => platformTotals.has(platform))
    .map((platform) => {
      const totals = platformTotals.get(platform)!;
      const share = totalGmv === 0 ? 0 : (totals.gmv / totalGmv) * 100;
      return {
        platform,
        gmv: { amount: totals.gmv, currency: "VND" },
        publisherCashback: { amount: totals.cashback, currency: "VND" },
        conversions: totals.conversions,
        share,
      };
    });

  const revenueCampaigns: RevenueCampaign[] = Array.from(campaignTotals.values())
    .sort(
      (a, b) => b.gmv - a.gmv || a.campaignName.localeCompare(b.campaignName)
    )
    .map((item) => ({
      campaignName: item.campaignName,
      platform: item.platform,
      gmv: { amount: item.gmv, currency: "VND" },
      publisherCashback: { amount: item.cashback, currency: "VND" },
      conversionCount: item.conversionCount,
    }));

  const revenueOffers: RevenueOffer[] = Array.from(offerTotals.values())
    .sort((a, b) => b.gmv - a.gmv || a.offerTitle.localeCompare(b.offerTitle))
    .map((item) => ({
      offerTitle: item.offerTitle,
      platform: item.platform,
      gmv: { amount: item.gmv, currency: "VND" },
      publisherCashback: { amount: item.cashback, currency: "VND" },
      conversionCount: item.conversionCount,
    }));

  const revenueTrend = Array.from(dateTotals.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, totals]) => ({
      date: formatDate(date),
      revenue: formatVnd(totals.gmv),
      conversionCount: totals.conversionCount,
    }));

  const revenueTopLinks = Array.from(trackingTotals.values())
    .sort(
      (a, b) => b.gmv - a.gmv || a.trackingCode.localeCompare(b.trackingCode)
    )
    .map((item) => ({
      trackingCode: item.trackingCode,
      platform: item.platform,
      revenue: formatVnd(item.gmv),
      cashback: formatVnd(item.cashback),
      conversionCount: item.conversionCount,
    }));

  const avgGmvPerConversion =
    rows.length === 0 ? 0 : totalGmv / rows.length;

  const topOffer = revenueOffers.length > 0 ? revenueOffers[0] : null;
  const topCampaign = revenueCampaigns.length > 0 ? revenueCampaigns[0] : null;
  const topLink = revenueTopLinks.length > 0 ? revenueTopLinks[0] : null;

  const stats: RevenueStat[] = [
    { label: "Tổng GMV", value: formatVnd(totalGmv) },
    { label: "GMV Shopee", value: formatVnd(platformTotals.get("Shopee")?.gmv ?? 0) },
    { label: "GMV TikTok", value: formatVnd(platformTotals.get("TikTok Shop")?.gmv ?? 0) },
    { label: "Offer GMV cao nhất", value: topOffer ? topOffer.offerTitle : "—" },
    { label: "Chiến dịch GMV cao nhất", value: topCampaign ? topCampaign.campaignName : "—" },
    { label: "Link GMV cao nhất", value: topLink ? topLink.trackingCode : "—" },
    { label: "GMV TB / chuyển đổi", value: formatVnd(avgGmvPerConversion) },
    { label: "Tổng chuyển đổi", value: String(rows.length) },
  ];

  const desktopContent = (
    <div className="space-y-6">
      <section className="surface-card overflow-hidden bg-[linear-gradient(180deg,rgba(255,252,249,0.92),rgba(248,238,231,0.96))] p-6">
        <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
          Phân tích GMV và cashback từ Shopee và TikTok Shop
        </p>
        <h1 className="text-[2rem] font-semibold tracking-[-0.04em] text-[color:var(--text)]">
          Revenue Analytics
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[color:var(--text-muted)]">
          Tổng hợp GMV và cashback dự kiến cho publisher từ các chuyển đổi CPS (đã loại trừ rejected).
        </p>
      </section>

      <RevenueStats stats={stats} />
      <RevenuePlatformBreakdown platforms={platforms} />
      <RevenueTrendTable trend={revenueTrend} />
      <RevenueTopLinksTable links={revenueTopLinks} />
      <RevenueCampaignTable campaigns={revenueCampaigns} />
      <RevenueOfferTable offers={revenueOffers} />
    </div>
  );

  return (
    <AppShell desktopContent={desktopContent}>
      <AppSection>
        <PageHeader
          eyebrow={
            <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
              Phân tích GMV và cashback từ Shopee và TikTok Shop
            </p>
          }
          title="Revenue Analytics"
          description="Tổng hợp GMV và cashback dự kiến cho publisher từ các chuyển đổi CPS (đã loại trừ rejected)."
        />
      </AppSection>
      <AppSection>
        <RevenueStats stats={stats} />
      </AppSection>
      <AppSection>
        <RevenuePlatformBreakdown platforms={platforms} />
      </AppSection>
      <AppSection>
        <RevenueTrendTable trend={revenueTrend} />
      </AppSection>
      <AppSection>
        <RevenueTopLinksTable links={revenueTopLinks} />
      </AppSection>
      <AppSection>
        <RevenueCampaignTable campaigns={revenueCampaigns} />
      </AppSection>
      <RevenueOfferTable offers={revenueOffers} />
    </AppShell>
  );
}
