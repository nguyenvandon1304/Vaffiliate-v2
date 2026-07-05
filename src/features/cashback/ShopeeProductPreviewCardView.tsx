import type { ReactNode } from "react";

import type {
  ShopeeProductPreviewAvailableQuote,
  ShopeeProductPreviewMetadataView,
  ShopeeProductPreviewUnavailableQuote,
} from "@/types/cashback";

/**
 * Phase 20H.3d -- pure presentational view for the Shopee product preview
 * card.
 *
 * Renders the discriminated
 * {@link ShopeeProductPreviewQuote} union through a stable, intent-only
 * layout. The component is intentionally server-renderable: it does NOT
 * import the server-side ShopeePurchaseTrigger, server actions,
 * repositories, services, or the database client. The production wrapper
 * (`ShopeeProductPreviewCard.tsx`) is responsible for composing the
 * `ctaSlot` and forwarding auth state to the trigger.
 *
 * The buyer-facing copy is pinned so the available/unavailable branches
 * never silently leak internal IDs, network-subid hashes, share-share
 * percentages from the wrong source, or a fabricated "60% of product
 * price" promise. All copy follows the Phase 20H.5 / 20H.3d rule that
 * the displayed cashback is computed from the Shopee commission, never
 * from the product price.
 */
export interface ShopeeProductPreviewCardViewProps {
  readonly quote:
    | ShopeeProductPreviewAvailableQuote
    | ShopeeProductPreviewUnavailableQuote;
  /**
   * Pre-composed purchase CTA. The wrapper supplies a ShopeePurchaseTrigger
   * (or a stub during unit tests) so the view can be rendered in
   * isolation without pulling server-only modules.
   */
  readonly ctaSlot: ReactNode;
}

/**
 * Vietnamese-dong decimal formatter. Produces the "19.380 đ" shape used
 * across the cashback preview: thousands grouped with `.`, no decimals,
 * with a trailing `đ` currency symbol. The function is integer-safe.
 */
function formatVndDecimal(amount: number): string {
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 0) {
    return String(amount);
  }
  const grouped = amount
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${grouped} đ`;
}

/**
 * Maps a cashbackShareBps value (basis points where 10000 == 100%) to a
 * buyer-facing whole-percent integer with no decimal component.
 */
function formatSharePercent(bps: number): string {
  if (!Number.isFinite(bps) || bps <= 0) {
    return "0";
  }
  const percent = bps / 100;
  return Number.isInteger(percent) ? percent.toString() : percent.toFixed(0);
}

function ShopeeProductPreviewCardProductHeader({
  product,
}: {
  readonly product: ShopeeProductPreviewMetadataView;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-[var(--radius-lg)] border border-[rgba(124,63,44,0.12)] bg-[rgba(255,250,246,0.85)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.imageUrl}
          alt=""
          data-testid="shopee-product-preview-image"
          className="h-full w-full object-cover"
        />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--brand-strong)]">
          Shopee
        </p>

        <h3
          className="mt-1 text-base font-semibold leading-6 text-[color:var(--text)]"
          data-testid="shopee-product-preview-name"
        >
          {product.productName}
        </h3>

        {product.shopName ? (
          <p className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
            {product.shopName}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ShopeeProductPreviewAvailableBody({
  quote,
}: {
  readonly quote: ShopeeProductPreviewAvailableQuote;
}) {
  const sharePercent = formatSharePercent(quote.cashbackShareBps);
  const estimateLabel = "Hoàn tiền dự kiến";
  const shareCopy =
    `Vaffiliate hoàn lại ${sharePercent}% hoa hồng Shopee`;
  const reconciliationCopy =
    "Số tiền hoàn lại được tính dựa vào hoa hồng Shopee xác nhận sau khi Shopee đối soát hoàn tất";

  return (
    <div
      data-testid="shopee-product-preview-available"
      className="mt-4 rounded-[var(--radius-lg)] border border-[rgba(124,63,44,0.18)] bg-[rgba(255,248,242,0.96)] p-4"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--brand-strong)]">
        {estimateLabel}
      </p>

      <p
        className="mt-2 text-2xl font-semibold leading-8 text-[color:var(--text)]"
        data-testid="shopee-product-preview-estimated-amount"
      >
        {formatVndDecimal(quote.estimatedCashbackVnd)}
      </p>

      <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
        {shareCopy}
      </p>

      <p
        className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]"
        data-testid="shopee-product-preview-reconciliation"
      >
        {reconciliationCopy}
      </p>
    </div>
  );
}

function ShopeeProductPreviewUnavailableBody({
  quote,
}: {
  readonly quote: ShopeeProductPreviewUnavailableQuote;
}) {
  const cashbackGuaranteeLine = "Hoàn tiền không được đảm bảo";

  return (
    <div
      data-testid="shopee-product-preview-unavailable"
      className="mt-4 rounded-[var(--radius-lg)] border border-[rgba(190,92,54,0.18)] bg-[rgba(190,92,54,0.06)] p-4"
    >
      <p className="text-sm font-semibold text-[color:var(--text)]">
        {quote.message}
      </p>

      <p
        className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]"
        data-testid="shopee-product-preview-cashback-not-guaranteed"
      >
        {cashbackGuaranteeLine}
      </p>
    </div>
  );
}

export default function ShopeeProductPreviewCardView({
  quote,
  ctaSlot,
}: ShopeeProductPreviewCardViewProps): ReactNode {
  const { product } = quote;

  return (
    <article
      data-testid="shopee-product-preview-card"
      className="mt-4 overflow-hidden rounded-[var(--radius-xl)] border border-[rgba(124,63,44,0.12)] bg-[rgba(255,252,249,0.94)] shadow-[var(--shadow-sm)]"
    >
      <div className="px-5 py-5">
        <ShopeeProductPreviewCardProductHeader product={product} />

        {quote.status === "available" ? (
          <ShopeeProductPreviewAvailableBody quote={quote} />
        ) : (
          <ShopeeProductPreviewUnavailableBody quote={quote} />
        )}

        <div className="mt-4 border-t border-[rgba(124,63,44,0.08)] pt-4">
          {ctaSlot}
        </div>
      </div>
    </article>
  );
}