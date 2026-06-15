import AppShell from "@/components/layout/AppShell";
import AppSection from "@/components/layout/AppSection";
import PageHeader from "@/components/layout/PageHeader";
import RevenueCampaignTable from "@/features/revenue/RevenueCampaignTable";
import RevenueOfferTable from "@/features/revenue/RevenueOfferTable";
import RevenuePlatformBreakdown from "@/features/revenue/RevenuePlatformBreakdown";
import RevenueStats from "@/features/revenue/RevenueStats";
import { useAffiliateAsync } from "@/hooks/useAffiliateAsync";
import type {
  RevenueCampaign,
  RevenueOffer,
  RevenuePlatform,
  RevenueStat,
  SupportedPlatformLabel,
} from "@/types/affiliate";
import type { PlatformLabel } from "@/types/common";

const supportedPlatforms: Partial<Record<PlatformLabel, SupportedPlatformLabel>> = {
  Shopee: "Shopee",
  "TikTok Shop": "TikTok Shop",
};

function formatVnd(amount: number): string {
  return `${Math.round(amount).toLocaleString("de-DE")}đ`;
}

function parseOrderValue(orderValue: string): number {
  return Number(orderValue.replace(/[^\d]/g, ""));
}

function parseRate(commissionRate: string): number {
  return Number(commissionRate.replace(/[^\d.]/g, ""));
}

type RevenueRow = {
  platform: SupportedPlatformLabel;
  campaignName: string;
  campaignId: string;
  offerTitle: string;
  offerId: string;
  revenue: number;
  commission: number;
};

export default async function RevenuePage() {
  const { advertisers, campaigns, offers, trackingLinks, conversions } = await useAffiliateAsync();

  const rows: RevenueRow[] = conversions.flatMap((conversion) => {
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
    const order = parseOrderValue(conversion.orderValue);
    if (!Number.isFinite(order)) return [];
    const rate = parseRate(offer.commissionRate);
    const commission =
      offer.commissionModel === "CPS" && Number.isFinite(rate) ? (order * rate) / 100 : 0;
    return [
      {
        platform,
        campaignName: campaign.name,
        campaignId: campaign.id,
        offerTitle: offer.title,
        offerId: offer.id,
        revenue: order,
        commission,
      },
    ];
  });

  const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const totalCommission = rows.reduce((sum, row) => sum + row.commission, 0);
  const activeCampaignIds = new Set(
    rows
      .map((row) => row.campaignId)
      .filter((id) => campaigns.some((c) => c.id === id && c.status === "active"))
  );

  const stats: RevenueStat[] = [
    { label: "Tổng doanh thu đơn hàng", value: formatVnd(totalRevenue) },
    { label: "Tổng hoa hồng dự kiến", value: formatVnd(totalCommission) },
    { label: "Tổng chuyển đổi", value: String(rows.length) },
    { label: "Chiến dịch hoạt động", value: String(activeCampaignIds.size) },
  ];

  const platformTotals = new Map<
    SupportedPlatformLabel,
    { revenue: number; commission: number; conversions: number }
  >();
  const campaignTotals = new Map<
    string,
    {
      campaignName: string;
      platform: SupportedPlatformLabel;
      revenue: number;
      commission: number;
      conversionCount: number;
    }
  >();
  const offerTotals = new Map<
    string,
    {
      offerTitle: string;
      platform: SupportedPlatformLabel;
      revenue: number;
      commission: number;
      conversionCount: number;
    }
  >();

  for (const row of rows) {
    const p = platformTotals.get(row.platform) ?? { revenue: 0, commission: 0, conversions: 0 };
    p.revenue += row.revenue;
    p.commission += row.commission;
    p.conversions += 1;
    platformTotals.set(row.platform, p);

    const campaignKey = `${row.campaignId}__${row.platform}`;
    const c =
      campaignTotals.get(campaignKey) ?? {
        campaignName: row.campaignName,
        platform: row.platform,
        revenue: 0,
        commission: 0,
        conversionCount: 0,
      };
    c.revenue += row.revenue;
    c.commission += row.commission;
    c.conversionCount += 1;
    campaignTotals.set(campaignKey, c);

    const offerKey = `${row.offerId}__${row.platform}`;
    const o =
      offerTotals.get(offerKey) ?? {
        offerTitle: row.offerTitle,
        platform: row.platform,
        revenue: 0,
        commission: 0,
        conversionCount: 0,
      };
    o.revenue += row.revenue;
    o.commission += row.commission;
    o.conversionCount += 1;
    offerTotals.set(offerKey, o);
  }

  const platforms: RevenuePlatform[] = (["Shopee", "TikTok Shop"] as const)
    .filter((platform) => platformTotals.has(platform))
    .map((platform) => {
      const totals = platformTotals.get(platform)!;
      return {
        platform,
        revenue: formatVnd(totals.revenue),
        commission: formatVnd(totals.commission),
        conversions: totals.conversions,
      };
    });

  const revenueCampaigns: RevenueCampaign[] = Array.from(campaignTotals.values())
    .sort((a, b) => b.revenue - a.revenue)
    .map((item) => ({
      campaignName: item.campaignName,
      platform: item.platform,
      revenue: formatVnd(item.revenue),
      commission: formatVnd(item.commission),
      conversionCount: item.conversionCount,
    }));

  const revenueOffers: RevenueOffer[] = Array.from(offerTotals.values())
    .sort((a, b) => b.revenue - a.revenue)
    .map((item) => ({
      offerTitle: item.offerTitle,
      platform: item.platform,
      revenue: formatVnd(item.revenue),
      commission: formatVnd(item.commission),
      conversionCount: item.conversionCount,
    }));

  const desktopContent = (
    <div className="space-y-6">
      <section className="surface-card overflow-hidden bg-[linear-gradient(180deg,rgba(255,252,249,0.92),rgba(248,238,231,0.96))] p-6">
        <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
          Phân tích doanh thu từ Shopee và TikTok Shop
        </p>
        <h1 className="text-[2rem] font-semibold tracking-[-0.04em] text-[color:var(--text)]">
          Revenue Analytics
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[color:var(--text-muted)]">
          Tổng hợp doanh thu đơn hàng và hoa hồng dự kiến theo nền tảng, chiến dịch và offer.
        </p>
      </section>

      <RevenueStats stats={stats} />
      <RevenuePlatformBreakdown platforms={platforms} />
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
              Phân tích doanh thu từ Shopee và TikTok Shop
            </p>
          }
          title="Revenue Analytics"
          description="Tổng hợp doanh thu đơn hàng và hoa hồng dự kiến theo nền tảng, chiến dịch và offer."
        />
      </AppSection>
      <AppSection>
        <RevenueStats stats={stats} />
      </AppSection>
      <AppSection>
        <RevenuePlatformBreakdown platforms={platforms} />
      </AppSection>
      <AppSection>
        <RevenueCampaignTable campaigns={revenueCampaigns} />
      </AppSection>
      <RevenueOfferTable offers={revenueOffers} />
    </AppShell>
  );
}
