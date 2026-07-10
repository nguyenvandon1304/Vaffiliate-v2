"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  buyerNavItems,
  isBuyerNavItemActive,
  type BuyerNavItem,
} from "./buyerNav";
import { buyerNavIconById } from "./BuyerNavIcons";

/**
 * Phase 20I.8 -- mobile-first bottom navigation for the buyer
 * app shell.
 *
 * Contract:
 *
 *   - Exactly the five items in `buyerNavItems`, no more, no less.
 *   - Each tap target is at least 44x44 CSS pixels (`min-h-11` =
 *     44px). The bottom nav also pads the bottom of the page
 *     (`pb-2`) so the OS gesture indicator at the bottom is
 *     respected via `bottom-nav-safe` (CSS env-safe-area-inset).
 *   - Active item is marked with `aria-current="page"` and a
 *     visible highlight. The producer wraps each `<Link>` with
 *     icon + label so screen readers and keyboard users have a
 *     real element, not a fake button.
 *   - The icons are decorative (`aria-hidden="true"`) because the
 *     link carries the equivalent Vietnamese `aria-label`.
 *   - On viewports >= md (768px) the nav hides itself. The
 *     desktop nav (`DesktopAppNav`) takes over above the
 *     breakpoint. This is intentional: the buyer shell is
 *     mobile-first but desktop-friendly, and forcing the bottom
 *     nav on a 1280px viewport crowds the content area.
 */
export default function BuyerMobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      data-testid="buyer-bottom-nav"
      className="bottom-nav-safe fixed inset-x-0 bottom-0 z-30 flex justify-center md:hidden"
      aria-label="Điều hướng chính của ví"
    >
      <div className="mx-auto w-full max-w-[430px] px-4 pb-2">
        <div className="flex items-stretch justify-around rounded-[calc(var(--radius-xl)+0.2rem)] border border-[color:var(--line)] bg-[rgba(255,250,246,0.94)] px-2 py-2 shadow-[var(--shadow-lg)] backdrop-blur">
          {buyerNavItems.map((item: BuyerNavItem) => {
            const isActive = isBuyerNavItemActive(item, pathname);
            const Icon = buyerNavIconById[item.iconId];

            return (
              <Link
                key={item.id}
                href={item.href}
                aria-label={item.ariaLabel}
                aria-current={isActive ? "page" : undefined}
                data-testid={`buyer-nav-${item.id}`}
                className={`flex min-h-11 min-w-[64px] flex-1 flex-col items-center justify-center gap-1 rounded-[var(--radius-md)] px-1 text-[11px] font-medium transition-colors ${
                  isActive
                    ? "bg-[rgba(216,138,82,0.14)] text-[color:var(--brand-strong)]"
                    : "text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
                }`}
              >
                <Icon className="text-base" />
                <span className="leading-tight">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
