"use client";

import {
  startTransition,
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { initiateShopeePurchaseAction } from "@/app/app/cashback/actions";
import type { InitiateShopeePurchaseActionState } from "@/types/cashback";

import ShopeePurchaseTriggerView, {
  type ShopeePurchaseTriggerViewState,
} from "./ShopeePurchaseTriggerView";

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
 * Phase 20H.4b: container component for the public buyer purchase
 * handoff. Owns the React state machine around the server action
 * (initial / pending / success-with-redirect / error) and delegates
 * the visual rendering to `<ShopeePurchaseTriggerView/>`.
 *
 * Behavioural contract (enforced by tests in
 * `ShopeePurchaseTriggerView.test.tsx`):
 *
 *   - Logged-out: the buy button is hard-disabled; the only path
 *     forward is the in-flow login link, which points to
 *     `loginHref` when provided (default `/login`). The visible
 *     Vietnamese sentence and link label are owned by the view
 *     (see `LoggedOutBlock` in `ShopeePurchaseTriggerView.tsx`).
 *   - Logged-in idle: the buy button is enabled and labelled with
 *     the default prominent buy-CTA (or the `neutral` fallback
 *     copy). Labels are owned by the view (`LoggedInCta`).
 *   - Logged-in pending: the buy button is `aria-busy=true` and
 *     shows the in-flight label; the action is invoked exactly
 *     once per click (subsequent clicks are no-ops because the
 *     button is disabled).
 *   - Logged-in success: the redirect happens via
 *     `window.location.assign(trackingPath)` exactly once, even if
 *     the success state re-renders. The internal `hasStartedRedirectRef`
 *     is the idempotency guard.
 *   - Logged-in error: the friendly `purchaseState.message` is
 *     rendered with `role="alert"`. `trackingPath` is null on
 *     failure, so the redirect `useEffect` does not fire.
 *
 * The buyer-visible `InitiateShopeePurchaseActionState` is
 * intentionally narrow: only `ok`, `message`, and `trackingPath`.
 *
 *   - `shortCode`  -- the raw tracking short_code is no longer
 *                     surfaced as its own client field. It is still
 *                     present on the wire only in encoded form,
 *                     inside `trackingPath` (`/go/<shortCode>`).
 *   - `productUrl` -- the canonical Shopee URL is no longer
 *                     returned to the client action state.
 *
 * Other internal identifiers (`networkSubId`, `clickId`,
 * `purchaseIntentId`, `campaignId`, `offerId`) remain strictly
 * server-side and never appear in this state. They live on the
 * `shopee_purchase_intents` and `cashback_clicks` rows and are
 * stitched together by the `/go/[shortCode]` route handler at
 * click time.
 *
 * `trackingPath` is treated as an opaque same-origin navigation
 * path. It is consumed ONLY by the redirect effect via
 * `window.location.assign(trackingPath)` (see below) and must
 * NEVER be rendered into buyer-facing DOM, surfaced in error copy,
 * or written to logs. The trigger container does NOT pass it down
 * to `<ShopeePurchaseTriggerView/>` -- the view stays purely
 * presentational and never receives `trackingPath` at all.
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
    trackingPath: null,
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
            trackingPath: null,
          },
          fd,
        );
      },
      initialState,
    );

  const hasStartedRedirectRef = useRef(false);

  const [isRedirecting, setIsRedirecting] = useState(false);

  // `trackingPath` is an opaque same-origin URL. This effect is its
  // ONLY allowed sink -- consumed via window.location.assign and
  // never rendered into DOM, error copy, or logs.
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

  const resolvedLoginHref = loginHref ?? "/login";

  const viewState: ShopeePurchaseTriggerViewState = (() => {
    if (isRedirecting) {
      return { kind: "redirecting" };
    }

    if (!isAuthenticated) {
      return {
        kind: "logged_out",
        loginHref: resolvedLoginHref,
        buttonText: finalButtonText,
        variant,
      };
    }

    if (purchaseError !== null) {
      return {
        kind: "logged_in_error",
        buttonText: finalButtonText,
        variant,
        errorMessage: purchaseError,
      };
    }

    if (isPurchasing) {
      return {
        kind: "logged_in_pending",
        buttonText: finalButtonText,
        variant,
      };
    }

    return {
      kind: "logged_in_idle",
      buttonText: finalButtonText,
      variant,
    };
  })();

  return (
    <ShopeePurchaseTriggerView
      state={viewState}
      onPurchase={
        isAuthenticated && !isPurchasing
          ? handleInitiatePurchase
          : undefined
      }
    />
  );
}
