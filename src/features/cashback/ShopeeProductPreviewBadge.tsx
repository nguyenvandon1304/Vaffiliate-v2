"use client";

import type { ReactNode } from "react";

interface ShopeeProductPreviewBadgeProps {
  /** Badge label. Caller-controlled so the badge is reusable for future promo copy. */
  label: string;
}

/**
 * Phase 20H.3d — Small uppercase tracking badge used by the
 * Shopee cashback preview form to call out the headline cashback
 * formula. Pure server-renderable. No client-supplied cashback
 * amount; the value is static copy.
 */
export default function ShopeeProductPreviewBadge({
  label,
}: ShopeeProductPreviewBadgeProps): ReactNode {
  return (
    <p
      className="inline-flex items-center gap-1 rounded-full border border-[rgba(216,138,82,0.35)] bg-[rgba(216,138,82,0.10)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--brand-strong)]"
      data-testid="shopee-product-preview-badge"
    >
      {label}
    </p>
  );
}