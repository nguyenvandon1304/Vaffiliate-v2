/**
 * Phase 20I.1 -- public deals landing page.
 * Phase 20I.7 -- mobile-first polish:
 *   - canonical + OpenGraph metadata via shared helper
 *   - BreadcrumbList JSON-LD
 *   - unified PublicTopNav header
 *   - mobile-first public footer
 *   - same content; no overpromise.
 */
import PublicTopNav from "@/components/public/PublicTopNav";
import PublicFooter from "@/components/public/PublicFooter";
import DealGrid from "@/features/deals/DealGrid";
import DealHero from "@/features/deals/DealHero";
import PlatformTabs from "@/features/deals/PlatformTabs";
import SafeDisclosure from "@/features/deals/SafeDisclosure";
import CouponGuideSection from "@/features/deals/CouponGuideSection";
import { buildPublicRouteMetadata } from "@/lib/seo/public-route-metadata";
import {
  JsonLdScript,
  buildBreadcrumbJsonLd,
  buildFaqJsonLd,
} from "@/lib/seo/jsonld";
import { COUPON_GUIDE_FAQS } from "@/lib/seo/coupon-guide-content";
import {
  listDealsByPlatform,
  listFeaturedDeals,
  listPlatforms,
} from "@/services/public-deals.service";

export const metadata = buildPublicRouteMetadata({
  title: "Mã giảm giá & ưu đãi",
  description:
    "Tổng hợp mã giảm giá và ưu đãi Shopee đang áp dụng, cập nhật theo ngày trên Vaffiliate.",
  canonicalPath: "/ma-giam-gia",
});

export default function PublicDealsPage() {
  const featured = listFeaturedDeals();
  const shopee = listDealsByPlatform("shopee");
  const platforms = listPlatforms();

  return (
    <main className="min-h-screen px-4 py-5 sm:px-6 sm:py-8">
      <div className="page-shell flex flex-col gap-6">
        <JsonLdScript
          payloads={[
            buildBreadcrumbJsonLd([
              { name: "Trang chủ", item: "/" },
              {
                name: "Mã giảm giá & ưu đãi",
                item: "/ma-giam-gia",
              },
            ]),
            buildFaqJsonLd(COUPON_GUIDE_FAQS),
          ]}
        />

        <PublicTopNav isAuthenticated={false} active="deals" />

        <DealHero />

        <section className="flex flex-col gap-4">
          <h2 className="text-[length:var(--text-xl)] font-semibold tracking-[-0.01em] text-[color:var(--text)]">
            Ưu đãi nổi bật
          </h2>
          <DealGrid deals={featured} />
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-[length:var(--text-xl)] font-semibold tracking-[-0.01em] text-[color:var(--text)]">
            Tất cả ưu đãi theo sàn
          </h2>
          <PlatformTabs platforms={platforms} activePlatform="shopee" />
          <DealGrid deals={shopee} />
        </section>

        <SafeDisclosure />

        <CouponGuideSection
          heading="Cách dùng mã giảm giá và hoàn tiền"
          faqIdPrefix="ma-giam-gia-guide"
        />

        <PublicFooter />
      </div>
    </main>
  );
}
