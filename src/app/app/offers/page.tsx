import BuyerResponsiveShell from "@/components/buyer/BuyerResponsiveShell";
import AppSection from "@/components/layout/AppSection";
import PageHeader from "@/components/layout/PageHeader";
import OfferFilters from "@/features/offers/OfferFilters";
import OfferStats from "@/features/offers/OfferStats";
import OfferTable from "@/features/offers/OfferTable";
import { loadAffiliateAsync } from "@/hooks/loadAffiliateAsync";
import { privateRouteMetadata } from "@/lib/seo/private-route-metadata";
import type { OfferPlatform, OfferStat, OfferView } from "@/types/affiliate";
import type { PlatformLabel } from "@/types/common";

export const metadata = privateRouteMetadata();

// Phase 20I.8 follow-up safety: buyer-facing hero copy on /app/offers.
// We state Shopee is the active platform and explicitly mark TikTok
// Shop as upcoming. The wording avoids any "currently supported"
// phrasing that would let a buyer read TikTok Shop as live.
const OFFERS_HERO_EYEBROW = "Mua sắm hoàn tiền Shopee";
const OFFERS_HERO_TITLE = "Chương trình hoàn tiền";
const OFFERS_HERO_DESCRIPTION =
  "Vaffiliate hiện hỗ trợ hoàn tiền qua Shopee. TikTok Shop sẽ được cập nhật sau khi tracking và reconciliation hoàn thiện. Chọn chương trình phù hợp để tạo link hoàn tiền.";

const platformMap: Partial<Record<PlatformLabel, OfferPlatform>> = {
  Shopee: "shopee",
};

// Phase 20I.8 follow-up safety: TikTok Shop is planned AFTER Shopee.
// Until tracking + reconciliation for TikTok Shop are production-ready
// we MUST NOT surface TikTok Shop as an active offer platform on this
// page. The buyer sees Shopee offers only; TikTok Shop rows are
// filtered out below. The "TikTok Shop" string still appears here
// in the upcoming-platform list, but never as an active filter
// chip or as a row in the active offers table.
// `platformFilterLabels` is keyed by `OfferPlatform` so the runtime
// loop above (`platformsInUse`) can iterate every possible platform.
// Phase 20I.8 follow-up safety: TikTok Shop is NOT active on the
// buyer surface, so the `tiktok` key below is intentionally never
// reached. We keep it (typed, never displayed) to satisfy the
// `Record<OfferPlatform, string>` contract while the upstream
// filter drops TikTok rows from `offerViews`.
const platformFilterLabels: Record<OfferPlatform, string> = {
  shopee: "Shopee",
  tiktok: "TikTok Shop",
};

// Platforms we explicitly do NOT show as active offers on the buyer
// surface. Each entry is a Vietnamese label rendered in the
// "Sắp hỗ trợ" upcoming list further down the page.
//
// Order is meaningful: TikTok Shop is listed FIRST so that it does
// not visually disappear behind later entries on a small mobile
// viewport where the chips wrap.
const UPCOMING_OFFER_PLATFORMS: ReadonlyArray<string> = [
  "TikTok Shop",
  "Lazada",
  "Tiki",
  "Sendo",
];

