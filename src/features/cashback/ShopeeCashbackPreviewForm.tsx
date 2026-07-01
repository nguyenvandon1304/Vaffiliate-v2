"use client";

import {
  useActionState,
  useId,
  useState,
} from "react";

import {
  previewShopeeCashbackQuoteAction,
} from "@/app/app/cashback/actions";
import ShopeeProductPreviewCard from "@/features/cashback/ShopeeProductPreviewCard";
import type {
  PreviewShopeeProductPreviewActionState,
} from "@/types/cashback";

const initialActionState: PreviewShopeeProductPreviewActionState =
  {
    ok: false,
    message: "",
    state: "resolution_failed",
    errorCode: null,
    product: null,
    quote: null,
  };

export default function ShopeeCashbackPreviewForm() {
  const productUrlInputId = useId();
  const [productUrl, setProductUrl] =
    useState("");

  const [
    lastSubmittedUrl,
    setLastSubmittedUrl,
  ] = useState("");

  const [
    actionState,
    previewAction,
    isPreviewPending,
  ] = useActionState(
    async (
      previousState:
        PreviewShopeeProductPreviewActionState,
      formData: FormData,
    ): Promise<PreviewShopeeProductPreviewActionState> => {
      const submittedValue =
        formData.get("productUrl");

      const submittedUrl =
        typeof submittedValue === "string"
          ? submittedValue.trim()
          : "";

      setLastSubmittedUrl(submittedUrl);

      return previewShopeeCashbackQuoteAction(
        previousState,
        formData,
      );
    },
    initialActionState,
  );

  const currentUrl = productUrl.trim();

  const resultMatchesCurrentUrl =
    Boolean(currentUrl) &&
    lastSubmittedUrl === currentUrl;

  const visibleProduct =
    resultMatchesCurrentUrl &&
    actionState.product !== null
      ? actionState.product
      : null;

  const visibleQuote =
    resultMatchesCurrentUrl && actionState.quote !== null
      ? actionState.quote
      : null;

  const showResolutionError =
    resultMatchesCurrentUrl &&
    actionState.state === "resolution_failed";

  return (
    <div>
      <form
        action={previewAction}
        className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.88)] p-5 shadow-[var(--shadow-sm)]"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--brand-strong)]">
              Shopee
            </p>

            <h2 className="mt-2 text-lg font-semibold text-[color:var(--text)]">
              Kiểm tra hoàn tiền sản phẩm
            </h2>
          </div>

          <span className="rounded-full border border-[rgba(216,138,82,0.2)] bg-[rgba(216,138,82,0.12)] px-3 py-1 text-xs font-semibold text-[color:var(--brand-strong)]">
            Hoàn 60% hoa hồng
          </span>
        </div>

        <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
          Dán link sản phẩm Shopee để xem ảnh,
          giá và số tiền hoàn dự kiến trước khi
          mua hàng.
        </p>

        <div className="mt-4">
          <label
            htmlFor={productUrlInputId}
            className="mb-2 block text-sm font-semibold text-[color:var(--text)]"
          >
            Link sản phẩm Shopee
          </label>

          <input
            id={productUrlInputId}
            name="productUrl"
            type="url"
            value={productUrl}
            required
            disabled={isPreviewPending}
            autoComplete="off"
            inputMode="url"
            placeholder="https://shopee.vn/... hoặc https://s.shopee.vn/..."
            onChange={(event) => {
              setProductUrl(
                event.target.value,
              );
            }}
            className="w-full rounded-[var(--radius-lg)] border border-[rgba(124,63,44,0.14)] bg-white/90 px-4 py-3 text-sm text-[color:var(--text)] outline-none transition focus:border-[color:var(--brand)] disabled:cursor-not-allowed disabled:opacity-60"
          />

          <p className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
            Vaffiliate hỗ trợ link sản phẩm đầy
            đủ và link rút gọn s.shopee.vn.
          </p>
        </div>

        <button
          type="submit"
          disabled={
            isPreviewPending ||
            !currentUrl
          }
          className="mt-4 w-full rounded-[var(--radius-lg)] bg-[color:var(--brand)] px-4 py-3 text-sm font-semibold text-white shadow-[var(--shadow-sm)] transition disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPreviewPending
            ? "Đang kiểm tra sản phẩm..."
            : "Kiểm tra hoàn tiền"}
        </button>

        {showResolutionError && actionState.message ? (
          <p
            role="alert"
            aria-live="polite"
            className="mt-3 rounded-[var(--radius-lg)] border border-[rgba(190,92,54,0.18)] bg-[rgba(190,92,54,0.08)] px-4 py-3 text-sm font-medium leading-6 text-[color:var(--warning)]"
          >
            {actionState.message}
          </p>
        ) : null}
      </form>

      {visibleProduct && visibleQuote ? (
        <ShopeeProductPreviewCard
          key={visibleProduct.productUrl}
          quote={visibleQuote}
        />
      ) : (
        <div className="mt-4 rounded-[var(--radius-xl)] border border-dashed border-[rgba(124,63,44,0.14)] bg-[rgba(255,250,246,0.68)] px-5 py-8 text-center">
          <p className="text-sm font-semibold text-[color:var(--text)]">
            Chưa có thông tin sản phẩm
          </p>

          <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
            Kết quả gồm ảnh, tên, giá và tiền
            hoàn dự kiến sẽ xuất hiện tại đây.
          </p>
        </div>
      )}

      <p className="mt-4 rounded-[var(--radius-lg)] border border-[rgba(124,63,44,0.08)] bg-[rgba(255,250,246,0.72)] px-4 py-3 text-xs leading-5 text-[color:var(--text-muted)] shadow-[var(--shadow-sm)]">
        Mua hàng nhận hoàn tiền sẽ được kích hoạt ở
        bước tiếp theo. Trong giai đoạn hiện tại,
        Vaffiliate hiển thị thông tin sản phẩm ngay cả
        khi chưa xác định được mức hoàn tiền.
        Số tiền hoàn chỉ hiển thị khi chương trình
        hoàn tiền đang áp dụng cho sản phẩm được xác
        định rõ ràng.
      </p>
    </div>
  );
}
