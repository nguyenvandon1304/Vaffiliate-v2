import AppShell from "@/components/layout/AppShell";
import AppSection from "@/components/layout/AppSection";
import PageHeader from "@/components/layout/PageHeader";
import TrackingLinkFilters from "@/features/tracking-links/TrackingLinkFilters";
import TrackingLinkStats from "@/features/tracking-links/TrackingLinkStats";
import TrackingLinkTable from "@/features/tracking-links/TrackingLinkTable";
import { loadAffiliateAsync } from "@/hooks/loadAffiliateAsync";
import type { SupportedPlatformLabel, TrackingLinkStat, TrackingLinkView } from "@/types/affiliate";
import type { PlatformLabel } from "@/types/common";

const supportedPlatforms: Partial<Record<PlatformLabel, SupportedPlatformLabel>> = {
  Shopee: "Shopee",
  "TikTok Shop": "TikTok Shop",
};

type SearchParams = Promise<{ platform?: string }>;

export default async function TrackingLinksPage(props: { searchParams: SearchParams }) {
  const { searchParams } = props;
  const resolvedParams = await searchParams;
  const rawPlatform = resolvedParams.platform;

  const validPlatforms = ["shopee", "tiktok-shop"] as const;
  type PlatformValue = (typeof validPlatforms)[number];
  const activeFilter: PlatformValue | "all" =
    rawPlatform && validPlatforms.includes(rawPlatform as PlatformValue)
      ? (rawPlatform as PlatformValue)
      : "all";

  const { advertisers, campaigns, offers, trackingLinks } = await loadAffiliateAsync();

  const activeCampaignIds = new Set<string>();

  const linkViews: TrackingLinkView[] = trackingLinks.flatMap((link) => {
    const offer = offers.find((item) => item.id === link.offerId);
    if (!offer) return [];
    if (link.campaignId !== offer.campaignId) return [];
    const campaign = campaigns.find((item) => item.id === offer.campaignId);
    if (!campaign) return [];
    const advertiser = advertisers.find((item) => item.id === campaign.advertiserId);
    if (!advertiser) return [];
    const platform = supportedPlatforms[advertiser.platform];
    if (!platform) return [];
    if (campaign.status === "active") activeCampaignIds.add(campaign.id);
    const trackingUrl = link.trackingUrl ?? link.url;
    if (!trackingUrl) return [];
    return [
      {
        id: link.id,
        shortCode: link.shortCode,
        trackingUrl,
        destinationUrl: link.destinationUrl,
        offerTitle: offer.title,
        campaignId: campaign.id,
        campaignName: campaign.name,
        advertiserName: advertiser.name,
        platform,
        commissionRate: offer.commissionRate,
      },
    ];
  });

  const shopeeCount = linkViews.filter((link) => link.platform === "Shopee").length;
  const tiktokCount = linkViews.filter((link) => link.platform === "TikTok Shop").length;
  const activeCampaigns = activeCampaignIds.size;

  const stats: TrackingLinkStat[] = [
    { label: "Tổng link", value: String(linkViews.length) },
    { label: "Link Shopee", value: String(shopeeCount) },
    { label: "Link TikTok", value: String(tiktokCount) },
    { label: "Chiến dịch đang chạy", value: String(activeCampaigns) },
  ];

  const platformsInUse: SupportedPlatformLabel[] = (["Shopee", "TikTok Shop"] as const).filter(
    (platform) => linkViews.some((link) => link.platform === platform)
  );

  const filterOptions = [
    { value: "all", label: "Tất cả" },
    ...platformsInUse.map((p) => ({
      value: p === "Shopee" ? "shopee" : "tiktok-shop",
      label: p,
    })),
  ];

  const visibleLinks =
    activeFilter === "all"
      ? linkViews
      : linkViews.filter((link) => {
          if (activeFilter === "shopee") return link.platform === "Shopee";
          return link.platform === "TikTok Shop";
        });

  const desktopContent = (
    <div className="space-y-6">
      <section className="surface-card overflow-hidden bg-[linear-gradient(180deg,rgba(255,252,249,0.92),rgba(248,238,231,0.96))] p-6">
        <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
          Quản lý link hoàn tiền Shopee và TikTok Shop
        </p>
        <h1 className="text-[2rem] font-semibold tracking-[-0.04em] text-[color:var(--text)]">
          Link hoàn tiền đã tạo
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[color:var(--text-muted)]">
          Theo dõi các link hoàn tiền đã tạo từ chương trình Shopee và TikTok Shop, kèm thông tin chiến dịch và mức hoàn dự kiến.
        </p>
      </section>

      <TrackingLinkStats stats={stats} />
      <TrackingLinkFilters filters={filterOptions} activeFilter={activeFilter} />
      <TrackingLinkTable links={visibleLinks} />
    </div>
  );

  return (
    <AppShell desktopContent={desktopContent}>
      <AppSection>
        <PageHeader
          eyebrow={
            <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
              Quản lý link hoàn tiền Shopee và TikTok Shop
            </p>
          }
          title="Link hoàn tiền đã tạo"
          description="Theo dõi các link hoàn tiền đã tạo từ chương trình Shopee và TikTok Shop, kèm thông tin chiến dịch và mức hoàn dự kiến."
        />
      </AppSection>
      <AppSection>
        <TrackingLinkStats stats={stats} />
      </AppSection>
      <AppSection>
        <TrackingLinkFilters filters={filterOptions} activeFilter={activeFilter} />
      </AppSection>
      <TrackingLinkTable links={visibleLinks} />
    </AppShell>
  );
}
