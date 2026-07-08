/**
 * Phase 20I.1 -- category-level tabs for a platform.
 */
import Link from "next/link";
import type {
  DealCategoryDescriptor,
  DealCategorySlug,
  DealPlatform,
} from "@/services/public-deals.types";

interface DealCategoryTabsProps {
  readonly platform: DealPlatform;
  readonly categories: ReadonlyArray<DealCategoryDescriptor>;
  readonly activeCategory: DealCategorySlug;
}

export default function DealCategoryTabs({
  platform,
  categories,
  activeCategory,
}: DealCategoryTabsProps) {
  return (
    <nav
      aria-label="Danh mục"
      data-testid="category-tabs"
      className="flex flex-wrap items-center gap-2"
    >
      {categories.map((c) => {
        const isActive = c.slug === activeCategory;
        const href =
          c.slug === "all"
            ? `/ma-giam-gia/${platform}`
            : `/ma-giam-gia/${platform}?category=${c.slug}`;
        return (
          <Link
            key={c.slug}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={
              isActive
                ? "rounded-full bg-[color:var(--text)] px-3 py-1.5 text-xs font-semibold text-white"
                : "rounded-full border border-[rgba(124,63,44,0.18)] bg-[rgba(255,250,246,0.78)] px-3 py-1.5 text-xs font-medium text-[color:var(--text)]"
            }
          >
            {c.displayName}
          </Link>
        );
      })}
    </nav>
  );
}
