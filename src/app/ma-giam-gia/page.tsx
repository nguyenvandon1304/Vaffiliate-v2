/**
 * Phase 20I.1 -- public deals landing page.
 */
import Link from "next/link";
import BrandLogo from "@/components/shared/BrandLogo";
import DealGrid from "@/features/deals/DealGrid";
import DealHero from "@/features/deals/DealHero";
import PlatformTabs from "@/features/deals/PlatformTabs";
import SafeDisclosure from "@/features/deals/SafeDisclosure";
import {
  listDealsByPlatform,
  listFeaturedDeals,
  listPlatforms,
} from "@/services/public-deals.service";

export const metadata = {
  title: "Mã giảm giá & ưu đãi | Vaffiliate",
  description:
    "Tổng hợp mã giảm giá, deal nổi bật và ưu đãi Shopee, cập nhật theo ngày.",
};

export default function PublicDealsPage() {
  const featured = listFeaturedDeals();
  const shopee = listDealsByPlatform("shopee");
  const platforms = listPlatforms();

  return (
    <main className="min-h-screen px-4 py-5 sm:px-6 sm:py-8">
      <div className="page-shell flex flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-[color:var(--line)] pb-5 sm:flex-row sm:items-center sm:justify-between">
          <BrandLogo />
          <nav
            className="flex flex-wrap items-center gap-3 text-sm font-medium text-[color:var(--text-muted)]"
            aria-label="Tài khoản"
          >
            <Link
              href="/ma-giam-gia"
              className="rounded-full border border-[rgba(124,63,44,0.18)] bg-[rgba(255,250,246,0.84)] px-4 py-2 text-[color:var(--text)] shadow-[var(--shadow-sm)]"
            >
              Tất cả ưu đãi
            </Link>
            <Link
              href="/cashback"
              className="rounded-full px-4 py-2 text-[color:var(--text-muted)]"
            >
              Hoàn tiền Shopee
            </Link>
          </nav>
        </header>

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
      </div>
    </main>
  );
}
