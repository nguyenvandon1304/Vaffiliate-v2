import AppShell from "@/components/layout/AppShell";
import AppSection from "@/components/layout/AppSection";
import PageHeader from "@/components/layout/PageHeader";
import ConversionFilters from "@/features/conversions/ConversionFilters";
import ConversionStats from "@/features/conversions/ConversionStats";
import ConversionTable from "@/features/conversions/ConversionTable";
import { useAffiliateAsync } from "@/hooks/useAffiliateAsync";
import type { ConversionStat, ConversionView, SupportedPlatformLabel } from "@/types/affiliate";
import type { PlatformLabel } from "@/types/common";

const supportedPlatforms: Partial<Record<PlatformLabel, SupportedPlatformLabel>> = {
  Shopee: "Shopee",
  "TikTok Shop": "TikTok Shop",
};

function formatVnd(amount: number): string {
  return `${Math.round(amount).toLocaleString("de-DE")}đ`;
}

function computeCommission(orderValue: string, commissionRate: string): string {
  const order = Number(orderValue.replace(/[^\d]/g, ""));
  const rate = Number(commissionRate.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(order) || !Number.isFinite(rate)) return "—";
  return formatVnd((order * rate) / 100);
}

export default async function ConversionsPage() {
  const { advertisers, campaigns, offers, trackingLinks, conversions } = await useAffiliateAsync();

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
        orderValue: conversion.orderValue,
        commissionValue: computeCommission(conversion.orderValue, offer.commissionRate),
        status: conversion.status,
        createdAt: conversion.occurredAt,
      },
    ];
  });

  const shopeeCount = conversionViews.filter((item) => item.platform === "Shopee").length;
  const tiktokCount = conversionViews.filter((item) => item.platform === "TikTok Shop").length;
  const approvedCount = conversionViews.filter((item) => item.status === "approved").length;

  const stats: ConversionStat[] = [
    { label: "Tổng chuyển đổi", value: String(conversionViews.length) },
    { label: "Chuyển đổi Shopee", value: String(shopeeCount) },
    { label: "Chuyển đổi TikTok", value: String(tiktokCount) },
    { label: "Đã duyệt", value: String(approvedCount) },
  ];

  const platformsInUse: SupportedPlatformLabel[] = (["Shopee", "TikTok Shop"] as const).filter(
    (platform) => conversionViews.some((item) => item.platform === platform)
  );

  const filters = ["Tất cả", ...platformsInUse];

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
    </AppShell>
  );
}
