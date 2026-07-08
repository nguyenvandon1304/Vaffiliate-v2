/**
 * Phase 20I.1 -- category-level tabs for a platform.
 *
 * Active pill uses an inline white colour so the global
 * `a { color: inherit }` rule in globals.css cannot dim the label
 * against the dark background.
 *
 * Categories whose displayName is empty/whitespace are skipped so we
 * never render a blank pill.
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

const ACTIVE_PILL_WHITE = { color: "#ffffff" } as const;

function isRenderableLabel(value: string): boolean {
  return value.trim().length > 0;
}

export default function DealCategoryTabs({
  platform,
  categories,
  activeCategory,
}: DealCategoryTabsProps) {
  const visible = categories.filter((c) => isRenderableLabel(c.displayName));
  return (
    <nav
      aria-label="Danh mục"
      data-testid="category-tabs"
      className="flex flex-wrap items-center gap-2"
    >
      {visible.map((c) => {
        const isActive = c.slug === activeCategory;
        const href =
          c.slug === "all"
            ? `/ma-giam-gia/${platform}`
            : `/ma-giam-gia/${platform}?category=${c.slug}`;
        return (
          <Link
            key={c.slug}
            href={href}
            data-testid="category-tab"
            data-category-slug={c.slug}
            data-active={isActive ? "true" : "false"}
            aria-current={isActive ? "page" : undefined}
            style={isActive ? ACTIVE_PILL_WHITE : undefined}
            className={
              isActive
                ? "inline-flex items-center justify-center rounded-full bg-[color:var(--text)] px-3 py-1.5 text-xs font-semibold no-underline shadow-[var(--shadow-sm)]"
                : "inline-flex items-center justify-center rounded-full border border-[rgba(124,63,44,0.18)] bg-[rgba(255,250,246,0.78)] px-3 py-1.5 text-xs font-medium text-[color:var(--text)] no-underline"
            }
          >
            {c.displayName}
          </Link>
        );
      })}
    </nav>
  );
}
