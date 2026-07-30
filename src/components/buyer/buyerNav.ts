/**
 * Phase 20I.8 -- mobile-first buyer navigation contract.
 *
 * Defines the canonical five-item bottom navigation for the
 * authenticated buyer app shell (mobile-first). The list is
 * intentionally kept separate from the publisher / affiliate
 * `primaryNavItems` (`src/components/app/primaryNav.ts`) so the
 * buyer contract can evolve without disturbing the publisher
 * shells used by `/app/campaigns`, `/app/commission`, etc.
 *
 * Invariants (the contract this module enforces):
 *
 *   - Exactly five items. No more, no less. Each item carries
 *     a stable id, a destination path, a Vietnamese label and
 *     an icon name. Consumers MUST render at most these five.
 *   - Items resolve to existing, server-rendered buyer
 *     destinations. None of the five hrefs require a route we
 *     do not already ship.
 *   - The destination for "Ưu đãi" is `/app/offers` and the
 *     destination for "Hoàn tiền" is `/app/cashback`. Both are
 *     real authenticated buyer routes; they are NOT the public
 *     SEO surfaces (`/ma-giam-gia`, `/cashback`). Keeping the
 *     buyer chrome inside `/app/**` preserves the rule that
 *     `ResponsiveAppShell` only renders on authenticated
 *     surfaces.
 *   - The list is read-only data. Tests assert the exact length
 *     and the absence of duplicates / forbidden identifiers.
 */

export type BuyerNavIconId =
  | "home"
  | "tag"
  | "cashback"
  | "receipt"
  | "user";

export type BuyerNavId =
  | "home"
  | "deals"
  | "cashback"
  | "orders"
  | "account";

export type BuyerNavItem = {
  readonly id: BuyerNavId;
  readonly href: string;
  readonly label: string;
  readonly iconId: BuyerNavIconId;
  readonly ariaLabel: string;
};

export const buyerNavItems: ReadonlyArray<BuyerNavItem> = Object.freeze([
  {
    id: "home",
    href: "/app",
    label: "Trang chủ",
    iconId: "home",
    ariaLabel: "Về trang chủ",
  },
  {
    id: "deals",
    href: "/app/offers",
    label: "Ưu đãi",
    iconId: "tag",
    ariaLabel: "Mục ưu đãi",
  },
  {
    id: "cashback",
    href: "/app/cashback",
    label: "Hoàn tiền",
    iconId: "cashback",
    ariaLabel: "Mở mục hoàn tiền",
  },
  {
    id: "orders",
    href: "/app/orders",
    label: "Đơn hàng",
    iconId: "receipt",
    ariaLabel: "Theo dõi đơn hàng và hoàn tiền",
  },
  {
    id: "account",
    href: "/app/profile",
    label: "Tài khoản",
    iconId: "user",
    ariaLabel: "Hồ sơ và cài đặt tài khoản",
  },
]);

function normalizePath(pathname: string): string {
  if (typeof pathname !== "string" || pathname.length === 0) return "/";
  if (pathname !== "/" && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function isExactPath(pathname: string, target: string): boolean {
  return pathname === target;
}

function isPrefixOfChild(pathname: string, prefix: string): boolean {
  return pathname.startsWith(`${prefix}/`);
}

/**
 * An item is active when the user's pathname matches the item's
 * href exactly OR a direct child of that href. This rule is the
 * same as the publisher `isPrimaryNavItemActive` helper, kept
 * consistent here so swapping the bottom nav does not change
 * navigation semantics.
 *
 * Special case: the buyer `home` item only matches the exact
 * `/app` route, NOT any child. Otherwise `/app/cashback` would
 * incorrectly mark the home item as active and compete with the
 * "Hoàn tiền" item for the active marker.
 *
 * Alias paths (`/app/deals` -> `/app/offers`,
 * `/app/account` -> `/app/profile`) also activate the matching
 * item so the bottom-nav marker stays correct during the brief
 * render window before `redirect()` resolves the canonical
 * route.
 */
export function isBuyerNavItemActive(
  item: BuyerNavItem,
  pathname: string,
): boolean {
  const norm = normalizePath(pathname);

  if (item.id === "home") {
    return norm === item.href;
  }

  if (item.id === "deals") {
    return (
      norm === item.href ||
      isPrefixOfChild(norm, item.href) ||
      norm === "/app/deals" ||
      isPrefixOfChild(norm, "/app/deals")
    );
  }

  if (item.id === "account") {
    return (
      norm === item.href ||
      isPrefixOfChild(norm, item.href) ||
      norm === "/app/account" ||
      isPrefixOfChild(norm, "/app/account") ||
      norm === "/app/payouts" ||
      isPrefixOfChild(norm, "/app/payouts")
    );
  }

  return isExactPath(norm, item.href) || isPrefixOfChild(norm, item.href);
}

/**
 * Resolve the active buyer item for the given pathname, or `null`
 * if none of the five items match. Useful for SSR pre-painting the
 * active marker on the same render pass that produces the HTML.
 */
export function resolveActiveBuyerNavItem(
  pathname: string,
): BuyerNavItem | null {
  for (const item of buyerNavItems) {
    if (isBuyerNavItemActive(item, pathname)) {
      return item;
    }
  }
  return null;
}

/**
 * The account entry point surfaced by the buyer top bar. Routed to
 * `/app/profile` because the canonical profile surface already
 * exists. The redirect-from-`/app/account` route re-routes here at
 * the URL level so the destination is single-sourced.
 */
export const BUYER_ACCOUNT_HREF = "/app/profile";

/**
 * The deals entry point. Re-routed from `/app/deals` to
 * `/app/offers` because the canonical deals surface already
 * exists under the existing buyer route.
 */
export const BUYER_DEALS_HREF = "/app/offers";
