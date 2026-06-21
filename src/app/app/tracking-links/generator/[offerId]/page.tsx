import AppSection from "@/components/layout/AppSection";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/layout/PageHeader";
import CampaignSummaryCard from "@/features/tracking-links/generator/CampaignSummaryCard";
import DestinationUrlCard from "@/features/tracking-links/generator/DestinationUrlCard";
import GeneratedLinkPreviewCard from "@/features/tracking-links/generator/GeneratedLinkPreviewCard";
import OfferSummaryCard from "@/features/tracking-links/generator/OfferSummaryCard";
import TrackingLinkGeneratorNotFound from "@/features/tracking-links/generator/TrackingLinkGeneratorNotFound";
import { loadAffiliateAsync, loadTrackingLinkGeneratorContextAsync } from "@/hooks/loadAffiliateAsync";
import type { OfferId } from "@/types/ids";

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

function buildSyntheticTrackingUrl(shortCode: string): string {
  return `https://vaffiliate.vn/go/${encodeURIComponent(shortCode)}`;
}

function renderNotFound(offerId: string) {
  const content = <TrackingLinkGeneratorNotFound offerId={offerId} />;
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
  return offers.map((offer) => ({ offerId: offer.id }));
}

export default async function TrackingLinkGeneratorPage({
  params,
}: PageProps) {
  const { offerId } = await params;
  const { offer, campaign, advertiser, existingLink, defaultDestinationUrl } =
    await loadTrackingLinkGeneratorContextAsync(offerId as OfferId);

  let destinationUrl: string;
  let shortCode: string;
  let fullUrl: string;
  let isPreview: boolean;

  if (existingLink) {
    const existingTrackingUrl =
      existingLink.trackingUrl ?? existingLink.url;
    if (!existingTrackingUrl) {
      return renderNotFound(offerId);
    }
    destinationUrl = existingLink.destinationUrl;
    shortCode = existingLink.shortCode;
    fullUrl = existingTrackingUrl;
    isPreview = false;
  } else {
    const previewShortCode = buildSyntheticShortCode(offer.id);
    destinationUrl = defaultDestinationUrl;
    shortCode = previewShortCode;
    fullUrl = buildSyntheticTrackingUrl(previewShortCode);
    isPreview = true;
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
          categoryLabels[offer.category ?? ""] ?? null
        }
      />
      <CampaignSummaryCard
        campaign={campaign}
        advertiserName={advertiser.name}
      />
    </div>
  );

  const destinationCard = (
    <DestinationUrlCard destinationUrl={destinationUrl} />
  );

  const desktopContent = (
    <div className="space-y-6">
      {generatedLinkCard}
      {offerAndCampaignCards}
      {destinationCard}
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
          title={
            isPreview
              ? "Xem trước link hoàn tiền"
              : "Link hoàn tiền của bạn"
          }
          description={
            isPreview
              ? "Đây là bản xem trước. Link chưa được lưu và chưa thể sử dụng để ghi nhận giao dịch."
              : "Link hoàn tiền đã sẵn sàng. Bạn có thể sao chép link để mua hàng và nhận tiền hoàn cho giao dịch hợp lệ."
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
        {destinationCard}
      </AppSection>
    </AppShell>
  );
}
