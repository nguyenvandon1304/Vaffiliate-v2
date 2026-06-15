import AppShell from "@/components/layout/AppShell";
import AppSection from "@/components/layout/AppSection";
import PageHeader from "@/components/layout/PageHeader";
import OfferFilters from "@/features/offers/OfferFilters";
import OfferStats from "@/features/offers/OfferStats";
import OfferTable from "@/features/offers/OfferTable";
import { useAffiliateAsync } from "@/hooks/useAffiliateAsync";
import type { OfferPlatform, OfferStat, OfferView } from "@/types/affiliate";
import type { PlatformLabel } from "@/types/common";

const platformMap: Partial<Record<PlatformLabel, OfferPlatform>> = {
  Shopee: "shopee",
  "TikTok Shop": "tiktok",
};

const platformFilterLabels: Record<OfferPlatform, string> = {
  shopee: "Shopee",
  tiktok: "TikTok Shop",
};

export default async function OffersPage() {
  const { advertisers, campaigns, offers } = await useAffiliateAsync();

  const offerViews: OfferView[] = offers.flatMap((offer) => {
    const campaign = campaigns.find((item) => item.id === offer.campaignId);
    if (!campaign) return [];
    const advertiser = advertisers.find((item) => item.id === campaign.advertiserId);
    if (!advertiser) return [];
    const platform = platformMap[advertiser.platform];
    if (!platform) return [];
    return [
      {
        id: offer.id,
        title: offer.title,
        platform,
        category: offer.category ?? "",
        commissionRate: offer.commissionRate,
        status: campaign.status,
      },
    ];
  });

  const activeCount = offerViews.filter((offer) => offer.status === "active").length;

  const stats: OfferStat[] = [
    { label: "Tổng offer", value: String(offerViews.length) },
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
          Khám phá offer affiliate từ Shopee và TikTok Shop
        </p>
        <h1 className="text-[2rem] font-semibold tracking-[-0.04em] text-[color:var(--text)]">
          Offer Center
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[color:var(--text-muted)]">
          Vaffiliate hiện hỗ trợ hoàn tiền qua Shopee và TikTok Shop. Chọn offer phù hợp để tạo link hoàn tiền.
        </p>
      </section>

      <OfferStats stats={stats} />
      <OfferFilters filters={filters} />
      <OfferTable offers={offerViews} />
    </div>
  );

  return (
    <AppShell desktopContent={desktopContent}>
      <AppSection>
        <PageHeader
          eyebrow={
            <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
              Khám phá offer affiliate từ Shopee và TikTok Shop
            </p>
          }
          title="Offer Center"
          description="Vaffiliate hiện hỗ trợ hoàn tiền qua Shopee và TikTok Shop. Chọn offer phù hợp để tạo link hoàn tiền."
        />
      </AppSection>
      <AppSection>
        <OfferStats stats={stats} />
      </AppSection>
      <AppSection>
        <OfferFilters filters={filters} />
      </AppSection>
      <OfferTable offers={offerViews} />
    </AppShell>
  );
}
