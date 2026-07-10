/**
 * Phase 20I.7 -- public site footer (policy-page variant).
 *
 * Backed by the unified `PublicFooter` so every public SEO route
 * renders the same nav links and brand mark. The policy variant
 * keeps the page chrome minimal (no product nav), matching what
 * policy pages looked like in Phase 20I.6.
 *
 * Note: marketing / deal / cashback pages should use
 * `<PublicFooter />` directly (or pass `productLinks` explicitly)
 * to surface the "Tất cả ưu đãi" and "Hoàn tiền Shopee" links.
 */

import PublicFooter, {
  PUBLIC_FOOTER_POLICY_LINKS,
} from "@/components/public/PublicFooter";

export type PolicyFooterProps = {
  readonly variant?: "page" | "marketing";
  readonly productLinks?: ReadonlyArray<{
    readonly href: string;
    readonly label: string;
  }>;
  readonly note?: string;
};

export default function PolicyFooter({
  variant = "page",
  productLinks,
  note,
}: PolicyFooterProps) {
  const resolvedProductLinks =
    variant === "marketing"
      ? productLinks ?? [
          { href: "/ma-giam-gia", label: "Tất cả ưu đãi" },
          { href: "/cashback", label: "Hoàn tiền Shopee" },
        ]
      : productLinks ?? [];
  return (
    <PublicFooter
      productLinks={resolvedProductLinks}
      note={note}
    />
  );
}

// Re-export the policy link list so existing tests / callers that
// import `POLICY_LINKS` from this module keep working.
export { PUBLIC_FOOTER_POLICY_LINKS as POLICY_LINKS };
