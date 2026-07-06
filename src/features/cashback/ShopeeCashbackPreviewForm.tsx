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
  "Ch\u01b0a l\u1ea5y \u0111\u01b0\u1ee3c \u0111\u1ea7y \u0111\u1ee7 th\u00f4ng tin s\u1ea3n ph\u1ea9m. B\u1ea1n v\u1eabn c\u00f3 th\u1ec3 ti\u1ebfp t\u1ee5c mua h\u00e0ng; m\u1ee9c ho\u00e0n ti\u1ec1n ch\u01b0a \u0111\u01b0\u1ee3c \u0111\u1ea3m b\u1ea3o.";

const PREVIEW_FORM_TITLE = "Ki\u1ec3m tra ho\u00e0n ti\u1ec1n s\u1ea3n ph\u1ea9m";

const PREVIEW_FORM_DESCRIPTION =
  "D\u00e1n link s\u1ea3n ph\u1ea9m Shopee \u0111\u1ec3 xem \u1ea3nh, gi\u00e1 v\u00e0 s\u1ed1 ti\u1ec1n ho\u00e0n d\u1ef1 ki\u1ebfn tr\u01b0\u1edbc khi mua h\u00e0ng qua Vaffiliate.";

const PREVIEW_INPUT_LABEL = "Link s\u1ea3n ph\u1ea9m Shopee";

const PREVIEW_INPUT_PLACEHOLDER =
  "https://shopee.vn/... ho\u1eb7c https://s.shopee.vn/...";

const PREVIEW_INPUT_HELPER =
  "Vaffiliate h\u1ed7 tr\u1ee3 link s\u1ea3n ph\u1ea9m \u0111\u1ea7y \u0111\u1ee7 v\u00e0 link r\u00fat g\u1ecdn s.shopee.vn.";

const PREVIEW_PENDING_HEADING = "\u0110ang ki\u1ec3m tra s\u1ea3n ph\u1ea9m Shopee.";

const PREVIEW_PENDING_BODY =
  "Vaffiliate \u0111ang l\u1ea5y \u1ea3nh, t\u00ean, gi\u00e1 v\u00e0 m\u1ee9c ho\u00e0n ti\u1ec1n d\u1ef1 ki\u1ebfn. Vui l\u00f2ng \u0111\u1ee3i trong gi\u00e2y l\u00e1t.";

const PREVIEW_SUBMIT_IDLE = "Ki\u1ec3m tra ho\u00e0n ti\u1ec1n";

const PREVIEW_SUBMIT_PENDING = "\u0110ang ki\u1ec3m tra s\u1ea3n ph\u1ea9m...";

const PREVIEW_EMPTY_HEADING =
  "D\u00e1n link Shopee \u0111\u1ec3 xem ho\u00e0n ti\u1ec1n d\u1ef1 ki\u1ebfn";

const PREVIEW_EMPTY_BODY =
  "K\u1ebft qu\u1ea3 g\u1ed3m \u1ea3nh, t\u00ean, gi\u00e1 v\u00e0 s\u1ed1 ti\u1ec1n ho\u00e0n d\u1ef1 ki\u1ebfn s\u1ebd xu\u1ea5t hi\u1ec7n ngay t\u1ea1i \u0111\u00e2y khi b\u1ea1n d\u00e1n link.";

const PREVIEW_EMPTY_HINT =
  "Kh\u00f4ng c\u1ea7n \u0111\u0103ng nh\u1eadp \u0111\u1ec3 xem tr\u01b0\u1edbc. Ho\u00e0n ti\u1ec1n ch\u1ec9 ghi nh\u1eadn khi b\u1ea1n mua qua link ho\u00e0n ti\u1ec1n c\u1ee7a Vaffiliate.";

const PREVIEW_FALLBACK_HEADING =
  "Ch\u01b0a l\u1ea5y \u0111\u01b0\u1ee3c th\u00f4ng tin s\u1ea3n ph\u1ea9m t\u1eeb Shopee.";

const PREVIEW_FALLBACK_BODY =
  "M\u1ee9c ho\u00e0n ti\u1ec1n ch\u01b0a \u0111\u01b0\u1ee3c x\u00e1c \u0111\u1ecbnh. Ho\u00e0n ti\u1ec1n kh\u00f4ng \u0111\u01b0\u1ee3c \u0111\u1ea3m b\u1ea3o.";

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
    <div
      data-testid="shopee-cashback-preview-pending"
      className="mt-4 rounded-[var(--radius-xl)] border border-[rgba(124,63,44,0.12)] bg-[rgba(255,250,246,0.78)] px-5 py-6 shadow-[var(--shadow-sm)]"
    >
      <div className="flex items-center gap-3">
        <span
          className="inline-block h-2 w-2 rounded-full bg-[color:var(--brand-strong)] motion-safe:animate-pulse"
          aria-hidden="true"
        />
        <p className="text-sm font-semibold text-[color:var(--text)]">
          {PREVIEW_PENDING_HEADING}
        </p>
      </div>

      <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
        {PREVIEW_PENDING_BODY}
      </p>
    </div>
  );
}

