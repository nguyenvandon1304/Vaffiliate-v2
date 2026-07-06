"use client";

import Link from "next/link";
import { startTransition, useActionState, useCallback, useEffect, useRef, useState } from "react";

import { initiateShopeePurchaseAction } from "@/app/app/cashback/actions";
import type { InitiateShopeePurchaseActionState } from "@/types/cashback";

interface ShopeePurchaseTriggerProps {
  /** The canonical product URL to use for purchase handoff */
  productUrl: string;
  /** Whether the CTA should be prominent (for available cashback) or neutral */
  variant?: "prominent" | "neutral";
  /** Custom button text (optional) */
  buttonText?: string;
  /**
   * Whether the user has an authenticated Supabase session. When
   * `false`, the CTA is disabled and the component renders a clear
   * login-required block so unauthenticated visitors are not nudged
   * into the buy action before they sign in.
   */
  isAuthenticated?: boolean;
  /**
   * Optional override for the login link rendered to logged-out
   * visitors. Phase 20H.4a passes the public `/cashback?productUrl=...`
   * return path here so the buyer lands back on the same preview
   * after signing in. The in-app `/app/cashback` flow does not pass
   * this prop, so it keeps the original `/login` behaviour.
   *
   * Must be a same-origin absolute path or a root-relative URL.
   * Relative paths are not used as default values to avoid leaking
   * the form action's origin into the rendered link.
   */
  loginHref?: string;
  /** Callback when navigation is about to start */
  onNavigate?: () => void;
}

/**
 * Shared purchase trigger component that handles:
 * - User authentication check
 * - initiateShopeePurchaseAction call
 * - Tracking link creation/reuse
 * - Deterministic /an_redir URL persistence
 * - Navigation to /go/<shortCode>
 *
 * This component is used by both:
 * - Normal product preview (with metadata)
 * - Metadata-unavailable fallback (no product metadata)
 */
export default function ShopeePurchaseTrigger({
  productUrl,
  variant = "prominent",
  buttonText,
  isAuthenticated = true,
  loginHref,
  onNavigate,
}: ShopeePurchaseTriggerProps) {
  const initialState: InitiateShopeePurchaseActionState = {
    ok: false,
    message: "",
    shortCode: null,
    trackingPath: null,
    productUrl: null,
  };

  const [purchaseState, purchaseAction, isPurchasing] =
    useActionState(
      async (
        _prev: InitiateShopeePurchaseActionState,
        url: string,
      ): Promise<InitiateShopeePurchaseActionState> => {
        const fd = new FormData();
        fd.set("productUrl", url);
        return initiateShopeePurchaseAction(
          {
            ok: false,
            message: "",
            shortCode: null,
            trackingPath: null,
            productUrl: null,
          },
          fd,
        );
      },
      initialState,
    );

  const hasStartedRedirectRef = useRef(false);

  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    if (
      !purchaseState.ok ||
      !purchaseState.trackingPath ||
      hasStartedRedirectRef.current
    ) {
      return;
    }

    hasStartedRedirectRef.current = true;
    setIsRedirecting(true);
    onNavigate?.();
    window.location.assign(purchaseState.trackingPath);
  }, [
    purchaseState.ok,
    purchaseState.trackingPath,
    onNavigate,
  ]);

  const handleInitiatePurchase = useCallback(() => {
    startTransition(() => {
      purchaseAction(productUrl);
    });
  }, [purchaseAction, productUrl]);

  const purchaseError =
    purchaseState.ok === false && purchaseState.message
      ? purchaseState.message
      : null;

  const defaultButtonText =
    variant === "prominent"
      ? "Mua ngay nhận hoàn tiền"
      : "Tiếp tục mua trên Shopee";

  const finalButtonText = buttonText ?? defaultButtonText;

  const buttonClassName =
    variant === "prominent"
      ? "mt-4 w-full rounded-[var(--radius-lg)] bg-[color:var(--brand)] px-4 py-3 text-sm font-semibold text-white shadow-[var(--shadow-sm)] transition disabled:cursor-not-allowed disabled:opacity-60"
      : "mt-4 w-full rounded-[var(--radius-lg)] border border-[rgba(124,63,44,0.2)] bg-[rgba(255,248,242,0.94)] px-4 py-3 text-sm font-medium text-[color:var(--text)] transition disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div>
      {isRedirecting ? (
        <div
          className="rounded-[var(--radius-lg)] border border-[rgba(124,63,44,0.1)] bg-[rgba(255,248,242,0.94)] px-5 py-4 text-center"
          role="status"
          aria-live="polite"
        >
          <p className="text-sm font-medium text-[color:var(--text)]">
            Đang chuyển bạn sang Shopee...
          </p>
        </div>
      ) : isAuthenticated ? (
        <>
          <button
            type="button"
            onClick={handleInitiatePurchase}
            disabled={isPurchasing}
            aria-busy={isPurchasing}
            className={buttonClassName}
          >
            {isPurchasing ? "Đang xử lý..." : finalButtonText}
          </button>

          {purchaseError ? (
            <p
              role="alert"
              className="mt-2 rounded-[var(--radius-md)] border border-[rgba(190,92,54,0.18)] bg-[rgba(190,92,54,0.08)] px-3 py-2 text-xs font-medium leading-5 text-[color:var(--warning)]"
            >
              {purchaseError}
            </p>
          ) : null}
        </>
      ) : (
        <div className="mt-4 space-y-2">
          <button
            type="button"
            disabled
            aria-disabled="true"
            className={buttonClassName}
          >
            {finalButtonText}
          </button>

          <p
            role="status"
            className="rounded-[var(--radius-md)] border border-[rgba(124,63,44,0.14)] bg-[rgba(255,250,246,0.85)] px-3 py-2 text-xs leading-5 text-[color:var(--text)]"
          >
            Đăng nhập để nhận hoàn tiền từ Vaffiliate qua Shopee.{" "}
            <Link
              href={loginHref ?? "/login"}
              className="font-semibold text-[color:var(--brand-strong)] underline-offset-4 hover:underline"
            >
              Đăng nhập
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}
