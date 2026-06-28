import Image from "next/image";

import type {
  ShopeeProductPreview,
} from "@/types/cashback";

interface ShopeeProductPreviewCardProps {
  preview: ShopeeProductPreview;
}

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

export default function ShopeeProductPreviewCard({
  preview,
}: ShopeeProductPreviewCardProps) {
  return (
    <section className="mt-4 overflow-hidden rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,248,242,0.94)] shadow-[var(--shadow-sm)]">
      <div className="grid gap-5 p-5 md:grid-cols-[160px_minmax(0,1fr)]">
        <div className="relative aspect-square overflow-hidden rounded-[var(--radius-lg)] border border-[rgba(124,63,44,0.1)] bg-white/80">
          {preview.imageUrl ? (
            <Image
              src={preview.imageUrl}
              alt={preview.productName}
              fill
              sizes="(min-width: 768px) 160px, 100vw"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-4 text-center text-sm text-[color:var(--text-muted)]">
              Chưa có ảnh sản phẩm
            </div>
          )}
        </div>

        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--brand-strong)]">
            Shopee
          </p>

          <h3 className="mt-2 text-lg font-semibold leading-7 text-[color:var(--text)]">
            {preview.productName}
          </h3>

          {preview.shopName ? (
            <p className="mt-1 text-sm text-[color:var(--text-muted)]">
              Cửa hàng: {preview.shopName}
            </p>
          ) : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[var(--radius-lg)] border border-[rgba(124,63,44,0.1)] bg-white/75 p-4">
              <p className="text-xs font-medium text-[color:var(--text-muted)]">
                Giá sản phẩm
              </p>

              <p className="mt-1 text-lg font-semibold text-[color:var(--text)]">
                {formatVnd(preview.priceVnd)}
              </p>
            </div>

            <div className="rounded-[var(--radius-lg)] border border-[rgba(216,138,82,0.22)] bg-[rgba(216,138,82,0.12)] p-4">
              <p className="text-xs font-medium text-[color:var(--brand-strong)]">
                Hoàn tiền dự kiến
              </p>

              <p className="mt-1 text-xl font-semibold text-[color:var(--brand-strong)]">
                {formatVnd(
                  preview.estimatedCashbackVnd,
                )}
              </p>

              <p className="mt-1 text-xs text-[color:var(--text-muted)]">
                Khoảng{" "}
                {formatPercent(
                  preview.estimatedCashbackRatePercent,
                )}{" "}
                giá sản phẩm
              </p>
            </div>
          </div>

          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-3">
              <dt className="text-[color:var(--text-muted)]">
                Hoa hồng dự kiến
              </dt>

              <dd className="font-semibold text-[color:var(--text)]">
                {formatVnd(
                  preview.estimatedCommissionVnd,
                )}
              </dd>
            </div>

            <div className="flex justify-between gap-3">
              <dt className="text-[color:var(--text-muted)]">
                Phần hoàn cho bạn
              </dt>

              <dd className="font-semibold text-[color:var(--text)]">
                {formatPercent(
                  preview.cashbackShareBps / 100,
                )}
              </dd>
            </div>

            {preview.rating !== null ? (
              <div className="flex justify-between gap-3">
                <dt className="text-[color:var(--text-muted)]">
                  Đánh giá
                </dt>

                <dd className="font-semibold text-[color:var(--text)]">
                  {preview.rating.toLocaleString(
                    "vi-VN",
                  )}
                </dd>
              </div>
            ) : null}

            {preview.sales !== null ? (
              <div className="flex justify-between gap-3">
                <dt className="text-[color:var(--text-muted)]">
                  Đã bán
                </dt>

                <dd className="font-semibold text-[color:var(--text)]">
                  {preview.sales.toLocaleString(
                    "vi-VN",
                  )}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>

      <p className="border-t border-[rgba(124,63,44,0.09)] bg-[rgba(255,250,246,0.82)] px-5 py-3 text-xs leading-5 text-[color:var(--text-muted)]">
        Số tiền hoàn trên chỉ là ước tính. Tiền
        hoàn thực tế được xác định theo hoa hồng
        Shopee phê duyệt sau khi đơn hàng hoàn tất.
      </p>
    </section>
  );
}