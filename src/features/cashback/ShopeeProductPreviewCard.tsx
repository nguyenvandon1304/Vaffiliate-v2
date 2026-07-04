"use client";

import Image from "next/image";

import ShopeePurchaseTrigger from "@/features/cashback/ShopeePurchaseTrigger";
import type {
  ShopeeProductPreviewAvailableQuote,
  ShopeeProductPreviewMetadataView,
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

const QUOTE_UNAVAILABLE_REASON_MESSAGES: Readonly<
  Record<
    ShopeeProductPreviewUnavailableQuote["reason"],
    string
  >
> = {
  no_active_offer:
    "Hiện chưa có chương trình hoàn tiền Shopee đang hoạt động.",
  product_not_eligible:
    "Sản phẩm này không thuộc chương trình hoàn tiền Shopee hiện tại.",
  eligibility_unknown:
    "Chưa xác định được mức hoàn tiền cho sản phẩm này.",
  commission_rate_unavailable:
    "Chưa xác định được mức hoa hồng cho sản phẩm này.",
  cashback_policy_unavailable:
    "Chưa có chính sách hoàn tiền đang áp dụng cho sản phẩm này.",
};

function formatVnd(amount: number): string {
  return `${Math.round(amount).toLocaleString(
    "vi-VN",
  )} ₫`;
}

function formatPercent(value: number): string {
  return `${value.toLocaleString("vi-VN", {
    maximumFractionDigits: 2,
  })}%`;
}

function formatCalculatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function MetadataHeader({
  product,
}: {
  product: ShopeeProductPreviewMetadataView;
}) {
  return (
    <div className="grid gap-5 p-5 md:grid-cols-[160px_minmax(0,1fr)]">
      <div className="relative aspect-square overflow-hidden rounded-[var(--radius-lg)] border border-[rgba(124,63,44,0.1)] bg-white/80">
        <Image
          src={product.imageUrl}
          alt={product.productName}
          fill
          sizes="(min-width: 768px) 160px, 100vw"
          className="object-cover"
          unoptimized
        />
      </div>

      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--brand-strong)]">
          Shopee
        </p>

        <h3 className="mt-2 text-lg font-semibold leading-7 text-[color:var(--text)]">
          {product.productName}
        </h3>

        {product.shopName ? (
          <p className="mt-1 text-sm text-[color:var(--text-muted)]">
            Cửa hàng: {product.shopName}
          </p>
        ) : null}

        <div className="mt-4 rounded-[var(--radius-lg)] border border-[rgba(124,63,44,0.1)] bg-white/75 p-4">
          <p className="text-xs font-medium text-[color:var(--text-muted)]">
            Giá sản phẩm
          </p>

          <p className="mt-1 text-lg font-semibold text-[color:var(--text)]">
            {formatVnd(product.priceVnd)}
          </p>
        </div>
      </div>
    </div>
  );
}

function AvailableQuoteBody({
  quote,
  productUrl,
  isAuthenticated,
}: {
  quote: ShopeeProductPreviewAvailableQuote;
  productUrl: string;
  isAuthenticated: boolean;
}) {
  const cashbackPercent = formatPercent(
    quote.cashbackShareBps / 100,
  );

  return (
    <>
      <div className="px-5 pt-1">
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[rgba(216,138,82,0.22)] bg-[rgba(216,138,82,0.12)] px-5 py-5 shadow-[var(--shadow-sm)]">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--brand-strong)]">
            Hoàn tiền dự kiến
          </p>

          <p className="mt-3 text-2xl font-semibold leading-tight text-[color:var(--brand-strong)]">
            {formatVnd(quote.estimatedCashbackVnd)}
          </p>

          <p className="mt-2 text-sm leading-6 text-[color:var(--text)]">
            Vaffiliate hoàn lại {cashbackPercent} khoản
            hoa hồng đủ điều kiện theo chính sách
            hiện tại.
          </p>

          <p className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
            Tính đến {formatCalculatedAt(
              quote.calculatedAt,
            )}
          </p>
        </div>
      </div>

      <div className="px-5 pb-5 pt-4">
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[rgba(124,63,44,0.16)] bg-[rgba(255,250,246,0.6)] px-4 py-3">
          <p className="text-sm font-medium leading-6 text-[color:var(--text)]">
            Mua hàng nhận hoàn tiền sẽ được kích hoạt ở bước tiếp theo.
          </p>
          <ShopeePurchaseTrigger
            productUrl={productUrl}
            variant="prominent"
            isAuthenticated={isAuthenticated}
          />
        </div>
      </div>

      <p className="border-t border-[rgba(124,63,44,0.09)] bg-[rgba(255,250,246,0.82)] px-5 py-3 text-xs leading-5 text-[color:var(--text-muted)]">
        Số tiền hoàn trên chỉ là ước tính dựa trên
        giá công khai và chính sách hoàn tiền đang
        áp dụng tại{" "}
        {formatCalculatedAt(quote.calculatedAt)}. Tiền
        hoàn thực tế được xác định theo hoa hồng
        Shopee phê duyệt sau khi đơn hàng hoàn tất.
      </p>
    </>
  );
}

function UnavailableQuoteBody({
  quote,
  productUrl,
  isAuthenticated,
}: {
  quote: ShopeeProductPreviewUnavailableQuote;
  productUrl: string;
  isAuthenticated: boolean;
}) {
  return (
    <>
      <div className="px-5 pb-5 pt-1">
        <div className="rounded-[var(--radius-lg)] border border-[rgba(124,63,44,0.16)] bg-[rgba(255,250,246,0.78)] px-4 py-3">
          <p className="text-sm font-medium leading-6 text-[color:var(--text)]">
            {quote.message}
          </p>

          <p className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
            {
              QUOTE_UNAVAILABLE_REASON_MESSAGES[
                quote.reason
              ]
            }
          </p>
        </div>

        <div className="mt-4 rounded-[var(--radius-lg)] border border-dashed border-[rgba(124,63,44,0.16)] bg-[rgba(255,250,246,0.6)] px-4 py-3">
          <p className="text-sm font-medium leading-6 text-[color:var(--text)]">
            Mức hoàn tiền chưa được xác định cho sản phẩm này.
            Hoàn tiền không được đảm bảo.
          </p>
          <ShopeePurchaseTrigger
            productUrl={productUrl}
            variant="neutral"
            isAuthenticated={isAuthenticated}
          />
        </div>
      </div>

      <p className="border-t border-[rgba(124,63,44,0.09)] bg-[rgba(255,250,246,0.82)] px-5 py-3 text-xs leading-5 text-[color:var(--text-muted)]">
        Vaffiliate đã nhận diện sản phẩm nhưng chưa
        thể xác định mức hoàn tiền. Số tiền hoàn sẽ
        chỉ hiển thị khi chương trình hoàn tiền áp
        dụng cho sản phẩm này được xác nhận rõ ràng.
        Hoàn tiền không được đảm bảo.
      </p>
    </>
  );
}

export default function ShopeeProductPreviewCard({
  quote,
  isAuthenticated = true,
}: ShopeeProductPreviewCardProps) {
  const product = quote.product;

  return (
    <section className="mt-4 overflow-hidden rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,248,242,0.94)] shadow-[var(--shadow-sm)]">
      <MetadataHeader product={product} />

      {quote.status === "available" ? (
        <AvailableQuoteBody
          quote={quote}
          productUrl={product.productUrl}
          isAuthenticated={isAuthenticated}
        />
      ) : (
        <UnavailableQuoteBody
          quote={quote}
          productUrl={product.productUrl}
          isAuthenticated={isAuthenticated}
        />
      )}
    </section>
  );
}
