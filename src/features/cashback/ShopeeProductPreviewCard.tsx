"use client";

import ShopeeProductPreviewCardView from "@/features/cashback/ShopeeProductPreviewCardView";
import ShopeePurchaseTrigger from "@/features/cashback/ShopeePurchaseTrigger";
import type {
  ShopeeProductPreviewAvailableQuote,
  ShopeeProductPreviewUnavailableQuote,
} from "@/types/cashback";

interface ShopeeProductPreviewCardProps {
  quote:
    | ShopeeProductPreviewAvailableQuote
    | ShopeeProductPreviewUnavailableQuote;
  /**
   * Whether the user has an authenticated Supabase session. Forwarded
   * to `ShopeePurchaseTrigger` so the buy CTA is gated on login.
   */
  isAuthenticated?: boolean;
  /**
   * Optional same-origin path used as the logged-out CTA's login
   * link target. Phase 20H.4a passes `/login?next=/cashback?productUrl=...`
   * so a buyer who clicks the trigger while logged out lands back on
   * the same preview after signing in. Falls back to `/login` when
   * not provided.
   */
  loginHref?: string;
}

export default function ShopeeProductPreviewCard({
  quote,
  isAuthenticated = true,
  loginHref,
}: ShopeeProductPreviewCardProps) {
  const product = quote.product;
  const ctaSlot = (
    <ShopeePurchaseTrigger
      productUrl={product.productUrl}
      variant={quote.status === "available" ? "prominent" : "neutral"}
      isAuthenticated={isAuthenticated}
      loginHref={loginHref}
    />
  );

  return <ShopeeProductPreviewCardView quote={quote} ctaSlot={ctaSlot} />;
}
