import Link from "next/link";

import BrandLogo from "@/components/shared/BrandLogo";

/**
 * Phase 20I.7 -- shared public top navigation.
 *
 * Renders the small mobile-first top bar used by every public
 * SEO route (homepage, deals, cashback, policy). Includes:
 *
 *   - brand logo on the left
 *   - "Tất cả ưu đãi" and "Hoàn tiền Shopee" nav links in the
 *     middle
 *   - right-hand CTA slot. Unauthenticated visitors see
 *     "Đăng nhập" and "Tạo tài khoản"; authenticated visitors
 *     see "Mở ví hoàn tiền".
 *
 * Server component, zero client JS. The auth state is decided by
 * the parent page (which already loads Supabase).
 *
 * No admin / user dashboard links are rendered here, ever.
 * `/app` is gated by the Phase 20I.5 layout and proxy and the
 * top navigation intentionally never deep-links into it from
 * public marketing surfaces.
 */

export type PublicTopNavProps = {
  readonly isAuthenticated: boolean;
  /**
   * Which of the two nav links should be highlighted. The
   * marker is rendered on the active page so the user knows
   * which list / section they're on.
   */
  readonly active?: "deals" | "cashback" | "home" | "policy" | null;
  /**
   * Optional override of the brand logo placement. The default
   * left placement works for desktop and mobile.
   */
  readonly compact?: boolean;
};

export default function PublicTopNav({
  isAuthenticated,
  active = null,
  compact = false,
}: PublicTopNavProps) {
  return (
    <header
      className={
        compact
          ? "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          : "flex flex-col gap-3 border-b border-[color:var(--line)] pb-4 sm:flex-row sm:items-center sm:justify-between sm:pb-5"
      }
    >
      <Link
        href="/"
        aria-label="Vaffiliate - về trang chủ"
        className="inline-flex items-center"
      >
        <BrandLogo compact={compact} />
      </Link>

      <nav
        aria-label="Điều hướng chính"
        className="flex flex-wrap items-center gap-2 text-sm font-medium text-[color:var(--text-muted)]"
      >
        <Link
          href="/ma-giam-gia"
          aria-current={active === "deals" ? "page" : undefined}
          className={
            active === "deals"
              ? "rounded-full border border-[rgba(124,63,44,0.18)] bg-[rgba(255,250,246,0.86)] px-4 py-2 text-[color:var(--text)] shadow-[var(--shadow-sm)]"
              : "rounded-full px-4 py-2 hover:text-[color:var(--brand-strong)]"
          }
        >
          Tất cả ưu đãi
        </Link>
        <Link
          href="/cashback"
          aria-current={active === "cashback" ? "page" : undefined}
          className={
            active === "cashback"
              ? "rounded-full border border-[rgba(124,63,44,0.18)] bg-[rgba(255,250,246,0.86)] px-4 py-2 text-[color:var(--text)] shadow-[var(--shadow-sm)]"
              : "rounded-full px-4 py-2 hover:text-[color:var(--brand-strong)]"
          }
        >
          Hoàn tiền Shopee
        </Link>
      </nav>

      <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
        {isAuthenticated ? (
          <Link
            href="/app"
            className="rounded-full border border-[rgba(124,63,44,0.18)] bg-[rgba(255,250,246,0.86)] px-4 py-2 text-[color:var(--text)] shadow-[var(--shadow-sm)]"
          >
            Mở ví hoàn tiền
          </Link>
        ) : (
          <>
            <Link
              href="/login"
              className="rounded-full px-4 py-2 text-[color:var(--text-muted)] hover:text-[color:var(--brand-strong)]"
            >
              Đăng nhập
            </Link>
            <Link
              href="/register"
              className="rounded-full bg-[color:var(--brand)] px-4 py-2 text-white shadow-[var(--shadow-sm)] hover:bg-[color:var(--brand-strong)]"
            >
              Tạo tài khoản
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
