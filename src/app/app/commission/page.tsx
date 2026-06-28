import AppShell from "@/components/layout/AppShell";
import AppSection from "@/components/layout/AppSection";
import PageHeader from "@/components/layout/PageHeader";
import CommissionCampaignTable from "@/features/commission/CommissionCampaignTable";
import CommissionPlatformBreakdown from "@/features/commission/CommissionPlatformBreakdown";
import CommissionStats from "@/features/commission/CommissionStats";
import CommissionTopLinksTable from "@/features/commission/CommissionTopLinksTable";
import CommissionTrendTable from "@/features/commission/CommissionTrendTable";
import { loadPublisherAffiliateAsync } from "@/hooks/loadPublisherAffiliateAsync";
import {
  formatDate,
  formatVnd,
  isApprovedStatus,
  supportedPlatforms,
} from "@/lib/analytics/format";
import type {
  CampaignCommission,
  CommissionStat,
  ConversionStatus,
  SupportedPlatformLabel,
} from "@/types/affiliate";

type CommissionRow = {
  platform: SupportedPlatformLabel;
  campaignName: string;
  offerTitle: string;
  trackingCode: string;
  date: string;
  status: ConversionStatus;
  cashback: number;
};

type CommissionPlatformAnalytics = {
  platform: SupportedPlatformLabel;
  totalCashback: string;
  approvedCashback: string;
  pendingCashback: string;
  share: number;
};

