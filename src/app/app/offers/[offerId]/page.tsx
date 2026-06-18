import AppShell from "@/components/layout/AppShell";
import AppSection from "@/components/layout/AppSection";
import PageHeader from "@/components/layout/PageHeader";
import OfferCommissionCard from "@/features/offers/OfferCommissionCard";
import OfferHeader from "@/features/offers/OfferHeader";
import OfferJoinCampaignCard from "@/features/offers/OfferJoinCampaignCard";
import OfferNotFound from "@/features/offers/OfferNotFound";
import OfferRequirementCard from "@/features/offers/OfferRequirementCard";
import OfferTrackingCard from "@/features/offers/OfferTrackingCard";
import { loadAffiliateAsync } from "@/hooks/loadAffiliateAsync";
import { offerRequirements, offerTrackingRules } from "@/lib/mock/affiliate";
import type { OfferDetail, OfferJoinStatus } from "@/types/affiliate";

type RouteParams = {
  offerId: string;
};

type PageProps = {
  params: Promise<RouteParams>;
};

export async function generateStaticParams(): Promise<RouteParams[]> {
  const { offers } = await loadAffiliateAsync();
  return offers.map((offer) => ({ offerId: offer.id }));
}

function resolveJoinStatus(joinedOfferIds: string[], offerId: string, campaignStatus: string): OfferJoinStatus {
  if (joinedOfferIds.includes(offerId)) {
    return campaignStatus === "paused" ? "paused" : "joined";
  }
  return "not_joined";
}

export default async function OfferDetailPage({ params }: PageProps) {
  const { offerId } = await params;
  const { offers, campaigns, advertisers, joinedOfferIds } = await loadAffiliateAsync();

  const offer = offers.find((item) => item.id === offerId);
  if (!offer) {
    return (
      <AppShell desktopContent={<OfferNotFound offerId={offerId} />}>
        <AppSection className="pb-8">
          <OfferNotFound offerId={offerId} />
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
      <AppShell desktopContent={<OfferNotFound offerId={offerId} />}>
        <AppSection className="pb-8">
          <OfferNotFound offerId={offerId} />
        </AppSection>
      </AppShell>
    );
  }

  const offerDetail: OfferDetail = {
    offer,
    campaign,
    advertiser,
    joinStatus: resolveJoinStatus(joinedOfferIds, offer.id, campaign.status),
    requirements: offerRequirements[offer.id] ?? [],
    trackingRules: offerTrackingRules[offer.id] ?? {
      cookieDurationDays: 0,
      allowedChannels: [],
      trafficRules: [],
    },
  };

  const desktopContent = (
    <div className="space-y-6">
      <OfferHeader offerDetail={offerDetail} />
      <div className="grid gap-4 xl:grid-cols-2">
        <OfferCommissionCard offer={offerDetail.offer} />
        <OfferJoinCampaignCard
          joinStatus={offerDetail.joinStatus}
          campaignName={offerDetail.campaign.name}
          offerId={offerDetail.offer.id}
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <OfferTrackingCard trackingRules={offerDetail.trackingRules} />
        <OfferRequirementCard requirements={offerDetail.requirements} />
      </div>
    </div>
  );

  return (
    <AppShell desktopContent={desktopContent}>
      <AppSection>
        <PageHeader
          eyebrow={
            <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
              {advertiser.platform} · {offerDetail.campaign.name}
            </p>
          }
          title={offer.title}
          description="Chi tiết offer, cơ chế hoa hồng, yêu cầu chương trình và cấu hình tracking."
        />
      </AppSection>
      <AppSection className="mb-4">
        <OfferHeader offerDetail={offerDetail} />
      </AppSection>
      <AppSection className="mb-4">
        <div className="grid gap-4 xl:grid-cols-2">
          <OfferCommissionCard offer={offerDetail.offer} />
          <OfferJoinCampaignCard
            joinStatus={offerDetail.joinStatus}
            campaignName={offerDetail.campaign.name}
            offerId={offerDetail.offer.id}
          />
        </div>
      </AppSection>
      <AppSection className="pb-8">
        <div className="grid gap-4 xl:grid-cols-2">
          <OfferTrackingCard trackingRules={offerDetail.trackingRules} />
          <OfferRequirementCard requirements={offerDetail.requirements} />
        </div>
      </AppSection>
    </AppShell>
  );
}
