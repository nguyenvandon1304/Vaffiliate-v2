import AppShell from "@/components/layout/AppShell";
import AppSection from "@/components/layout/AppSection";
import PageHeader from "@/components/layout/PageHeader";
import OfferCommissionCard from "@/features/offers/OfferCommissionCard";
import OfferHeader, { type OfferHeaderData } from "@/features/offers/OfferHeader";
import OfferJoinCampaignCard from "@/features/offers/OfferJoinCampaignCard";
import OfferNotFound from "@/features/offers/OfferNotFound";
import { loadAffiliateAsync, loadOfferDetailContextAsync } from "@/hooks/loadAffiliateAsync";
import type { OfferJoinStatus } from "@/types/affiliate";

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

export default async function OfferDetailPage({ params }: PageProps) {
  const { offerId } = await params;

  let ctx;
  try {
    ctx = await loadOfferDetailContextAsync(offerId);
  } catch {
    return (
      <AppShell desktopContent={<OfferNotFound offerId={offerId} />}>
        <AppSection className="pb-8">
          <OfferNotFound offerId={offerId} />
        </AppSection>
      </AppShell>
    );
  }

  const { offer, campaign, advertiser, joinStatus } = ctx;

  const offerHeaderData = {
    offer,
    campaign,
    advertiser,
    joinStatus: joinStatus as OfferJoinStatus,
  } satisfies OfferHeaderData;

  const desktopContent = (
    <div className="space-y-6">
      <OfferHeader offerDetail={offerHeaderData} headingLevel="h1" />
      <div className="grid gap-4 xl:grid-cols-2">
        <OfferCommissionCard offer={offerHeaderData.offer} />
        <OfferJoinCampaignCard
          joinStatus={offerHeaderData.joinStatus}
          campaignName={offerHeaderData.campaign.name}
          offerId={offerHeaderData.offer.id}
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
              {advertiser.platform} · {offerHeaderData.campaign.name}
            </p>
          }
          title={offer.title}
          description="Xem mức hoàn dự kiến, trạng thái chương trình và tạo link hoàn tiền để mua hàng."
        />
      </AppSection>
      <AppSection className="mb-4">
        <OfferHeader offerDetail={offerHeaderData} headingLevel="h2" />
      </AppSection>
      <AppSection className="pb-8">
        <div className="grid gap-4 xl:grid-cols-2">
          <OfferCommissionCard offer={offerHeaderData.offer} />
          <OfferJoinCampaignCard
            joinStatus={offerHeaderData.joinStatus}
            campaignName={offerHeaderData.campaign.name}
            offerId={offerHeaderData.offer.id}
          />
        </div>
      </AppSection>
    </AppShell>
  );
}
