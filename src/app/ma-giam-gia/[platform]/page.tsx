/**
 * Phase 20I.1 -- platform-scoped deals route.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import BrandLogo from "@/components/shared/BrandLogo";
import DealCategoryTabs from "@/features/deals/DealCategoryTabs";
import DealGrid from "@/features/deals/DealGrid";
import PlatformTabs from "@/features/deals/PlatformTabs";
import SafeDisclosure from "@/features/deals/SafeDisclosure";
import {
  listCategories,
  listDealsByCategory,
  listDealsByPlatform,
  listPlatforms,
  parseCategorySlug,
} from "@/services/public-deals.service";
import type {
  DealCategorySlug,
  DealPlatform,
} from "@/services/public-deals.types";

const ALLOWED_PLATFORMS: ReadonlyArray<DealPlatform> = [
  "shopee",
  "lazada",
  "tiktok",
  "tiki",
];

function isPlatform(value: string): value is DealPlatform {
  return (ALLOWED_PLATFORMS as ReadonlyArray<string>).includes(value);
}

function parseCategory(raw: string | string[] | undefined): DealCategorySlug {
  return parseCategorySlug(raw);
}

interface PlatformPageProps {
  readonly params: Promise<{ readonly platform: string }>;
  readonly searchParams: Promise<{ readonly category?: string | string[] }>;
}

export async function generateMetadata({ params }: PlatformPageProps) {
  const resolved = await params;
  const platform = isPlatform(resolved.platform) ? resolved.platform : null;
  const descriptor = listPlatforms().find((p) => p.platform === platform);
  if (!descriptor) {
    return { title: "Ưu đãi | Vaffiliate" };
  }
  return {
    title: `Ưu đãi ${descriptor.displayName} | Vaffiliate`,
    description: `Mã giảm giá và deal cho ${descriptor.displayName}.`,
  };
}

export default async function PlatformDealsPage({
  params,
  searchParams,
}: PlatformPageProps) {
  const resolved = await params;
  if (!isPlatform(resolved.platform)) {
    notFound();
  }
  const platform = resolved.platform;
  const sp = await searchParams;
  const category = parseCategory(sp.category);

  const allPlatforms = listPlatforms();
  const allCategories = listCategories();
  const platformDescriptor = allPlatforms.find(
    (p) => p.platform === platform,
  );

  if (!platformDescriptor) {
    notFound();
  }

  const deals =
    category === "all"
      ? listDealsByPlatform(platform)
      : listDealsByCategory(platform, category);

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

        <header className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--brand-strong)]">
            Sàn {platformDescriptor.displayName}
          </p>
          <h1 className="text-[length:var(--text-2xl)] font-semibold leading-[1.15] tracking-[-0.02em] text-[color:var(--text)] sm:text-[length:var(--text-4xl)]">
            {platformDescriptor.isLive
              ? `Mã giảm giá và deal ${platformDescriptor.displayName}`
              : `${platformDescriptor.displayName} đang được cập nhật`}
          </h1>
          <p className="max-w-[60ch] text-sm leading-6 text-[color:var(--text-muted)] sm:text-base">
            {platformDescriptor.isLive
              ? "Lọc theo danh mục để xem nhanh mã phù hợp với nhu cầu."
              : "Danh sách mã cho sàn này sẽ được bổ sung trong các phiên tiếp theo."}
          </p>
        </header>

        <PlatformTabs
          platforms={allPlatforms}
          activePlatform={platform}
        />

        {platformDescriptor.isLive ? (
          <section className="flex flex-col gap-4">
            <DealCategoryTabs
              platform={platform}
              categories={allCategories}
              activeCategory={category}
            />
            <DealGrid deals={deals} />
            <SafeDisclosure />
          </section>
        ) : (
          <section
            data-testid="platform-coming-soon"
            className="surface-card mt-5 bg-[rgba(255,250,246,0.72)] p-5"
          >
            <h2 className="text-base font-semibold text-[color:var(--text)]">
              {platformDescriptor.displayName} đang được cập nhật
            </h2>
            <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
              Danh sách mã cho {platformDescriptor.displayName} sẽ được bổ sung trong các phiên tiếp theo. Hiện tại bạn có thể xem các ưu đãi Shopee tại <Link href="/ma-giam-gia/shopee" className="underline">trang Shopee</Link>.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
