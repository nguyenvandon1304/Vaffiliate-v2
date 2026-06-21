export type PrimaryNavId =
  | "home"
  | "cashback"
  | "orders"
  | "wallet"
  | "profile";

export interface PrimaryNavItem {
  id: PrimaryNavId;
  href: string;
  label: string;
}

export function isPrimaryNavItemActive(
  item: PrimaryNavItem,
  pathname: string,
): boolean {
  if (item.id === "home") {
    return pathname === "/app";
  }

  if (item.id === "cashback") {
    return (
      pathname === "/app/cashback" ||
      pathname === "/app/offers" ||
      pathname.startsWith("/app/offers/") ||
      pathname.startsWith("/app/tracking-links/generator/")
    );
  }

  return (
    pathname === item.href ||
    pathname.startsWith(`${item.href}/`)
  );
}

export const primaryNavItems: PrimaryNavItem[] = [
  { id: "home", href: "/app", label: "Trang chủ" },
  { id: "cashback", href: "/app/cashback", label: "Mua & hoàn\u00A0tiền" },
  { id: "orders", href: "/app/orders", label: "Đơn hàng" },
  { id: "wallet", href: "/app/finance", label: "Ví tiền" },
  { id: "profile", href: "/app/profile", label: "Tài khoản" },
];

export const advancedNavItems = [
  { id: "campaigns", href: "/app/campaigns", label: "Chiến dịch" },
  { id: "offers", href: "/app/offers", label: "Ưu đãi" },
  { id: "tracking-links", href: "/app/tracking-links", label: "Link theo dõi" },
  { id: "clicks", href: "/app/clicks", label: "Nhấp chuột" },
  { id: "conversions", href: "/app/conversions", label: "Chuyển đổi" },
  { id: "commission", href: "/app/commission", label: "Thu nhập" },
  { id: "revenue", href: "/app/revenue", label: "Doanh thu" },
  { id: "notifications", href: "/app/notifications", label: "Thông báo" },
];
