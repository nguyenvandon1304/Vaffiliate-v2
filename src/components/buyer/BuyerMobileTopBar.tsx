import Link from "next/link";

import BrandLogo from "@/components/shared/BrandLogo";

export type BuyerMobileTopBarProps = {
  /**
   * Vietnamese label for the page context (e.g. "Trang chủ",
   * "Ưu đãi", "Hoàn tiền", "Đơn hàng",
   * "Tài khoản"). When omitted, the bar shows no
   * context chip -- useful for the buyer home where the brand
   * identity is the only context a buyer needs.
   */
  readonly title?: string;
  /**
   * Override the destination of the brand logo link. Defaults
   * to `/app` because this top bar is intentionally scoped to
   * the buyer shell. Public surfaces use `PublicTopNav` instead.
   */
  readonly brandHref?: string;
  /**
   * Override the destination of the account shortcut. Defaults
   * to `/app/profile` -- the canonical buyer account surface.
   * The shortcut is rendered as a plain `<Link>` (real anchor,
   * not a clickable div) so keyboard focus / screen reader
   * semantics match the rest of the buyer shell.
   */
  readonly accountHref?: string;
};

/**
 * Phase 20I.8 -- buyer mobile top bar.
 *
 * A thin, mobile-first header that sits above the buyer route
 * content on viewports < 768px. It deliberately surfaces three
 * things and three things only:
 *
 *   - The Vaffiliate brand identity (home).
 *   - The current page context (a short Vietnamese label).
 *   - A persistent account shortcut that goes straight to the
 *     buyer profile surface.
 *
 * It does NOT show: full email, internal user id, role, role
 * label, auth provider id, or any token. There is no fake
 * "Đã cập nhật" sync indicator -- the prompt
 * forbids fake UI signals, and this bar is not the place to
 * invent one.
 */
export default function BuyerMobileTopBar({
  title,
  brandHref = "/app",
  accountHref = "/app/profile",
}: BuyerMobileTopBarProps) {
  return (
    <header
      data-testid="buyer-top-bar"
      className="sticky top-0 z-20 border-b border-[color:var(--line)] bg-[color:var(--background)]/92 px-4 pb-3 pt-3 backdrop-blur"
    >
      <div className="mx-auto flex max-w-[430px] items-center justify-between gap-3">
        <Link
          href={brandHref}
          aria-label="Vaffiliate - về trang chủ"
          className="inline-flex items-center"
        >
          <BrandLogo compact />
        </Link>

        <div className="flex flex-1 items-center justify-center text-center">
          {typeof title === "string" && title.trim().length > 0 ? (
            <p
              data-testid="buyer-top-bar-title"
              className="text-sm font-semibold tracking-[-0.02em] text-[color:var(--text)]"
            >
              {title}
            </p>
          ) : (
            <span className="sr-only">Về trang chủ</span>
          )}
        </div>

        <Link
          href={accountHref}
          data-testid="buyer-top-bar-account"
          aria-label="Mở hồ sơ và cài đặt tài khoản"
          className="inline-flex items-center gap-2 rounded-full border border-[color:var(--line)] bg-[rgba(255,250,246,0.92)] px-3 py-1.5 text-xs font-semibold text-[color:var(--text)] shadow-[var(--shadow-sm)] hover:border-[color:var(--brand-strong)] hover:text-[color:var(--brand-strong)]"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="8" r="5" />
            <path d="M20 21a8 8 0 0 0-16 0" />
          </svg>
          Tài khoản
        </Link>
      </div>
    </header>
  );
}
