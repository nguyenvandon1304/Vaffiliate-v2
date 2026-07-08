/**
 * Phase 20I.1 -- platform-level tabs.
 */
import Link from "next/link";
import type { DealPlatform, PlatformDescriptor } from "@/services/public-deals.types";

interface PlatformTabsProps {
  readonly platforms: ReadonlyArray<PlatformDescriptor>;
  readonly activePlatform: DealPlatform;
}

export default function PlatformTabs({
  platforms,
  activePlatform,
}: PlatformTabsProps) {
  return (
    <nav
      aria-label="Sàn"
      data-testid="platform-tabs"
      className="flex flex-wrap items-center gap-2"
    >
      {platforms.map((p) => {
        const isActive = p.platform === activePlatform;
        const href = `/ma-giam-gia/${p.platform}`;
        if (!p.isLive) {
          return (
            <span
              key={p.platform}
              data-disabled="true"
              className="rounded-full border border-dashed border-[rgba(124,63,44,0.18)] bg-[rgba(255,250,246,0.5)] px-4 py-2 text-sm font-medium text-[color:var(--text-muted)]"
            >
              {p.displayName} - Sắp ra mắt
            </span>
          );
        }
        return (
          <Link
            key={p.platform}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={
              isActive
                ? "rounded-full bg-[color:var(--brand-strong)] px-4 py-2 text-sm font-semibold text-white shadow-[var(--shadow-sm)]"
                : "rounded-full border border-[rgba(124,63,44,0.18)] bg-[rgba(255,250,246,0.84)] px-4 py-2 text-sm font-medium text-[color:var(--text)] shadow-[var(--shadow-sm)]"
            }
          >
            {p.displayName}
          </Link>
        );
      })}
    </nav>
  );
}
