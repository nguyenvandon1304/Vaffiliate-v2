import AppSection from "@/components/layout/AppSection";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/layout/PageHeader";
import CampaignSummaryCard from "@/features/tracking-links/generator/CampaignSummaryCard";
import DestinationUrlCard from "@/features/tracking-links/generator/DestinationUrlCard";
import GeneratedLinkPreviewCard from "@/features/tracking-links/generator/GeneratedLinkPreviewCard";
import OfferSummaryCard from "@/features/tracking-links/generator/OfferSummaryCard";
import TrackingLinkGeneratorNotFound from "@/features/tracking-links/generator/TrackingLinkGeneratorNotFound";
import TrackingParametersCard from "@/features/tracking-links/generator/TrackingParametersCard";
import { loadAffiliateAsync } from "@/hooks/loadAffiliateAsync";
import { offerDestinationUrls } from "@/lib/mock/affiliate";
import type { TrackingLink } from "@/types/affiliate";
import type { OfferId } from "@/types/ids";

type RouteParams = {
  offerId: string;
};

type PageProps = {
  params: Promise<RouteParams>;
};

type TrackingParameter = {
  label: string;
  value: string;
};

const categoryLabels: Record<string, string> = {
  "Thời trang": "Thời trang",
  "Làm đẹp": "Làm đẹp",
  "Gia dụng": "Gia dụng",
};

function buildSyntheticShortCode(offerId: OfferId): string {
  return `tl-${offerId.replace(/^off-/, "")}`;
}

function buildSyntheticTrackingUrl(shortCode: string): string {
  // clickId is created only when the future redirect handler
  // receives GET /go/:shortCode.
  return `https://vaffiliate.vn/go/${encodeURIComponent(shortCode)}`;
}

function pickExistingLink(
  trackingLinks: TrackingLink[],
  offerId: OfferId,
): TrackingLink | null {
  return (
    trackingLinks.find(
      (trackingLink) => trackingLink.offerId === offerId,
    ) ?? null
  );
}

function renderNotFound(offerId: string) {
  const content = (
    <TrackingLinkGeneratorNotFound offerId={offerId} />
  );

  return (
    <AppShell desktopContent={content}>
      <AppSection className="pb-8">
        {content}
      </AppSection>
    </AppShell>
  );
}

export async function generateStaticParams(): Promise<RouteParams[]> {
  const { offers } = await loadAffiliateAsync();

  return offers.map((offer) => ({
    offerId: offer.id,
  }));
}

export default async function TrackingLinkGeneratorPage({
  params,
}: PageProps) {
  const { offerId } = await params;

  const {
    offers,
    campaigns,
    advertisers,
    trackingLinks,
  } = await loadAffiliateAsync();

  const offer = offers.find(
    (item) => item.id === offerId,
  );

  if (!offer) {
    return renderNotFound(offerId);
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
    return renderNotFound(offerId);
  }

  const existingLink = pickExistingLink(
    trackingLinks,
    offer.id,
  );

  let destinationUrl: string;
  let shortCode: string;
  let fullUrl: string;
  let isPreview: boolean;
  let parameters: TrackingParameter[];

  if (existingLink) {
    // Existing entity:
    // use the destination and tracking URL snapshot
    // stored on the real tracking-link entity.
    const existingTrackingUrl =
      existingLink.trackingUrl ??
      existingLink.url;

    if (!existingTrackingUrl) {
      return renderNotFound(offerId);
    }

    destinationUrl =
      existingLink.destinationUrl;

    shortCode =
      existingLink.shortCode;

    fullUrl =
      existingTrackingUrl;

    isPreview =
      false;

    parameters = [
      {
        label: "short_code",
        value: existingLink.shortCode,
      },
    ];
  } else {
    // Preview only:
    // no tracking-link entity has been persisted yet.
    const previewShortCode =
      buildSyntheticShortCode(offer.id);

    destinationUrl =
      offerDestinationUrls[offer.id] ??
      "https://vaffiliate.vn";

    shortCode =
      previewShortCode;

    fullUrl =
      buildSyntheticTrackingUrl(
        previewShortCode,
      );

    isPreview =
      true;

    parameters = [
      {
        label: "short_code",
        value: `${previewShortCode} (preview)`,
      },
    ];
  }

  const generatedLinkCard = (
    <GeneratedLinkPreviewCard
      shortCode={shortCode}
      fullUrl={fullUrl}
      commissionRate={offer.commissionRate}
      offerTitle={offer.title}
      isPreview={isPreview}
    />
  );

  const offerAndCampaignCards = (
    <div className="grid gap-4 xl:grid-cols-2">
      <OfferSummaryCard
        offer={offer}
        categoryLabel={
          categoryLabels[offer.category ?? ""] ??
          null
        }
      />

      <CampaignSummaryCard
        campaign={campaign}
        advertiserName={advertiser.name}
      />
    </div>
  );

  const destinationAndParametersCards = (
    <div className="grid gap-4 xl:grid-cols-2">
      <DestinationUrlCard
        destinationUrl={destinationUrl}
      />

      <TrackingParametersCard
        parameters={parameters}
      />
    </div>
  );

  const desktopContent = (
    <div className="space-y-6">
      {generatedLinkCard}
      {offerAndCampaignCards}
      {destinationAndParametersCards}
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
          description={
            isPreview
              ? "Xem trước tracking link cho offer đã tham gia. Link này chưa được lưu và chưa thể sử dụng để ghi nhận chuyển đổi."
              : "Tracking link này đã được tạo. Bạn có thể sử dụng link để chia sẻ và ghi nhận chuyển đổi."
          }
        />
      </AppSection>

      <AppSection className="mb-4">
        {generatedLinkCard}
      </AppSection>

      <AppSection className="mb-4">
        {offerAndCampaignCards}
      </AppSection>

      <AppSection className="pb-8">
        {destinationAndParametersCards}
      </AppSection>
    </AppShell>
  );
}
