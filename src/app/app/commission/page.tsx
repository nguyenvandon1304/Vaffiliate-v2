import AppShell from "@/components/layout/AppShell";
import AppSection from "@/components/layout/AppSection";
import PageHeader from "@/components/layout/PageHeader";
import CommissionCampaignTable from "@/features/commission/CommissionCampaignTable";
import CommissionPlatformBreakdown from "@/features/commission/CommissionPlatformBreakdown";
import CommissionStats from "@/features/commission/CommissionStats";
import CommissionTopLinksTable from "@/features/commission/CommissionTopLinksTable";
import CommissionTrendTable from "@/features/commission/CommissionTrendTable";
import { loadAffiliateAsync } from "@/hooks/loadAffiliateAsync";
import {
  formatDate,
  formatVnd,
  isApprovedStatus,
  parseOrderValue,
  parseRate,
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
  commission: number;
};

type CommissionPlatformAnalytics = {
  platform: SupportedPlatformLabel;
  totalCommission: string;
  approvedCommission: string;
  pendingCommission: string;
  rejectedCommission: string;
  share: number;
};

export default async function CommissionPage() {
  const { advertisers, campaigns, offers, trackingLinks, conversions } = await loadAffiliateAsync();

  const rows: CommissionRow[] = conversions.flatMap((conversion) => {
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
    const order = parseOrderValue(conversion.orderValue);
    const rate = parseRate(offer.commissionRate);
    if (!Number.isFinite(order) || !Number.isFinite(rate)) return [];
    return [
      {
        platform,
        campaignName: campaign.name,
        offerTitle: offer.title,
        trackingCode: link.shortCode,
        date: conversion.occurredAt,
        status: conversion.status,
        commission: (order * rate) / 100,
      },
    ];
  });

  const totalCommission = rows.reduce((sum, row) => sum + row.commission, 0);
  const approvedTotal = rows
    .filter((row) => isApprovedStatus(row.status))
    .reduce((sum, row) => sum + row.commission, 0);
  const pendingTotal = rows
    .filter((row) => row.status === "pending")
    .reduce((sum, row) => sum + row.commission, 0);
  const rejectedTotal = rows
    .filter((row) => row.status === "rejected")
    .reduce((sum, row) => sum + row.commission, 0);

  const platformTotals = new Map<
    SupportedPlatformLabel,
    { total: number; approved: number; pending: number; rejected: number }
  >();
  const campaignTotals = new Map<
    string,
    { campaignName: string; platform: SupportedPlatformLabel; conversions: number; commission: number }
  >();
  const trackingTotals = new Map<
    string,
    { trackingCode: string; platform: SupportedPlatformLabel; conversions: number; commission: number }
  >();
  const dateTotals = new Map<string, { shopee: number; tiktok: number }>();

  for (const row of rows) {
    const p =
      platformTotals.get(row.platform) ?? { total: 0, approved: 0, pending: 0, rejected: 0 };
    p.total += row.commission;
    if (isApprovedStatus(row.status)) p.approved += row.commission;
    else if (row.status === "pending") p.pending += row.commission;
    else if (row.status === "rejected") p.rejected += row.commission;
    platformTotals.set(row.platform, p);

    const campaignKey = `${row.campaignName}__${row.platform}`;
    const c =
      campaignTotals.get(campaignKey) ?? {
        campaignName: row.campaignName,
        platform: row.platform,
        conversions: 0,
        commission: 0,
      };
    c.conversions += 1;
    c.commission += row.commission;
    campaignTotals.set(campaignKey, c);

    const t =
      trackingTotals.get(row.trackingCode) ?? {
        trackingCode: row.trackingCode,
        platform: row.platform,
        conversions: 0,
        commission: 0,
      };
    t.conversions += 1;
    t.commission += row.commission;
    trackingTotals.set(row.trackingCode, t);

    const dateKey = row.date.split("T")[0];
    const d = dateTotals.get(dateKey) ?? { shopee: 0, tiktok: 0 };
    if (row.platform === "Shopee") d.shopee += row.commission;
    else d.tiktok += row.commission;
    dateTotals.set(dateKey, d);
  }

  const shopeeTotal = platformTotals.get("Shopee")?.total ?? 0;
  const tiktokTotal = platformTotals.get("TikTok Shop")?.total ?? 0;
  const avgCommissionPerConversion = rows.length === 0 ? 0 : totalCommission / rows.length;

  const campaignCommissions: CampaignCommission[] = Array.from(campaignTotals.values())
    .sort(
      (a, b) => b.commission - a.commission || a.campaignName.localeCompare(b.campaignName)
    )
    .map((item) => ({
      campaignName: item.campaignName,
      platform: item.platform,
      conversions: item.conversions,
      totalCommission: formatVnd(item.commission),
    }));

  const topCampaign = campaignCommissions.length > 0 ? campaignCommissions[0] : null;

  const stats: CommissionStat[] = [
    { label: "Tổng hoa hồng", value: formatVnd(totalCommission) },
    { label: "Hoa hồng Shopee", value: formatVnd(shopeeTotal) },
    { label: "Hoa hồng TikTok", value: formatVnd(tiktokTotal) },
    { label: "Hoa hồng đã duyệt", value: formatVnd(approvedTotal) },
    { label: "Hoa hồng chờ duyệt", value: formatVnd(pendingTotal) },
    { label: "Hoa hồng từ chối", value: formatVnd(rejectedTotal) },
    { label: "Hoa hồng TB / chuyển đổi", value: formatVnd(avgCommissionPerConversion) },
    {
      label: "Chiến dịch hoa hồng cao nhất",
      value: topCampaign ? topCampaign.campaignName : "—",
    },
  ];

  const breakdown: CommissionPlatformAnalytics[] = (["Shopee", "TikTok Shop"] as const)
    .filter((platform) => platformTotals.has(platform))
    .map((platform) => {
      const totals = platformTotals.get(platform)!;
      const share = totalCommission === 0 ? 0 : (totals.total / totalCommission) * 100;
      return {
        platform,
        totalCommission: formatVnd(totals.total),
        approvedCommission: formatVnd(totals.approved),
        pendingCommission: formatVnd(totals.pending),
        rejectedCommission: formatVnd(totals.rejected),
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
      (a, b) => b.commission - a.commission || a.trackingCode.localeCompare(b.trackingCode)
    )
    .map((item) => ({
      trackingCode: item.trackingCode,
      platform: item.platform,
      commission: formatVnd(item.commission),
      conversions: item.conversions,
    }));

  const desktopContent = (
    <div className="space-y-6">
      <section className="surface-card overflow-hidden bg-[linear-gradient(180deg,rgba(255,252,249,0.92),rgba(248,238,231,0.96))] p-6">
        <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
          Phân tích hoa hồng từ Shopee và TikTok Shop
        </p>
        <h1 className="text-[2rem] font-semibold tracking-[-0.04em] text-[color:var(--text)]">
          Commission Dashboard
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[color:var(--text-muted)]">
          Tổng hợp hoa hồng dự kiến từ các chuyển đổi CPS của offer Shopee và TikTok Shop.
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
              Phân tích hoa hồng từ Shopee và TikTok Shop
            </p>
          }
          title="Commission Dashboard"
          description="Tổng hợp hoa hồng dự kiến từ các chuyển đổi CPS của offer Shopee và TikTok Shop."
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
