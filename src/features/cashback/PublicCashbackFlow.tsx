"use client";

/**
 * Phase 20H.4a -- public cashback entry flow.
 *
 * Client-side container that composes the existing cashback preview
 * surfaces in a single page experience accessible to logged-out
 * visitors. Reuses every reusable component from the in-app cashback
 * surface so the math, the auth gate, the empty state, and the
 * preview card all stay in lock-step between the two surfaces.
 *
 * The component does NOT render any marketing chrome or sidebar nav
 * -- that is the job of the public `/cashback/page.tsx` layout.
 *
 * Composition order:
 *
 *   1. <PublicCashbackHero />                       -- brand-neutral hero with
 *                                                      eyebrow, headline, and
 *                                                      trust badges.
 *   2. <PreviewSlot />                              -- preview form + card +
 *                                                      auth-aware buy CTA.
 *   3. <ShopeeCashbackEntrySteps />                 -- 3-step buyer journey
 *                                                      (compact, mobile-friendly).
 *   4. <ShopeeCashbackTrustInstructions />          -- 6-row trust list covering
 *                                                      cart, session, and
 *                                                      reconciliation rules.
 *
 * The preview slot is injected via `<PublicCashbackFlowWithPreview/>`,
 * which imports `<ShopeeCashbackPreviewForm/>` lazily. This lets the
 * pure composition (`<PublicCashbackFlow/>`) unit-test the flow shell
 * without pulling the Shopee `server-only` action module into the
 * test runtime.
 *
 * The `loginHref` value is computed here so the form does not need
 * to know about the public route slug. It points to:
 *
 *   /login?next=/cashback?productUrl=<encoded>
 *
 * ...so a logged-out visitor who clicks the trigger lands back on
 * this same page with their Shopee link ready to preview.
 */

import type { ComponentType } from "react";

import ShopeeCashbackEntrySteps from "@/features/cashback/ShopeeCashbackEntrySteps";
import ShopeeCashbackTrustInstructions from "@/features/cashback/ShopeeCashbackTrustInstructions";
import PublicCashbackHero from "@/features/cashback/PublicCashbackHero";

export interface PublicCashbackPreviewSlotProps {
  readonly isAuthenticated: boolean;
  readonly initialProductUrl?: string;
  readonly loginHref?: string;
}

export interface PublicCashbackFlowProps {
  readonly isAuthenticated: boolean;
  readonly initialProductUrl: string | null;
  /**
   * Optional dependency-injection for the preview slot. Default
   * (in `<PublicCashbackFlowWithPreview/>`) is the real
   * `<ShopeeCashbackPreviewForm/>`. Tests stub this in to validate
   * flow composition without pulling server actions into the test
   * runtime.
   */
  readonly previewSlot: ComponentType<PublicCashbackPreviewSlotProps>;
}

export function buildLoginHref(
  productUrl: string | null | undefined,
): string | undefined {
  if (!productUrl) {
    return undefined;
  }

  // Two-layer URLSearchParams encoding: build the inner
  // `/cashback?productUrl=...` query first, then nest it inside
  // the outer `/login?next=...` query. This keeps each layer
  // percent-encoded exactly once and survives productUrls that
  // themselves contain `?`, `&`, or `=` (Shopee tracking URLs).
  const cashbackParams = new URLSearchParams();
  cashbackParams.set("productUrl", productUrl);
  const next = `/cashback?${cashbackParams.toString()}`;

  const loginParams = new URLSearchParams();
  loginParams.set("next", next);
  return `/login?${loginParams.toString()}`;
}

/**
 * Pure shell. Imports nothing from the server-action chain.
 * Production callers should use `<PublicCashbackFlowWithPreview/>`
 * below which wires the real form as the preview slot.
 */
export default function PublicCashbackFlow({
  isAuthenticated,
  initialProductUrl,
  previewSlot: PreviewSlot,
}: PublicCashbackFlowProps) {
  const loginHref = buildLoginHref(initialProductUrl);

  return (
    <div className="flex flex-col gap-6">
      <PublicCashbackHero />

      <PreviewSlot
        isAuthenticated={isAuthenticated}
        initialProductUrl={initialProductUrl ?? undefined}
        loginHref={loginHref}
      />

      <ShopeeCashbackEntrySteps />

      <ShopeeCashbackTrustInstructions />
    </div>
  );
}
