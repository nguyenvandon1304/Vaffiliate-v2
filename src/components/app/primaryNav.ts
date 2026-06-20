export type NavItem = {
  label: string;
  href: string;
};

export const primaryNavItems: NavItem[] = [
  { label: "Trang chu", href: "/app" },
  { label: "Tao link", href: "/app/cashback" },
  { label: "Don hang", href: "/app/orders" },
  { label: "Vi tien", href: "/app/finance" },
  { label: "Tai khoan", href: "/app/profile" },
];

export const advancedNavItems: NavItem[] = [
  { label: "Chien dich", href: "/app/campaigns" },
  { label: "Uu dai", href: "/app/offers" },
  { label: "Link theo doi", href: "/app/tracking-links" },
  { label: "Nhap chuot", href: "/app/clicks" },
  { label: "Chuyen doi", href: "/app/conversions" },
  { label: "Thu nhap", href: "/app/commission" },
  { label: "Doanh thu", href: "/app/revenue" },
  { label: "Thong bao", href: "/app/notifications" },
];
