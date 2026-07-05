import type { ReactNode } from "react";

import type {
  ShopeeProductPreviewAvailableQuote,
  ShopeeProductPreviewMetadataView,
  ShopeeProductPreviewUnavailableQuote,
} from "@/types/cashback";

/**
 * Phase 20H.3g -- pure presentational view for the Shopee product preview
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
 * Buyer-facing copy is pinned so the available/unavailable branches
 * never silently leak internal IDs, network-subid hashes, share-share
 * percentages from the wrong source, or a fabricated "60% of product
 * price" promise. All copy follows the Phase 20H.5 / 20H.3d rule that
 * the displayed cashback is computed from the Shopee commission, never
 * from the product price.
 *
 * Hierarchy (matches the Vaffiliate UX brief):
 *
 *   1. Product image
 *   2. Product title
 *   3. Shop name (when available)
 *   4. Price row -- "Giá tham khảo từ Shopee" + formatted VND
 *   5. Cashback box -- "Hoàn tiền dự kiến" + cashback amount +
 *      "Vaffiliate hoàn lại X% hoa hồng Shopee" +
 *      reconciliation note.
 *   6. CTA slot (composed by the wrapper).
 *
 * The cashback amount remains the strongest financial number on the
 * card so the buyer's primary scan path is "how much do I get back?".
 * The product price is visually secondary but always easy to compare
 * via the dedicated price row above the cashback box.
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
 * with a trailing `đ` currency symbol. Integer-safe.
 *
 * Returns `null` when the value is missing or unsafe so the caller can
 * decide whether to omit the row entirely. NEVER emits "0 đ",
 * "undefined", or "NaN" -- those would mislead the buyer.
 */
function formatVndDecimal(amount: number): string | null {
  if (
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    !Number.isInteger(amount) ||
    !Number.isSafeInteger(amount) ||
    amount <= 0
  ) {
    return null;
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

/**
 * Vietnamese thousands-grouped integer formatter used for sales-count
 * labels. Same grouping rule as the VND formatter but without the
 * currency suffix so the badge can render plain digits.
 *
 * Returns `null` when the value is missing or unsafe so the badge can
 * be omitted instead of leaking "undefined" / "NaN".
 */
function formatSoldCount(sales: number | null | undefined): string | null {
  if (
    typeof sales !== "number" ||
    !Number.isFinite(sales) ||
    !Number.isInteger(sales) ||
    !Number.isSafeInteger(sales) ||
    sales <= 0
  ) {
    return null;
  }
  return sales
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
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
          <p
            className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]"
            data-testid="shopee-product-preview-shop"
          >
            {product.shopName}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Renders the optional "Đã bán ..." badge near the price/title.
 *
 * Phase 20H.3g brief: "If normalized metadata already has sales/sold
 * count, show a small subtle badge like 'Đã bán ...' near the price/title.
 * Do not add new API calls only for sold count in this correction pass.
 * If sold count is unavailable, omit it."
 *
 * The metadata view does not currently carry a `salesCount`, so the
 * badge is intentionally omitted in production until the metadata layer
 * surfaces the field. When the field becomes available the badge
 * renders automatically.
 */
function ShopeeProductPreviewSoldBadge({
  sales,
}: {
  readonly sales: ShopeeProductPreviewMetadataView["salesCount"];
}) {
  const formatted = formatSoldCount(sales);
  if (formatted === null) {
    return null;
  }
  return (
    <span
      data-testid="shopee-product-preview-sold-badge"
      className="inline-flex items-center rounded-full border border-[rgba(124,63,44,0.14)] bg-[rgba(255,250,246,0.7)] px-2.5 py-0.5 text-[11px] font-medium text-[color:var(--text-muted)]"
    >
      Đã bán {formatted}
    </span>
  );
}

/**
 * Phase 20H.3g -- dedicated price row.
 *
 * Renders the label "Giá tham khảo từ Shopee" and the formatted VND
 * amount. When the product price is missing, invalid, or zero, the
 * row is omitted entirely -- NEVER emit "0 đ", "undefined", or "NaN"
 * in the buyer UI.
 *
 * The price is visually secondary to the cashback amount via a smaller
 * type size and the muted text color, but it stays scannable because
 * it sits in its own clearly-labelled row above the cashback box.
 */
function ShopeeProductPreviewPriceRow({
  priceVnd,
  sales,
}: {
  readonly priceVnd: number;
  readonly sales: ShopeeProductPreviewMetadataView["salesCount"];
}) {
  const formatted = formatVndDecimal(priceVnd);
  if (formatted === null) {
    return null;
  }
  return (
    <div
      data-testid="shopee-product-preview-price-row"
      className="mt-4 flex items-center justify-between gap-3"
    >
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
          Giá tham khảo từ Shopee
        </p>
        <p
          className="mt-1 text-base font-medium leading-6 text-[color:var(--text-muted)]"
          data-testid="shopee-product-preview-price-value"
        >
          {formatted}
        </p>
      </div>
      <ShopeeProductPreviewSoldBadge sales={sales} />
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
  const formattedCashback = formatVndDecimal(quote.estimatedCashbackVnd);

  // The cashback amount is the strongest financial number on the card.
  // Guard against an unavailable or invalid amount -- if the
  // authoritative upstream value is missing we surface the safe
  // unavailable copy instead of rendering a fabricated figure.
  if (formattedCashback === null) {
    return (
      <div
        data-testid="shopee-product-preview-unavailable"
        className="mt-4 rounded-[var(--radius-lg)] border border-[rgba(190,92,54,0.18)] bg-[rgba(190,92,54,0.06)] p-4"
      >
        <p className="text-sm font-semibold text-[color:var(--text)]">
          Đã nhận diện sản phẩm nhưng chưa thể xác định mức hoàn tiền.
        </p>
        <p
          className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]"
          data-testid="shopee-product-preview-cashback-not-guaranteed"
        >
          Hoàn tiền không được đảm bảo
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="shopee-product-preview-available"
      className="mt-3 rounded-[var(--radius-lg)] border border-[rgba(124,63,44,0.18)] bg-[rgba(255,248,242,0.96)] p-4"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--brand-strong)]">
        {estimateLabel}
      </p>

      <p
        className="mt-2 text-3xl font-semibold leading-[2rem] tracking-[-0.02em] text-[color:var(--text)]"
        data-testid="shopee-product-preview-estimated-amount"
      >
        {formattedCashback}
      </p>

      <p
        className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]"
        data-testid="shopee-product-preview-share-copy"
      >
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
      className="mt-3 rounded-[var(--radius-lg)] border border-[rgba(190,92,54,0.18)] bg-[rgba(190,92,54,0.06)] p-4"
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

        <ShopeeProductPreviewPriceRow
          priceVnd={product.priceVnd}
          sales={product.salesCount}
        />

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
