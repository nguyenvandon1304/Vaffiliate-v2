import Link from "next/link";

/**
 * Phase 20I.7 -- unified public footer.
 *
 * Replaces the smaller Phase 20I.6 `PolicyFooter` with a single
 * footer shared by every public SEO route (`/`, `/ma-giam-gia`,
 * `/ma-giam-gia/[platform]`, `/cashback`, `/privacy`, `/terms`,
 * `/cashback-terms`, `/data-deletion`). The footer is purely a
 * presentation component with no state.
 *
 * Mobile-first:
 *
 *   - The policy link nav wraps on small screens and stays a
 *     single row on `sm:` and up. Each link has at least a 40px
 *     tap target.
 *   - The footer never includes admin or `/app` links.
 *
 * Copy rules:
 *
 *   - No guarantees about ranking, Google, store approval,
 *     cashback amount, etc. The "bản nền" disclaimer is
 *     included in the foundation note when used on policy pages,
 *     not duplicated in the footer itself.
 *
 * Server component. Zero client JS shipped.
 */

export type PublicFooterLink = {
  readonly href: string;
  readonly label: string;
};

export type PublicFooterProps = {
  /**
   * Optional product / discovery links shown ABOVE the policy
   * links. The brief asks for "Tất cả ưu đãi" and "Hoàn tiền
   * Shopee". Pages can opt out by leaving the default empty
   * (policy pages prefer the minimal style).
   */
  readonly productLinks?: ReadonlyArray<PublicFooterLink>;
  /**
   * Optional callout text under the links. Defaults to the
   * neutral brand line.
   */
  readonly note?: string;
};

const POLICY_LINKS: ReadonlyArray<PublicFooterLink> = [
  { href: "/privacy", label: "Quyền riêng tư" },
  { href: "/terms", label: "Điều khoản" },
  { href: "/cashback-terms", label: "Điều khoản hoàn tiền" },
  { href: "/data-deletion", label: "Xóa dữ liệu" },
];

const DEFAULT_PRODUCT_LINKS: ReadonlyArray<PublicFooterLink> = [
  { href: "/ma-giam-gia", label: "Tất cả ưu đãi" },
  { href: "/cashback", label: "Hoàn tiền Shopee" },
];

export default function PublicFooter({
  productLinks,
  note,
}: PublicFooterProps) {
  const product = productLinks ?? DEFAULT_PRODUCT_LINKS;
  const hasProduct = product.length > 0;
  const resolvedNote =
    note ??
    "Vaffiliate - nền tảng hoàn tiền cho mua sắm online.";

  return (
    <footer
      className="mt-12 border-t border-[color:var(--line)] pt-6"
      aria-label="Liên kết chính sách và công cụ"
    >
      {hasProduct ? (
        <nav
          aria-label="Khám phá"
          className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium text-[color:var(--text-muted)]"
        >
          {product.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-2 py-2 hover:text-[color:var(--brand-strong)]"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      ) : null}

      <nav
        aria-label="Chính sách"
        className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[color:var(--text-muted)]"
      >
        {POLICY_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-full px-2 py-2 hover:text-[color:var(--brand-strong)]"
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <p className="mt-4 text-xs leading-6 text-[color:var(--text-muted)]">
        {resolvedNote}
      </p>
    </footer>
  );
}

export { POLICY_LINKS as PUBLIC_FOOTER_POLICY_LINKS };
