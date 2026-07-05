"use client";

import {
  useActionState,
  useId,
  useState,
} from "react";

import {
  previewShopeeCashbackQuoteAction,
} from "@/app/app/cashback/actions";
import ShopeeProductPreviewBadge from "@/features/cashback/ShopeeProductPreviewBadge";
import ShopeePurchaseTrigger from "@/features/cashback/ShopeePurchaseTrigger";
import ShopeeProductPreviewCard from "@/features/cashback/ShopeeProductPreviewCard";
import type {
  PreviewShopeeProductPreviewActionState,
} from "@/types/cashback";

type PreviewQuote = NonNullable<
  PreviewShopeeProductPreviewActionState["quote"]
>;

type PreviewRenderModel =
  | { kind: "pending" }
  | { kind: "card"; quote: PreviewQuote }
  | {
      kind: "purchase_allowed_fallback";
      canonicalProductUrl: string;
    }
  | { kind: "resolution_error"; message: string }
  | { kind: "empty" };

const PURCHASE_FALLBACK_LIVE_REGION_MESSAGE =
  "Chưa lấy được đầy đủ thông tin sản phẩm. Bạn vẫn có thể tiếp tục mua hàng; mức hoàn tiền chưa được đảm bảo.";

const initialActionState: PreviewShopeeProductPreviewActionState =
  {
    ok: false,
    message: "",
    state: "resolution_failed",
    errorCode: null,
    product: null,
    quote: null,
    canonicalProductUrl: null,
  };

function ShopeeCashbackPreviewPendingPanel() {
  return (
    <div className="mt-4 rounded-[var(--radius-xl)] border border-[rgba(124,63,44,0.12)] bg-[rgba(255,250,246,0.78)] px-5 py-6 shadow-[var(--shadow-sm)]">
      <div className="flex items-center gap-3">
        <span
          className="inline-block h-2 w-2 rounded-full bg-[color:var(--brand-strong)] motion-safe:animate-pulse"
          aria-hidden="true"
        />
        <p className="text-sm font-semibold text-[color:var(--text)]">
          Đang kiểm tra sản phẩm Shopee…
        </p>
      </div>

      <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
        Vaffiliate đang lấy ảnh, tên, giá và mức hoàn
        tiền dự kiến. Vui lòng đợi trong giây lát.
      </p>
    </div>
  );
}

export default function ShopeeCashbackPreviewForm({
  isAuthenticated = true,
}: {
  isAuthenticated?: boolean;
}) {
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

  const renderModel: PreviewRenderModel = (() => {
    if (isPreviewPending) {
      return { kind: "pending" };
    }

    if (
      resultMatchesCurrentUrl &&
      (actionState.state === "quote_available" ||
        actionState.state === "quote_unavailable") &&
      actionState.quote !== null
    ) {
      return { kind: "card", quote: actionState.quote };
    }

    if (
      resultMatchesCurrentUrl &&
      (actionState.state ===
        "metadata_incomplete_purchase_allowed" ||
        actionState.state ===
          "metadata_unavailable_purchase_allowed") &&
      typeof actionState.canonicalProductUrl ===
        "string" &&
      actionState.canonicalProductUrl.length > 0
    ) {
      return {
        kind: "purchase_allowed_fallback",
        canonicalProductUrl: actionState.canonicalProductUrl,
      };
    }

    if (
      resultMatchesCurrentUrl &&
      actionState.state === "resolution_failed"
    ) {
      return {
        kind: "resolution_error",
        message: actionState.message,
      };
    }

    return { kind: "empty" };
  })();

  const previewStatusMessage: string = (() => {
    switch (renderModel.kind) {
      case "pending":
        return "Đang kiểm tra sản phẩm Shopee.";
      case "card":
        return renderModel.quote.status === "available"
          ? "Đã có thông tin sản phẩm và mức hoàn tiền dự kiến."
          : "Đã có thông tin sản phẩm. Mức hoàn tiền chưa được xác định.";
      case "purchase_allowed_fallback":
        return PURCHASE_FALLBACK_LIVE_REGION_MESSAGE;
      case "resolution_error":
        return "";
      case "empty":
        return "";
    }
  })();

  return (
    <div>
      <form
        action={previewAction}
        className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.88)] p-5 shadow-[var(--shadow-sm)]"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--brand-strong)]">
            Shopee
          </p>

          <div className="mt-2">
            <ShopeeProductPreviewBadge label="Hoàn lại đến 60% hoa hồng Shopee" />
          </div>

          <h2 className="mt-2 text-lg font-semibold text-[color:var(--text)]">
            Kiểm tra hoàn tiền sản phẩm
          </h2>
        </div>

        <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
          Dán link sản phẩm Shopee để xem ảnh, giá
          và số tiền hoàn dự kiến trước khi mua hàng.
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
            Vaffiliate hỗ trợ link sản phẩm đầy đủ
            và link rút gọn s.shopee.vn.
          </p>
        </div>

        <button
          type="submit"
          disabled={
            isPreviewPending ||
            !currentUrl
          }
          aria-busy={isPreviewPending}
          className="mt-4 w-full rounded-[var(--radius-lg)] bg-[color:var(--brand)] px-4 py-3 text-sm font-semibold text-white shadow-[var(--shadow-sm)] transition disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPreviewPending
            ? "Đang kiểm tra sản phẩm..."
            : "Kiểm tra hoàn tiền"}
        </button>
      </form>

      <p
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {previewStatusMessage}
      </p>

      {(() => {
        switch (renderModel.kind) {
          case "pending":
            return <ShopeeCashbackPreviewPendingPanel />;

          case "card":
            return (
              <ShopeeProductPreviewCard
                key={
                  renderModel.quote.product.productUrl
                }
                quote={renderModel.quote}
                isAuthenticated={isAuthenticated}
              />
            );

          case "purchase_allowed_fallback":
            return (
              <div className="mt-4 overflow-hidden rounded-[var(--radius-xl)] border border-[rgba(124,63,44,0.15)] bg-[rgba(255,248,242,0.94)] shadow-[var(--shadow-sm)]">
                <div className="px-5 py-5">
                  <p className="text-sm font-semibold text-[color:var(--text)]">
                    Chưa lấy được thông tin sản phẩm từ Shopee.
                  </p>

                  <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
                    Mức hoàn tiền chưa được xác định. Hoàn tiền không được đảm bảo.
                  </p>
                </div>

                <div className="border-t border-[rgba(124,63,44,0.08)] px-5 pb-5">
                  <ShopeePurchaseTrigger
                    productUrl={
                      renderModel.canonicalProductUrl
                    }
                    variant="neutral"
                    isAuthenticated={isAuthenticated}
                  />
                </div>
              </div>
            );

          case "resolution_error":
            return (
              <div
                role="alert"
                aria-live="polite"
                className="mt-4 rounded-[var(--radius-xl)] border border-[rgba(190,92,54,0.18)] bg-[rgba(190,92,54,0.08)] px-5 py-4 text-sm font-medium leading-6 text-[color:var(--warning)]"
              >
                {renderModel.message}
              </div>
            );

          case "empty":
            return (
              <div className="mt-4 rounded-[var(--radius-xl)] border border-dashed border-[rgba(124,63,44,0.14)] bg-[rgba(255,250,246,0.68)] px-5 py-8 text-center">
                <p className="text-sm font-semibold text-[color:var(--text)]">
                  Chưa có thông tin sản phẩm
                </p>

                <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
                  Kết quả gồm ảnh, tên, giá và tiền
                  hoàn dự kiến sẽ xuất hiện tại đây.
                </p>
              </div>
            );
        }
      })()}
    </div>
  );
}
