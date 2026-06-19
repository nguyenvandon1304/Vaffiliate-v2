"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { primaryNavItems } from "../app/primaryNav";

export default function MobileBottomNav() {
  const pathname = usePathname();

  const iconFor = (label: string): string => {
    switch (label) {
      case "Trang chủ":
        return "⌂";
      case "Tạo link":
        return "↗";
      case "Đơn hàng":
        return "◫";
      case "Ví tiền":
        return "◔";
      case "Tài khoản":
        return "⋯";
      default:
        return "•";
    }
  };

  return (
    <nav
      className="bottom-nav-safe fixed inset-x-0 bottom-0 z-30 sm:sticky sm:bottom-4"
      aria-label="Điều hướng chính"
    >
      <div className="mx-auto w-full max-w-[430px] px-4 pb-2 sm:px-3">
        <div className="flex items-center justify-around rounded-[calc(var(--radius-xl)+0.2rem)] border border-[color:var(--line)] bg-[rgba(255,250,246,0.94)] px-3 py-2.5 shadow-[var(--shadow-lg)] backdrop-blur">
          {primaryNavItems.map((item) => {
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.label}
                href={item.href}
                className={`flex min-w-14 flex-1 flex-col items-center gap-1 rounded-[var(--radius-md)] px-2 py-1.5 text-xs font-medium transition-all ${
                  isActive
                    ? "bg-[rgba(216,138,82,0.14)] text-[color:var(--brand-strong)]"
                    : "text-[color:var(--text-muted)]"
                }`}
                aria-current={isActive ? "page" : undefined}
                aria-label={item.label}
              >
                <span className="text-base" aria-hidden="true">
                  {iconFor(item.label)}
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
