"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "Trang chủ", icon: "⌂", href: "/app" },
  { label: "Hoàn tiền", icon: "↗", href: "/app/cashback" },
  { label: "Đơn hàng", icon: "◫", href: "/app/orders" },
  { label: "Tài chính", icon: "◔", href: "/app/finance" },
  { label: "Thêm", icon: "⋯", href: "/app/more" },
];

export default function DesktopAppNav() {
  const pathname = usePathname();

  return (
    <aside className="desktop-app-nav hidden md:block">
      <div className="sticky top-6 rounded-[calc(var(--radius-xl)+0.4rem)] border border-[color:var(--line)] bg-[rgba(255,250,246,0.88)] p-4 shadow-[var(--shadow-md)] backdrop-blur">
        <div className="px-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
            Vaffiliate App
          </p>
          <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
            Điều hướng nhanh cho khu vực quản lý hoàn tiền.
          </p>
        </div>

        <nav className="mt-4 grid gap-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-[var(--radius-lg)] px-4 py-3 text-sm font-semibold transition-all ${
                  isActive
                    ? "bg-[linear-gradient(135deg,var(--brand),var(--brand-strong))] text-white shadow-[var(--shadow-glow)]"
                    : "text-[color:var(--text-muted)] hover:bg-[rgba(216,138,82,0.1)] hover:text-[color:var(--text)]"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/70 text-base text-inherit">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
