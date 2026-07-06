import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Phase 20H.4b: pure presentational view for the Shopee purchase
 * trigger. Server-renderable. No `use server` action import, no React
 * hooks -- the parent container (`ShopeePurchaseTrigger.tsx`) owns
 * the `useActionState` / `useRef` / `useEffect` state machine and
 * delegates the visual state down to this view.
 *
 * The view exposes one render slot per visible state so the trigger
 * container can map a discriminated union onto a single render call
 * without recomputing classnames or copy in the parent.
 *
 * The split mirrors the existing
 * `ShopeeProductPreviewCard` / `ShopeeProductPreviewCardView`
 * pattern in this codebase.
 */

export type ShopeePurchaseTriggerViewState =
  | {
      kind: "logged_out";
      loginHref: string;
      buttonText: string;
      variant: "prominent" | "neutral";
    }
  | {
      kind: "logged_in_idle";
      buttonText: string;
      variant: "prominent" | "neutral";
    }
  | {
      kind: "logged_in_pending";
      buttonText: string;
      variant: "prominent" | "neutral";
    }
  | {
      kind: "logged_in_error";
      buttonText: string;
      variant: "prominent" | "neutral";
      errorMessage: string;
    }
  | { kind: "redirecting" };

export interface ShopeePurchaseTriggerViewProps {
  readonly state: ShopeePurchaseTriggerViewState;
  /**
   * Click handler for the logged-in buy button. `undefined` when
   * the button is in a non-clickable state.
   */
  readonly onPurchase?: () => void;
}

const PROMINENT_BUTTON_CLASS =
  "mt-4 w-full rounded-[var(--radius-lg)] bg-[color:var(--brand)] px-4 py-3 text-sm font-semibold text-white shadow-[var(--shadow-sm)] transition disabled:cursor-not-allowed disabled:opacity-60";

const NEUTRAL_BUTTON_CLASS =
  "mt-4 w-full rounded-[var(--radius-lg)] border border-[rgba(124,63,44,0.2)] bg-[rgba(255,248,242,0.94)] px-4 py-3 text-sm font-medium text-[color:var(--text)] transition disabled:cursor-not-allowed disabled:opacity-60";

function buttonClassFor(
  variant: "prominent" | "neutral",
): string {
  return variant === "prominent"
    ? PROMINENT_BUTTON_CLASS
    : NEUTRAL_BUTTON_CLASS;
}

/**
 * Renders a `logged_in_idle`, `logged_in_pending`, or
 * `logged_in_error` state. Error and pending are non-clickable;
 * idle is the only state where the click handler is wired.
 */
function LoggedInCta(props: {
  buttonText: string;
  variant: "prominent" | "neutral";
  isPending: boolean;
  errorMessage: string | null;
  onPurchase: (() => void) | undefined;
}): ReactNode {
  const {
    buttonText,
    variant,
    isPending,
    errorMessage,
    onPurchase,
  } = props;

  const showButtonAsPending = isPending;
  const visibleText = isPending
    ? "Đang xử lý..."
    : buttonText;

  return (
    <>
      <button
        type="button"
        onClick={onPurchase}
        disabled={showButtonAsPending}
        {...(showButtonAsPending
          ? { "aria-busy": true }
          : {})}
        className={buttonClassFor(variant)}
      >
        {visibleText}
      </button>

      {errorMessage !== null ? (
        <p
          role="alert"
          className="mt-2 rounded-[var(--radius-md)] border border-[rgba(190,92,54,0.18)] bg-[rgba(190,92,54,0.08)] px-3 py-2 text-xs font-medium leading-5 text-[color:var(--warning)]"
        >
          {errorMessage}
        </p>
      ) : null}
    </>
  );
}

function LoggedOutBlock(props: {
  buttonText: string;
  variant: "prominent" | "neutral";
  loginHref: string;
}): ReactNode {
  return (
    <div className="mt-4 space-y-2">
      <button
        type="button"
        disabled
        aria-disabled="true"
        className={buttonClassFor(props.variant)}
      >
        {props.buttonText}
      </button>

      <p
        role="status"
        className="rounded-[var(--radius-md)] border border-[rgba(124,63,44,0.14)] bg-[rgba(255,250,246,0.85)] px-3 py-2 text-xs leading-5 text-[color:var(--text)]"
      >
        Đăng nhập để nhận hoàn tiền từ Vaffiliate qua Shopee.{" "}
        <Link
          href={props.loginHref}
          className="font-semibold text-[color:var(--brand-strong)] underline-offset-4 hover:underline"
        >
          Đăng nhập
        </Link>
        .
      </p>
    </div>
  );
}

export default function ShopeePurchaseTriggerView({
  state,
  onPurchase,
}: ShopeePurchaseTriggerViewProps): ReactNode {
  switch (state.kind) {
    case "logged_out":
      return (
        <LoggedOutBlock
          buttonText={state.buttonText}
          variant={state.variant}
          loginHref={state.loginHref}
        />
      );

    case "logged_in_idle":
      return (
        <LoggedInCta
          buttonText={state.buttonText}
          variant={state.variant}
          isPending={false}
          errorMessage={null}
          onPurchase={onPurchase}
        />
      );

    case "logged_in_pending":
      return (
        <LoggedInCta
          buttonText={state.buttonText}
          variant={state.variant}
          isPending={true}
          errorMessage={null}
          onPurchase={onPurchase}
        />
      );

    case "logged_in_error":
      return (
        <LoggedInCta
          buttonText={state.buttonText}
          variant={state.variant}
          isPending={false}
          errorMessage={state.errorMessage}
          onPurchase={onPurchase}
        />
      );

    case "redirecting":
      return (
        <div
          className="rounded-[var(--radius-lg)] border border-[rgba(124,63,44,0.1)] bg-[rgba(255,248,242,0.94)] px-5 py-4 text-center"
          role="status"
          aria-live="polite"
        >
          <p className="text-sm font-medium text-[color:var(--text)]">
            Đang chuyển bạn sang Shopee...
          </p>
        </div>
      );
  }
}
