import AppShell from "@/components/layout/AppShell";
import AppSection from "@/components/layout/AppSection";
import PageHeader from "@/components/layout/PageHeader";
import TrackingLinkAttributionCard from "@/features/tracking-links/detail/TrackingLinkAttributionCard";
import TrackingLinkHeader from "@/features/tracking-links/detail/TrackingLinkHeader";
import TrackingLinkNotFound from "@/features/tracking-links/detail/TrackingLinkNotFound";
import TrackingLinkPerformanceCard from "@/features/tracking-links/detail/TrackingLinkPerformanceCard";
import TrackingLinkStatsCard from "@/features/tracking-links/detail/TrackingLinkStatsCard";
import { loadAffiliateAsync } from "@/hooks/loadAffiliateAsync";

type RouteParams = {
  trackingLinkId: string;
};

type PageProps = {
  params: Promise<RouteParams>;
};

export async function generateStaticParams(): Promise<RouteParams[]> {
  const { trackingLinks } = await loadAffiliateAsync();
  return trackingLinks.map((link) => ({ trackingLinkId: link.id }));
}

export default async function TrackingLinkDetailPage({ params }: PageProps) {
  const { trackingLinkId } = await params;
  const { trackingLinks, offers, campaigns, advertisers, conversions, trackingLinkStats } =
    await loadAffiliateAsync();

  const trackingLink = trackingLinks.find((link) => link.id === trackingLinkId);
  if (!trackingLink) {
    return (
      <AppShell desktopContent={<TrackingLinkNotFound trackingLinkId={trackingLinkId} />}>
        <AppSection className="pb-8">
          <TrackingLinkNotFound trackingLinkId={trackingLinkId} />
        </AppSection>
      </AppShell>
    );
  }

  const offer = offers.find((item) => item.id === trackingLink.offerId);
  if (!offer) {
    return (
      <AppShell desktopContent={<TrackingLinkNotFound trackingLinkId={trackingLinkId} />}>
        <AppSection className="pb-8">
          <TrackingLinkNotFound trackingLinkId={trackingLinkId} />
        </AppSection>
      </AppShell>
    );
  }

  const campaign = campaigns.find((item) => item.id === offer.campaignId);
  const advertiser = campaign
    ? advertisers.find((item) => item.id === campaign.advertiserId)
    : undefined;

  if (!campaign || !advertiser) {
    return (
      <AppShell desktopContent={<TrackingLinkNotFound trackingLinkId={trackingLinkId} />}>
        <AppSection className="pb-8">
          <TrackingLinkNotFound trackingLinkId={trackingLinkId} />
        </AppSection>
      </AppShell>
    );
  }

  const linkConversions = conversions
    .filter((conv) => conv.trackingLinkId === trackingLinkId)
    .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));

  const stats = trackingLinkStats[trackingLinkId] ?? {
    clicks: 0,
    uniqueClicks: 0,
    conversionCount: 0,
    commission: { amount: 0, currency: "VND" },
    metrics: { epc: 0, aov: 0, conversionRate: 0 },
  };

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
        <TrackingLinkPerformanceCard conversions={linkConversions} />
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
          <TrackingLinkPerformanceCard conversions={linkConversions} />
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
