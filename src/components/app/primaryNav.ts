export type PrimaryNavId =
  | "home"
  | "cashback"
  | "orders"
  | "wallet"
  | "profile";

export type MobileNavId =
  | "home"
  | "cashback"
  | "orders"
  | "wallet"
  | "more";

export type AdvancedNavId =
  | "campaigns"
  | "offers"
  | "tracking-links"
  | "clicks"
  | "conversions"
  | "commission"
  | "revenue"
  | "notifications";

export type NavItemId =
  | PrimaryNavId
  | MobileNavId
  | AdvancedNavId;

export interface NavItem<TId extends NavItemId = NavItemId> {
  id: TId;
  href: string;
  label: string;
}

export type PrimaryNavItem = NavItem<PrimaryNavId>;
export type MobileNavItem = NavItem<MobileNavId>;
export type AdvancedNavItem = NavItem<AdvancedNavId>;

export interface AdvancedNavSection {
  id: "affiliate" | "reports" | "system";
  label: string;
  items: AdvancedNavItem[];
}

function isPathActive(href: string, pathname: string): boolean {
  return (
    pathname === href ||
    pathname.startsWith(`${href}/`)
  );
}

function isCashbackRoute(pathname: string): boolean {
  return (
    pathname === "/app/cashback" ||
    pathname === "/app/offers" ||
    pathname.startsWith("/app/offers/") ||
    pathname.startsWith("/app/tracking-links/generator/")
  );
}

function isMoreRoute(pathname: string): boolean {
  if (
    pathname === "/app/more" ||
    isPathActive("/app/profile", pathname) ||
    isPathActive("/app/campaigns", pathname) ||
    isPathActive("/app/clicks", pathname) ||
    isPathActive("/app/conversions", pathname) ||
    isPathActive("/app/commission", pathname) ||
    isPathActive("/app/revenue", pathname) ||
    isPathActive("/app/notifications", pathname)
  ) {
    return true;
  }

  return (
    isPathActive("/app/tracking-links", pathname) &&
    !pathname.startsWith("/app/tracking-links/generator/")
  );
}

/**
 * Compatibility helper for the original five-item primary navigation.
 */
export function isPrimaryNavItemActive(
  item: PrimaryNavItem,
  pathname: string,
): boolean {
  if (item.id === "home") {
    return pathname === "/app";
  }

  if (item.id === "cashback") {
    return isCashbackRoute(pathname);
  }

  return isPathActive(item.href, pathname);
}

/**
 * Desktop renders advanced destinations separately, so each primary item only
 * owns its direct route tree. This prevents two desktop navigation items from
 * appearing active at the same time.
 */
export function isDesktopPrimaryNavItemActive(
  item: PrimaryNavItem,
  pathname: string,
): boolean {
  if (item.id === "home") {
    return pathname === "/app";
  }

  return isPathActive(item.href, pathname);
}

export function isMobileNavItemActive(
  item: MobileNavItem,
  pathname: string,
): boolean {
  if (item.id === "home") {
    return pathname === "/app";
  }

  if (item.id === "cashback") {
    return isCashbackRoute(pathname);
  }

  if (item.id === "more") {
    return isMoreRoute(pathname);
  }

  return isPathActive(item.href, pathname);
}

export function isAdvancedNavItemActive(
  item: AdvancedNavItem,
  pathname: string,
): boolean {
  return isPathActive(item.href, pathname);
}

export const primaryNavItems: PrimaryNavItem[] = [
  { id: "home", href: "/app", label: "Trang chủ" },
  {
    id: "cashback",
    href: "/app/cashback",
    label: "Mua & hoàn\u00A0tiền",
  },
  { id: "orders", href: "/app/orders", label: "Đơn hàng" },
  { id: "wallet", href: "/app/finance", label: "Ví tiền" },
  { id: "profile", href: "/app/profile", label: "Tài khoản" },
];

export const mobileNavItems: MobileNavItem[] = [
  { id: "home", href: "/app", label: "Trang chủ" },
  {
    id: "cashback",
    href: "/app/cashback",
    label: "Mua & hoàn\u00A0tiền",
  },
  { id: "orders", href: "/app/orders", label: "Đơn hàng" },
  { id: "wallet", href: "/app/finance", label: "Ví tiền" },
  { id: "more", href: "/app/more", label: "Thêm" },
];

export const advancedNavSections: AdvancedNavSection[] = [
  {
    id: "affiliate",
    label: "Affiliate",
    items: [
      {
        id: "campaigns",
        href: "/app/campaigns",
        label: "Chiến dịch",
      },
      {
        id: "offers",
        href: "/app/offers",
        label: "Ưu đãi",
      },
      {
        id: "tracking-links",
        href: "/app/tracking-links",
        label: "Link theo dõi",
      },
      {
        id: "clicks",
        href: "/app/clicks",
        label: "Nhấp chuột",
      },
    ],
  },
  {
    id: "reports",
    label: "Báo cáo",
    items: [
      {
        id: "conversions",
        href: "/app/conversions",
        label: "Chuyển đổi",
      },
      {
        id: "commission",
        href: "/app/commission",
        label: "Cashback",
      },
      {
        id: "revenue",
        href: "/app/revenue",
        label: "Doanh thu",
      },
    ],
  },
  {
    id: "system",
    label: "Hệ thống",
    items: [
      {
        id: "notifications",
        href: "/app/notifications",
        label: "Thông báo",
      },
    ],
  },
];

export const advancedNavItems: AdvancedNavItem[] =
  advancedNavSections.flatMap((section) => section.items);
