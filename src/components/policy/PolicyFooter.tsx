import Link from "next/link";

/**
 * Phase 20I.6 -- minimal public site footer.
 *
 * Renders the four policy links that ship with Phase 20I.6 plus
 * the brand label. Mobile-first: stacks on small screens, single
 * row on wide screens. The footer does NOT include any internal
 * tokens, marketing promises, or copy that varies per page.
 *
 * The footer is intentionally a server component: it renders
 * inside the public policy page wrappers and never carries
 * state.
 */

export type PolicyFooterProps = {
  readonly variant?: "page" | "marketing";
};

const POLICY_LINKS: ReadonlyArray<{ readonly href: string; readonly label: string }> =
  [
    { href: "/privacy", label: "Quyền riêng tư" },
    { href: "/terms", label: "Điều khoản" },
    { href: "/cashback-terms", label: "Điều khoản hoàn tiền" },
    { href: "/data-deletion", label: "Xóa dữ liệu" },
  ];

export default function PolicyFooter({ variant = "page" }: PolicyFooterProps) {
  return (
    <footer
      className={
        variant === "marketing"
          ? "mt-10 border-t border-[color:var(--line)] pt-6"
          : "mt-12 border-t border-[color:var(--line)] pt-6"
      }
      aria-label="Liên kết chính sách"
    >
      <nav
        aria-label="Chính sách"
        className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[color:var(--text-muted)]"
      >
        {POLICY_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-full px-2 py-1 hover:text-[color:var(--brand-strong)]"
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <p className="mt-4 text-xs text-[color:var(--text-muted)]">
        Vaffiliate - nền tảng hoàn tiền cho mua sắm online.
      </p>
    </footer>
  );
}
