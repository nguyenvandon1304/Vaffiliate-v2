import AppShell from "@/components/layout/AppShell";
import AppSection from "@/components/layout/AppSection";
import PageHeader from "@/components/layout/PageHeader";
import CampaignSummaryCard from "@/features/tracking-links/generator/CampaignSummaryCard";
import DestinationUrlCard from "@/features/tracking-links/generator/DestinationUrlCard";
import GeneratedLinkPreviewCard from "@/features/tracking-links/generator/GeneratedLinkPreviewCard";
import OfferSummaryCard from "@/features/tracking-links/generator/OfferSummaryCard";
import TrackingLinkGeneratorNotFound from "@/features/tracking-links/generator/TrackingLinkGeneratorNotFound";
import TrackingParametersCard from "@/features/tracking-links/generator/TrackingParametersCard";
import { loadAffiliateAsync } from "@/hooks/loadAffiliateAsync";
import { offerDestinationUrls, offerTrackingParameters } from "@/lib/mock/affiliate";
import type { OfferId, TrackingLink, TrackingLinkId } from "@/types/affiliate";

type RouteParams = {
  offerId: string;
};

type PageProps = {
  params: Promise<RouteParams>;
};

const categoryLabels: Record<string, string> = {
  "Thời trang": "Thời trang",
  "Làm đẹp": "Làm đẹp",
  "Gia dụng": "Gia dụng",
};

function buildSyntheticShortCode(offerId: OfferId): string {
  return `tl-${offerId.replace(/^off-/, "")}`;
}

function buildSyntheticUrl(offerId: OfferId): string {
  return `https://vaffiliate.vn/go/${offerId}?ref=demo-user&click_id=${offerId}-preview`;
}

function pickExistingLink(
  trackingLinks: TrackingLink[],
  offerId: OfferId,
): TrackingLink | null {
  return trackingLinks.find((link) => link.offerId === offerId) ?? null;
}

export async function generateStaticParams(): Promise<RouteParams[]> {
  const { offers } = await loadAffiliateAsync();
  return offers.map((offer) => ({ offerId: offer.id }));
}

export default async function TrackingLinkGeneratorPage({ params }: PageProps) {
  const { offerId } = await params;
  const { offers, campaigns, advertisers, trackingLinks } = await loadAffiliateAsync();

  const offer = offers.find((item) => item.id === offerId);
  if (!offer) {
    return (
      <AppShell desktopContent={<TrackingLinkGeneratorNotFound offerId={offerId} />}>
        <AppSection className="pb-8">
          <TrackingLinkGeneratorNotFound offerId={offerId} />
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
      <AppShell desktopContent={<TrackingLinkGeneratorNotFound offerId={offerId} />}>
        <AppSection className="pb-8">
          <TrackingLinkGeneratorNotFound offerId={offerId} />
        </AppSection>
      </AppShell>
    );
  }

  const existingLink = pickExistingLink(trackingLinks, offer.id);
  const destinationUrl = offerDestinationUrls[offer.id] ?? "https://vaffiliate.vn";
  const shortCode: TrackingLinkId | string = existingLink
    ? existingLink.shortCode
    : buildSyntheticShortCode(offer.id);
  const fullUrl = existingLink ? existingLink.url : buildSyntheticUrl(offer.id);
  const parameters = offerTrackingParameters[offer.id] ?? [
    { label: "ref", value: "demo-user" },
    { label: "click_id", value: shortCode },
    { label: "campaign_id", value: campaign.id },
  ];

  const desktopContent = (
    <div className="space-y-6">
      <GeneratedLinkPreviewCard
        shortCode={String(shortCode)}
        fullUrl={fullUrl}
        commissionRate={offer.commissionRate}
        offerTitle={offer.title}
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <OfferSummaryCard
          offer={offer}
          categoryLabel={categoryLabels[offer.category ?? ""] ?? null}
        />
        <CampaignSummaryCard campaign={campaign} advertiserName={advertiser.name} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <DestinationUrlCard destinationUrl={destinationUrl} />
        <TrackingParametersCard parameters={parameters} />
      </div>
    </div>
  );

  return (
    <AppShell desktopContent={desktopContent}>
      <AppSection>
        <PageHeader
          eyebrow={
            <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
              {advertiser.platform} · {campaign.name}
            </p>
          }
          title="Tạo tracking link"
          description="Cấu hình và xem trước tracking link cho offer đã tham gia. Chỉ tham khảo, không lưu."
        />
      </AppSection>
      <AppSection className="mb-4">
        <GeneratedLinkPreviewCard
          shortCode={String(shortCode)}
          fullUrl={fullUrl}
          commissionRate={offer.commissionRate}
          offerTitle={offer.title}
        />
      </AppSection>
      <AppSection className="mb-4">
        <div className="grid gap-4 xl:grid-cols-2">
          <OfferSummaryCard
            offer={offer}
            categoryLabel={categoryLabels[offer.category ?? ""] ?? null}
          />
          <CampaignSummaryCard campaign={campaign} advertiserName={advertiser.name} />
        </div>
      </AppSection>
      <AppSection className="pb-8">
        <div className="grid gap-4 xl:grid-cols-2">
          <DestinationUrlCard destinationUrl={destinationUrl} />
          <TrackingParametersCard parameters={parameters} />
        </div>
      </AppSection>
    </AppShell>
  );
}