export default async function OffersPage() {
  const { advertisers, campaigns, offers } = await loadAffiliateAsync();

  const offerViews: OfferView[] = offers.flatMap((offer) => {
    const campaign = campaigns.find((item) => item.id === offer.campaignId);
    if (!campaign) return [];
    const advertiser = advertisers.find((item) => item.id === campaign.advertiserId);
    if (!advertiser) return [];
    const platform = platformMap[advertiser.platform];
    if (!platform) return [];
    // Phase 20I.8 follow-up safety: TikTok Shop is upcoming, not
    // active. Drop TikTok rows from the buyer-facing offer list
    // before they reach the table or the filter chips.
    if (platform === "tiktok") return [];
    return [
      {
        id: offer.id,
        title: offer.title,
        platform,
        category: offer.category ?? "",
        commissionRate: offer.commissionRate,
        status: campaign.status,
        campaignId: campaign.id,
        campaignName: campaign.name,
      },
    ];
  });

  const activeCount = offerViews.filter((offer) => offer.status === "active").length;

  const stats: OfferStat[] = [
    { label: "Tổng chương trình", value: String(offerViews.length) },
    { label: "Đang chạy", value: String(activeCount) },
    {
      label: "Sàn hỗ trợ",
      value: String(new Set(offerViews.map((offer) => offer.platform)).size),
    },
  ];

  const platformsInUse = (Object.keys(platformFilterLabels) as OfferPlatform[]).filter(
    (platform) => offerViews.some((offer) => offer.platform === platform)
  );

  const filters = ["Tất cả", ...platformsInUse.map((platform) => platformFilterLabels[platform])];

  const desktopContent = (
    <div className="space-y-6">
      <section className="surface-card overflow-hidden bg-[linear-gradient(180deg,rgba(255,252,249,0.92),rgba(248,238,231,0.96))] p-6">
        <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
          {OFFERS_HERO_EYEBROW}
        </p>
        <h1 className="text-[2rem] font-semibold tracking-[-0.04em] text-[color:var(--text)]">
          {OFFERS_HERO_TITLE}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[color:var(--text-muted)]">
          {OFFERS_HERO_DESCRIPTION}
        </p>
      </section>

      <OfferStats stats={stats} />
      <OfferFilters filters={filters} />
      <OfferTable offers={offerViews} />

      <section
        data-testid="offers-upcoming-platforms"
        aria-labelledby="offers-upcoming-platforms-title"
      >
        <div className="rounded-[var(--radius-xl)] border border-[rgba(124,63,44,0.1)] bg-[rgba(255,250,246,0.72)] p-5 shadow-[var(--shadow-sm)]">
          <h2
            id="offers-upcoming-platforms-title"
            className="mb-3 text-base font-semibold text-[color:var(--text)]"
          >
            Sắp hỗ trợ
          </h2>
          <p className="mb-3 text-xs text-[color:var(--text-muted)]">
            Các sàn sau sẽ được cập nhật sau khi tracking và reconciliation hoàn thiện.
          </p>
          <div className="flex flex-wrap gap-2">
            {UPCOMING_OFFER_PLATFORMS.map((item) => (
              <span
                key={item}
                className="cursor-not-allowed rounded-full border border-[rgba(124,63,44,0.12)] bg-[rgba(255,252,249,0.74)] px-3 py-1 text-xs font-medium text-[color:var(--text-muted)] opacity-75"
                aria-disabled="true"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>
    </div>
  );

  return (
    <BuyerResponsiveShell title="Ưu đãi" desktopContent={desktopContent}>
      <AppSection>
        <PageHeader
          eyebrow={
            <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
              {OFFERS_HERO_EYEBROW}
            </p>
          }
          title={OFFERS_HERO_TITLE}
          description={OFFERS_HERO_DESCRIPTION}
        />
      </AppSection>
      <AppSection>
        <OfferStats stats={stats} />
      </AppSection>
      <AppSection>
        <OfferFilters filters={filters} />
      </AppSection>
      <OfferTable offers={offerViews} />
      <AppSection className="mt-4 pb-8">
        <div className="rounded-[var(--radius-xl)] border border-[rgba(124,63,44,0.1)] bg-[rgba(255,250,246,0.62)] p-4 shadow-[var(--shadow-sm)]">
          <h2 className="mb-2 text-sm font-semibold text-[color:var(--text)]">
            Sắp hỗ trợ
          </h2>
          <p className="mb-3 text-xs text-[color:var(--text-muted)]">
            Sẽ cập nhật sau khi tracking và reconciliation hoàn thiện.
          </p>
          <div className="flex flex-wrap gap-2">
            {UPCOMING_OFFER_PLATFORMS.map((item) => (
              <span
                key={item}
                className="cursor-not-allowed rounded-full border border-[rgba(124,63,44,0.12)] bg-[rgba(255,252,249,0.74)] px-3 py-1 text-xs font-medium text-[color:var(--text-muted)] opacity-75"
                aria-disabled="true"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </AppSection>
    </BuyerResponsiveShell>
  );
}
