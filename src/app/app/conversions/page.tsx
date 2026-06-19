import AppShell from "@/components/layout/AppShell";
import AppSection from "@/components/layout/AppSection";
import PageHeader from "@/components/layout/PageHeader";
import ConversionFilters from "@/features/conversions/ConversionFilters";
import ConversionPlatformBreakdown from "@/features/conversions/ConversionPlatformBreakdown";
import ConversionStats from "@/features/conversions/ConversionStats";
import ConversionTable from "@/features/conversions/ConversionTable";
import ConversionTopLinksTable from "@/features/conversions/ConversionTopLinksTable";
import ConversionTrendTable from "@/features/conversions/ConversionTrendTable";
import { loadAffiliateAsync } from "@/hooks/loadAffiliateAsync";
import { loadClickAsync } from "@/hooks/loadClickAsync";
import {
  formatDate,
  isApprovedStatus,
  supportedPlatforms,
} from "@/lib/analytics/format";
import type { ConversionStat, ConversionView, SupportedPlatformLabel } from "@/types/affiliate";

export default async function ConversionsPage() {
  const { advertisers, campaigns, offers, trackingLinks, conversions } = await loadAffiliateAsync();
  const { clicks } = await loadClickAsync();

  const conversionViews: ConversionView[] = conversions.flatMap((conversion) => {
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
        id: conversion.id,
        platform,
        advertiserName: advertiser.name,
        campaignName: campaign.name,
        offerTitle: offer.title,
        trackingCode: link.shortCode,
        commissionRate: offer.commissionRate,
        orderAmount: conversion.orderAmount,
        networkCommission: conversion.networkCommission,
        userCashback: conversion.userCashback,
        status: conversion.status,
        occurredAt: conversion.occurredAt,
      },
    ];
  });

  const totalConversions = conversionViews.length;
  const totalClicks = clicks.length;

  const shopeeCount = conversionViews.filter((item) => item.platform === "Shopee").length;
  const tiktokCount = conversionViews.filter((item) => item.platform === "TikTok Shop").length;
  const approvedCount = conversionViews.filter((item) => isApprovedStatus(item.status)).length;
  const pendingCount = conversionViews.filter((item) => item.status === "pending").length;
  const rejectedCount = conversionViews.filter((item) => item.status === "rejected").length;

  const conversionRate =
    totalClicks === 0
      ? "0%"
      : `${((totalConversions / totalClicks) * 100).toFixed(1)}%`;

  const stats: ConversionStat[] = [
    { label: "Tổng chuyển đổi", value: String(totalConversions) },
    { label: "Chuyển đổi Shopee", value: String(shopeeCount) },
    { label: "Chuyển đổi TikTok", value: String(tiktokCount) },
    { label: "Đã duyệt", value: String(approvedCount) },
    { label: "Chờ đối soát", value: String(pendingCount) },
    { label: "Từ chối", value: String(rejectedCount) },
    { label: "Tỷ lệ chuyển đổi", value: conversionRate },
  ];

  const platformsInUse: SupportedPlatformLabel[] = (["Shopee", "TikTok Shop"] as const).filter(
    (platform) => conversionViews.some((item) => item.platform === platform)
  );

  const filters = ["Tất cả", ...platformsInUse];

  const platformBreakdown = (["Shopee", "TikTok Shop"] as const)
    .filter((platform) => conversionViews.some((item) => item.platform === platform))
    .map((platform) => {
      const items = conversionViews.filter((item) => item.platform === platform);
      const clickCount = clicks.filter((click) => click.platform === platform).length;
      const platformRate =
        clickCount === 0 ? "0%" : `${((items.length / clickCount) * 100).toFixed(1)}%`;
      return {
        platform,
        conversions: items.length,
        approved: items.filter((item) => isApprovedStatus(item.status)).length,
        clicks: clickCount,
        conversionRate: platformRate,
      };
    });

  const trendMap = new Map<string, { shopee: number; tiktok: number }>();
  for (const item of conversionViews) {
    const dateKey = item.occurredAt.split("T")[0];
    const entry = trendMap.get(dateKey) ?? { shopee: 0, tiktok: 0 };
    if (item.platform === "Shopee") entry.shopee += 1;
    else entry.tiktok += 1;
    trendMap.set(dateKey, entry);
  }
  const dailyTrend = Array.from(trendMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({
      date: formatDate(date),
      shopee: counts.shopee,
      tiktok: counts.tiktok,
      total: counts.shopee + counts.tiktok,
    }));

  const topLinksMap = new Map<
    string,
    { trackingCode: string; platform: SupportedPlatformLabel; conversions: number }
  >();
  for (const item of conversionViews) {
    const entry =
      topLinksMap.get(item.trackingCode) ?? {
        trackingCode: item.trackingCode,
        platform: item.platform,
        conversions: 0,
      };
    entry.conversions += 1;
    topLinksMap.set(item.trackingCode, entry);
  }
  const topLinks = Array.from(topLinksMap.values()).sort(
    (a, b) =>
      b.conversions - a.conversions || a.trackingCode.localeCompare(b.trackingCode)
  );

  const desktopContent = (
    <div className="space-y-6">
      <section className="surface-card overflow-hidden bg-[linear-gradient(180deg,rgba(255,252,249,0.92),rgba(248,238,231,0.96))] p-6">
        <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
          Theo dõi chuyển đổi từ Shopee và TikTok Shop
        </p>
        <h1 className="text-[2rem] font-semibold tracking-[-0.04em] text-[color:var(--text)]">
          Conversion Tracking
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[color:var(--text-muted)]">
          Xem các chuyển đổi affiliate từ offer Shopee và TikTok Shop, kèm trạng thái đối soát và hoa hồng dự kiến.
        </p>
      </section>

      <ConversionStats stats={stats} />
      <ConversionFilters filters={filters} />
      <ConversionTable conversions={conversionViews} />

      <ConversionPlatformBreakdown platforms={platformBreakdown} />
      <ConversionTrendTable trend={dailyTrend} />
      <ConversionTopLinksTable links={topLinks} />
    </div>
  );

  return (
    <AppShell desktopContent={desktopContent}>
      <AppSection>
        <PageHeader
          eyebrow={
            <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
              Theo dõi chuyển đổi từ Shopee và TikTok Shop
            </p>
          }
          title="Conversion Tracking"
          description="Xem các chuyển đổi affiliate từ offer Shopee và TikTok Shop, kèm trạng thái đối soát và hoa hồng dự kiến."
        />
      </AppSection>
      <AppSection>
        <ConversionStats stats={stats} />
      </AppSection>
      <AppSection>
        <ConversionFilters filters={filters} />
      </AppSection>
      <ConversionTable conversions={conversionViews} />
      <AppSection>
        <ConversionPlatformBreakdown platforms={platformBreakdown} />
      </AppSection>
      <AppSection>
        <ConversionTrendTable trend={dailyTrend} />
      </AppSection>
      <AppSection>
        <ConversionTopLinksTable links={topLinks} />
      </AppSection>
    </AppShell>
  );
}
