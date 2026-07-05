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
}

export default function ShopeeProductPreviewCard({
  quote,
  isAuthenticated = true,
}: ShopeeProductPreviewCardProps) {
  const product = quote.product;
  const ctaSlot = (
    <ShopeePurchaseTrigger
      productUrl={product.productUrl}
      variant={quote.status === "available" ? "prominent" : "neutral"}
      isAuthenticated={isAuthenticated}
    />
  );

  return <ShopeeProductPreviewCardView quote={quote} ctaSlot={ctaSlot} />;
}