// "Rejected" is excluded from all cashback aggregations.
// "Pending" is included only in estimated metrics (label says "dự kiến").
export default async function CommissionPage() {
  const { advertisers, campaigns, offers, trackingLinks, conversions } = await loadPublisherAffiliateAsync();

  const estimatedConversions = conversions.filter((c) => c.status !== "rejected");

  const rows: CommissionRow[] = estimatedConversions.flatMap((conversion) => {
    const link = trackingLinks.find((item) => item.id === conversion.trackingLinkId);
    if (!link) return [];
    const offer = offers.find((item) => item.id === link.offerId);
    if (!offer) return [];
    if (offer.commissionModel !== "CPS") return [];
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
        offerTitle: offer.title,
        trackingCode: link.shortCode,
        date: conversion.occurredAt,
        status: conversion.status,
        cashback: conversion.userCashback.amount,
      },
    ];
  });

  const totalCashback = rows.reduce((sum, row) => sum + row.cashback, 0);
  const approvedTotal = rows
    .filter((row) => isApprovedStatus(row.status))
    .reduce((sum, row) => sum + row.cashback, 0);
  const pendingTotal = rows
    .filter((row) => row.status === "pending")
    .reduce((sum, row) => sum + row.cashback, 0);

  const platformTotals = new Map<
    SupportedPlatformLabel,
    { total: number; approved: number; pending: number }
  >();
  const campaignTotals = new Map<
    string,
    { campaignName: string; platform: SupportedPlatformLabel; conversions: number; cashback: number }
  >();
  const trackingTotals = new Map<
    string,
    { trackingCode: string; platform: SupportedPlatformLabel; conversions: number; cashback: number }
  >();
  const dateTotals = new Map<string, { shopee: number; tiktok: number }>();

  for (const row of rows) {
    const p =
      platformTotals.get(row.platform) ?? { total: 0, approved: 0, pending: 0 };
    p.total += row.cashback;
    if (isApprovedStatus(row.status)) p.approved += row.cashback;
    else if (row.status === "pending") p.pending += row.cashback;
    platformTotals.set(row.platform, p);

    const campaignKey = `${row.campaignName}__${row.platform}`;
    const c =
      campaignTotals.get(campaignKey) ?? {
        campaignName: row.campaignName,
        platform: row.platform,
        conversions: 0,
        cashback: 0,
      };
    c.conversions += 1;
    c.cashback += row.cashback;
    campaignTotals.set(campaignKey, c);

    const t =
      trackingTotals.get(row.trackingCode) ?? {
        trackingCode: row.trackingCode,
        platform: row.platform,
        conversions: 0,
        cashback: 0,
      };
    t.conversions += 1;
    t.cashback += row.cashback;
    trackingTotals.set(row.trackingCode, t);

    const dateKey = row.date.split("T")[0];
    const d = dateTotals.get(dateKey) ?? { shopee: 0, tiktok: 0 };
    if (row.platform === "Shopee") d.shopee += row.cashback;
    else d.tiktok += row.cashback;
    dateTotals.set(dateKey, d);
  }

  const shopeeTotal = platformTotals.get("Shopee")?.total ?? 0;
  const tiktokTotal = platformTotals.get("TikTok Shop")?.total ?? 0;
  const avgCashbackPerConversion = rows.length === 0 ? 0 : totalCashback / rows.length;

  const campaignCommissions: CampaignCommission[] = Array.from(campaignTotals.values())
    .sort(
      (a, b) => b.cashback - a.cashback || a.campaignName.localeCompare(b.campaignName)
    )
    .map((item) => ({
      campaignName: item.campaignName,
      platform: item.platform,
      conversions: item.conversions,
      totalCommission: { amount: item.cashback, currency: "VND" },
    }));

  const topCampaign = campaignCommissions.length > 0 ? campaignCommissions[0] : null;

  const stats: CommissionStat[] = [
    { label: "Tổng cashback dự kiến", value: formatVnd(totalCashback) },
    { label: "Cashback Shopee", value: formatVnd(shopeeTotal) },
    { label: "Cashback TikTok", value: formatVnd(tiktokTotal) },
    { label: "Cashback đã duyệt", value: formatVnd(approvedTotal) },
    { label: "Cashback chờ duyệt", value: formatVnd(pendingTotal) },
    { label: "Cashback TB / chuyển đổi", value: formatVnd(avgCashbackPerConversion) },
    {
      label: "Chiến dịch cashback cao nhất",
      value: topCampaign ? topCampaign.campaignName : "—",
    },
  ];

  const breakdown: CommissionPlatformAnalytics[] = (["Shopee", "TikTok Shop"] as const)
    .filter((platform) => platformTotals.has(platform))
    .map((platform) => {
      const totals = platformTotals.get(platform)!;
      const share = totalCashback === 0 ? 0 : (totals.total / totalCashback) * 100;
      return {
        platform,
        totalCashback: formatVnd(totals.total),
        approvedCashback: formatVnd(totals.approved),
        pendingCashback: formatVnd(totals.pending),
        share,
      };
    });

  const commissionTrend = Array.from(dateTotals.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, totals]) => ({
      date: formatDate(date),
      shopee: formatVnd(totals.shopee),
      tiktok: formatVnd(totals.tiktok),
      total: formatVnd(totals.shopee + totals.tiktok),
    }));

  const commissionTopLinks = Array.from(trackingTotals.values())
    .sort(
      (a, b) => b.cashback - a.cashback || a.trackingCode.localeCompare(b.trackingCode)
    )
    .map((item) => ({
      trackingCode: item.trackingCode,
      platform: item.platform,
      cashback: formatVnd(item.cashback),
      conversions: item.conversions,
    }));

  const desktopContent = (
    <div className="space-y-6">
      <section className="surface-card overflow-hidden bg-[linear-gradient(180deg,rgba(255,252,249,0.92),rgba(248,238,231,0.96))] p-6">
        <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
          Cashback dự kiến từ Shopee và TikTok Shop
        </p>
        <h1 className="text-[2rem] font-semibold tracking-[-0.04em] text-[color:var(--text)]">
          Cashback Dashboard
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[color:var(--text-muted)]">
          Tổng hợp cashback dự kiến cho publisher từ các chuyển đổi CPS (đã loại trừ rejected).
        </p>
      </section>

      <CommissionStats stats={stats} />
      <CommissionPlatformBreakdown breakdown={breakdown} />
      <CommissionTrendTable trend={commissionTrend} />
      <CommissionTopLinksTable links={commissionTopLinks} />
      <CommissionCampaignTable campaigns={campaignCommissions} />
    </div>
  );

  return (
    <AppShell desktopContent={desktopContent}>
      <AppSection>
        <PageHeader
          eyebrow={
            <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
              Cashback dự kiến từ Shopee và TikTok Shop
            </p>
          }
          title="Cashback Dashboard"
          description="Tổng hợp cashback dự kiến cho publisher từ các chuyển đổi CPS (đã loại trừ rejected)."
        />
      </AppSection>
      <AppSection>
        <CommissionStats stats={stats} />
      </AppSection>
      <AppSection>
        <CommissionPlatformBreakdown breakdown={breakdown} />
      </AppSection>
      <AppSection>
        <CommissionTrendTable trend={commissionTrend} />
      </AppSection>
      <AppSection>
        <CommissionTopLinksTable links={commissionTopLinks} />
      </AppSection>
      <CommissionCampaignTable campaigns={campaignCommissions} />
    </AppShell>
  );
}