export default function ShopeeCashbackPreviewForm({
  isAuthenticated = true,
  initialProductUrl,
  loginHref,
}: {
  isAuthenticated?: boolean;
  /**
   * Optional pre-fill value for the Shopee link input. Phase 20H.4a
   * wires this from `?productUrl=` on the public `/cashback` route
   * so a buyer who clicked a tracked link or arrived via the auth
   * handoff continues with the same product already typed in.
   *
   * The value is intentionally NOT auto-submitted: the form must
   * still require an explicit preview action because that is the
   * boundary that writes intent/audit snapshots and triggers
   * provider calls. Pre-filling only shortens the typing step.
   */
  initialProductUrl?: string;
  /**
   * Same-origin path forwarded to the preview card and fallback
   * trigger as the logged-out login link. Phase 20H.4a passes
   * `/login?next=/cashback?productUrl=...` so the buyer returns to
   * the same preview after signing in. Optional; falls back to the
   * internal default (`/login`) when not provided.
   */
  loginHref?: string;
}) {
  const productUrlInputId = useId();
  const [productUrl, setProductUrl] =
    useState(initialProductUrl ?? "");

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
        return PREVIEW_PENDING_HEADING;
      case "card":
        return renderModel.quote.status === "available"
          ? "B\u1ea1n \u0111\u00e3 c\u00f3 th\u00f4ng tin s\u1ea3n ph\u1ea9m v\u00e0 m\u1ee9c ho\u00e0n ti\u1ec1n d\u1ef1 ki\u1ebfn."
          : "B\u1ea1n \u0111\u00e3 c\u00f3 th\u00f4ng tin s\u1ea3n ph\u1ea9m. M\u1ee9c ho\u00e0n ti\u1ec1n ch\u01b0a \u0111\u01b0\u1ee3c x\u00e1c \u0111\u1ecbnh.";
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
        aria-busy={isPreviewPending}
        data-testid="shopee-cashback-preview-form"
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
            {PREVIEW_FORM_TITLE}
          </h2>
        </div>

        <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
          {PREVIEW_FORM_DESCRIPTION}
        </p>

        <div className="mt-4">
          <label
            htmlFor={productUrlInputId}
            className="mb-2 block text-sm font-semibold text-[color:var(--text)]"
          >
            {PREVIEW_INPUT_LABEL}
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
            placeholder={PREVIEW_INPUT_PLACEHOLDER}
            onChange={(event) => {
              setProductUrl(
                event.target.value,
              );
            }}
            className="w-full rounded-[var(--radius-lg)] border border-[rgba(124,63,44,0.14)] bg-white/90 px-4 py-3 text-sm text-[color:var(--text)] outline-none transition focus:border-[color:var(--brand)] disabled:cursor-not-allowed disabled:opacity-60"
          />

          <p className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
            {PREVIEW_INPUT_HELPER}
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
            ? PREVIEW_SUBMIT_PENDING
            : PREVIEW_SUBMIT_IDLE}
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
                loginHref={loginHref}
              />
            );

          case "purchase_allowed_fallback":
            return (
              <div
                data-testid="shopee-cashback-preview-fallback"
                className="mt-4 overflow-hidden rounded-[var(--radius-xl)] border border-[rgba(124,63,44,0.15)] bg-[rgba(255,248,242,0.94)] shadow-[var(--shadow-sm)]"
              >
                <div className="px-5 py-5">
                  <p className="text-sm font-semibold text-[color:var(--text)]">
                    {PREVIEW_FALLBACK_HEADING}
                  </p>

                  <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
                    {PREVIEW_FALLBACK_BODY}
                  </p>
                </div>

                <div className="border-t border-[rgba(124,63,44,0.08)] px-5 pb-5">
                  <ShopeePurchaseTrigger
                    productUrl={
                      renderModel.canonicalProductUrl
                    }
                    variant="neutral"
                    isAuthenticated={isAuthenticated}
                    loginHref={loginHref}
                  />
                </div>
              </div>
            );

          case "resolution_error":
            return (
              <div
                role="alert"
                aria-live="polite"
                data-testid="shopee-cashback-preview-error"
                className="mt-4 rounded-[var(--radius-xl)] border border-[rgba(190,92,54,0.18)] bg-[rgba(190,92,54,0.08)] px-5 py-4 text-sm font-medium leading-6 text-[color:var(--warning)]"
              >
                {renderModel.message}
              </div>
            );

          case "empty":
            return (
              <div
                data-testid="shopee-cashback-preview-empty"
                className="mt-4 rounded-[var(--radius-xl)] border border-dashed border-[rgba(124,63,44,0.14)] bg-[rgba(255,250,246,0.68)] px-5 py-8 text-center"
              >
                <p className="text-sm font-semibold text-[color:var(--text)]">
                  {PREVIEW_EMPTY_HEADING}
                </p>

                <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
                  {PREVIEW_EMPTY_BODY}
                </p>

                <p className="mt-3 text-xs leading-5 text-[color:var(--text-muted)]">
                  {PREVIEW_EMPTY_HINT}
                </p>
              </div>
            );
        }
      })()}
    </div>
  );
}
