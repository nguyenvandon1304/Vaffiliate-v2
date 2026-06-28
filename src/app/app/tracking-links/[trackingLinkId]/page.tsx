import AppShell from "@/components/layout/AppShell";
import AppSection from "@/components/layout/AppSection";
import PageHeader from "@/components/layout/PageHeader";
import TrackingLinkAttributionCard from "@/features/tracking-links/detail/TrackingLinkAttributionCard";
import TrackingLinkHeader from "@/features/tracking-links/detail/TrackingLinkHeader";
import TrackingLinkNotFound from "@/features/tracking-links/detail/TrackingLinkNotFound";
import TrackingLinkPerformanceCard from "@/features/tracking-links/detail/TrackingLinkPerformanceCard";
import TrackingLinkStatsCard from "@/features/tracking-links/detail/TrackingLinkStatsCard";
import { loadPublisherAffiliateAsync } from "@/hooks/loadPublisherAffiliateAsync";
import type {
  Conversion,
  TrackingLinkStats,
} from "@/types/affiliate";

export const dynamic = "force-dynamic";

type RouteParams = {
  trackingLinkId: string;
};

type PageProps = {
  params: Promise<RouteParams>;
};

function buildPublisherTrackingLinkStats(
  baseStats: TrackingLinkStats | undefined,
  conversions: Conversion[],
): TrackingLinkStats {
  const clicks = baseStats?.clicks ?? 0;
  const uniqueClicks = baseStats?.uniqueClicks ?? 0;

  const validConversions = conversions.filter(
    (conversion) => conversion.status !== "rejected",
  );

  const conversionCount = validConversions.length;

  const cashbackAmount = validConversions.reduce(
    (total, conversion) =>
      total + conversion.userCashback.amount,
    0,
  );

  const orderAmount = validConversions.reduce(
    (total, conversion) =>
      total + conversion.orderAmount.amount,
    0,
  );

  return {
    clicks,
    uniqueClicks,
    conversionCount,
    commission: {
      amount: cashbackAmount,
      currency: "VND",
    },
    metrics: {
      epc: clicks === 0 ? 0 : cashbackAmount / clicks,
      aov:
        conversionCount === 0
          ? 0
          : orderAmount / conversionCount,
      conversionRate:
        clicks === 0 ? 0 : conversionCount / clicks,
    },
  };
}

export default async function TrackingLinkDetailPage({
  params,
}: PageProps) {
  const { trackingLinkId } = await params;

  const {
    trackingLinks,
    offers,
    campaigns,
    advertisers,
    conversions,
    trackingLinkStats,
  } = await loadPublisherAffiliateAsync();

  const trackingLink = trackingLinks.find(
    (link) => link.id === trackingLinkId,
  );

  if (!trackingLink) {
    return (
      <AppShell
        desktopContent={
          <TrackingLinkNotFound
            trackingLinkId={trackingLinkId}
          />
        }
      >
        <AppSection className="pb-8">
          <TrackingLinkNotFound
            trackingLinkId={trackingLinkId}
          />
        </AppSection>
      </AppShell>
    );
  }

  const offer = offers.find(
    (item) => item.id === trackingLink.offerId,
  );

  if (!offer) {
    return (
      <AppShell
        desktopContent={
          <TrackingLinkNotFound
            trackingLinkId={trackingLinkId}
          />
        }
      >
        <AppSection className="pb-8">
          <TrackingLinkNotFound
            trackingLinkId={trackingLinkId}
          />
        </AppSection>
      </AppShell>
    );
  }

  const campaign = campaigns.find(
    (item) => item.id === offer.campaignId,
  );

  const advertiser = campaign
    ? advertisers.find(
        (item) => item.id === campaign.advertiserId,
      )
    : undefined;

  if (!campaign || !advertiser) {
    return (
      <AppShell
        desktopContent={
          <TrackingLinkNotFound
            trackingLinkId={trackingLinkId}
          />
        }
      >
        <AppSection className="pb-8">
          <TrackingLinkNotFound
            trackingLinkId={trackingLinkId}
          />
        </AppSection>
      </AppShell>
    );
  }

  const linkConversions = conversions
    .filter(
      (conversion) =>
        conversion.trackingLinkId === trackingLinkId,
    )
    .sort((a, b) =>
      a.occurredAt < b.occurredAt ? 1 : -1,
    );

  const stats = buildPublisherTrackingLinkStats(
    trackingLinkStats[trackingLinkId],
    linkConversions,
  );

  const desktopContent = (
    <div className="space-y-6">
      <TrackingLinkHeader
        trackingLink={trackingLink}
        offer={offer}
        campaign={campaign}
        advertiserName={advertiser.name}
        headingLevel="h1"
      />

      <TrackingLinkStatsCard stats={stats} />

      <div className="grid gap-4 xl:grid-cols-2">
        <TrackingLinkPerformanceCard
          conversions={linkConversions}
        />

        <TrackingLinkAttributionCard
          trackingLink={trackingLink}
          offer={offer}
          campaign={campaign}
          advertiser={advertiser}
          stats={stats}
        />
      </div>
    </div>
  );

  return (
    <AppShell desktopContent={desktopContent}>
      <AppSection>
        <PageHeader
          eyebrow={
            <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
              {advertiser.platform} · {offer.title}
            </p>
          }
          title="Chi tiết link hoàn tiền"
          description="Xem hiệu suất, đơn hàng được ghi nhận và thông tin của link hoàn tiền."
        />
      </AppSection>

      <AppSection className="mb-4">
        <TrackingLinkHeader
          trackingLink={trackingLink}
          offer={offer}
          campaign={campaign}
          advertiserName={advertiser.name}
          headingLevel="h2"
        />
      </AppSection>

      <AppSection className="mb-4">
        <TrackingLinkStatsCard stats={stats} />
      </AppSection>

      <AppSection className="pb-8">
        <div className="grid gap-4 xl:grid-cols-2">
          <TrackingLinkPerformanceCard
            conversions={linkConversions}
          />

          <TrackingLinkAttributionCard
            trackingLink={trackingLink}
            offer={offer}
            campaign={campaign}
            advertiser={advertiser}
            stats={stats}
          />
        </div>
      </AppSection>
    </AppShell>
  );
}
