/**
 * Phase 20H.3c - best-effort Shopee purchase-intent correlation hook.
 *
 * After the `/go/<shortCode>` route has durably persisted the click audit
 * row (via `record_cashback_click` RPC), it calls this helper to look up
 * any recent `redirect_prepared` Shopee purchase intent for the same
 * `(publisherId, shortCode)`. The result is logged only — the helper is
 * explicitly non-blocking, never mutates the click row, and never throws
 * into the redirect path. Legacy `/go/<shortCode>` links that have no
 * matching intent must remain redirectable, so a `null` result is the
 * expected outcome for many real-world calls.
 *
 * This module is deliberately pure (no `server-only` guard, no
 * NextResponse coupling, no top-level import of server-only modules)
 * so it can be unit-tested with the Node test runner. The default
 * lookup implementation is loaded lazily inside the helper function so
 * tests can drive both successful and failing loader paths without
 * touching the server-only repository.
 *
 * Failure-isolation contract:
 *
 *   `recordShopeePurchaseIntentCorrelationAsync` (the public route
 *   entry point) NEVER throws. It traps failures from:
 *
 *     - dynamic import of the repository module,
 *     - loader factory invocation,
 *     - the lookup call itself,
 *     - the logging branch logic.
 *
 *   Any unexpected error becomes `{ status: "failed", ... }` and is
 *   logged as `cashback.redirect.intent_correlation_failed`. The route
 *   can fire this with `void` because the public entry point is
 *   guaranteed not to reject.
 */

export interface CorrelatedShopeePurchaseIntentLike {
  id: string;
  publisherId: string;
  shortCode: string;
}

export type ShopeeRedirectIntentLookup = (
  params: { publisherId: string; shortCode: string },
) => Promise<CorrelatedShopeePurchaseIntentLike | null>;

export type ShopeeRedirectIntentLookupFactory = () => Promise<
  ShopeeRedirectIntentLookup
>;

export interface ShopeeRedirectIntentCorrelationResult {
  status: "correlated" | "not_found" | "failed";
  intentId: string | null;
  clickId: string;
  publisherId: string;
  shortCode: string;
  error: string | null;
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "unknown";
}

/**
 * Default loader factory reference. Resolves lazily so this module can
 * be imported by tests that supply their own factory via
 * `lookupShopeeRedirectIntentCorrelationWithFactory`. The default
 * implementation reads through the Drizzle repository, which itself is
 * `server-only`. Lazy resolution keeps this module's top-level surface
 * free of server-only imports.
 *
 * The function is itself a `ShopeeRedirectIntentLookupFactory` —
 * invoking it returns a fully-bound `ShopeeRedirectIntentLookup`. This
 * lets `lookupShopeeRedirectIntentCorrelationWithFactory` treat both
 * the production and test-supplied factories uniformly.
 *
 * Exported so tests can wrap it and simulate import-time failures.
 */
export const defaultShopeeRedirectIntentLookupFactory: ShopeeRedirectIntentLookupFactory =
  async () => {
    const { findRecentRedirectPreparedIntentAsync } = await import(
      "@/repositories/shopee-purchase-intent.repository"
    );
    return async (params) => {
      const matched = await findRecentRedirectPreparedIntentAsync(params);
      if (!matched) return null;
      return {
        id: matched.id,
        publisherId: matched.publisherId,
        shortCode: matched.shortCode,
      };
    };
  };

/**
 * Test-friendly entry point. Accepts an already-built `lookup` so unit
 * tests can drive the helper without the server-only repository in
 * scope. Any throw from `lookup` is trapped and surfaced as
 * `{ status: "failed", ... }`.
 */
export async function lookupShopeeRedirectIntentCorrelationWith(
  lookup: ShopeeRedirectIntentLookup,
  params: {
    publisherId: string;
    shortCode: string;
    clickId: string;
  },
): Promise<ShopeeRedirectIntentCorrelationResult> {
  try {
    const matched = await lookup({
      publisherId: params.publisherId,
      shortCode: params.shortCode,
    });

    if (matched) {
      return {
        status: "correlated",
        intentId: matched.id,
        clickId: params.clickId,
        publisherId: params.publisherId,
        shortCode: params.shortCode,
        error: null,
      };
    }

    return {
      status: "not_found",
      intentId: null,
      clickId: params.clickId,
      publisherId: params.publisherId,
      shortCode: params.shortCode,
      error: null,
    };
  } catch (error) {
    return {
      status: "failed",
      intentId: null,
      clickId: params.clickId,
      publisherId: params.publisherId,
      shortCode: params.shortCode,
      error: describeError(error),
    };
  }
}

/**
 * Test-friendly entry point for the default-lookup path. Accepts an
 * injected `loaderFactory` so tests can drive import/loader failure
 * paths without spinning up a real Next.js runtime. The loader factory
 * itself runs INSIDE the try/catch, so a dynamic-import or factory
 * throw is converted to `{ status: "failed", ... }` rather than
 * rejecting.
 */
export async function lookupShopeeRedirectIntentCorrelationWithFactory(
  loaderFactory: ShopeeRedirectIntentLookupFactory,
  params: {
    publisherId: string;
    shortCode: string;
    clickId: string;
  },
): Promise<ShopeeRedirectIntentCorrelationResult> {
  try {
    const lookup = await loaderFactory();
    return await lookupShopeeRedirectIntentCorrelationWith(
      lookup,
      params,
    );
  } catch (error) {
    return {
      status: "failed",
      intentId: null,
      clickId: params.clickId,
      publisherId: params.publisherId,
      shortCode: params.shortCode,
      error: describeError(error),
    };
  }
}

/**
 * Production lookup entry point. Loads the default Drizzle-backed
 * lookup factory and delegates to it. Loader resolution runs INSIDE the
 * try/catch so a dynamic-import or factory throw is converted to
 * `{ status: "failed", ... }`. Never throws.
 */
export async function lookupShopeeRedirectIntentCorrelationAsync(
  params: {
    publisherId: string;
    shortCode: string;
    clickId: string;
  },
): Promise<ShopeeRedirectIntentCorrelationResult> {
  return lookupShopeeRedirectIntentCorrelationWithFactory(
    defaultShopeeRedirectIntentLookupFactory,
    params,
  );
}

/**
 * Public route entry point. Awaits the correlation result, emits one
 * structured log line, and is guaranteed NOT to reject — even if the
 * loader factory, dynamic import, lookup call, or the logging branch
 * logic itself throws. The route can fire this with `void` because the
 * helper itself never throws — this just makes the fire-and-forget
 * intent explicit at the call site.
 */
export async function recordShopeePurchaseIntentCorrelationAsync(
  params: {
    publisherId: string;
    shortCode: string;
    clickId: string;
  },
): Promise<void> {
  try {
    const result =
      await lookupShopeeRedirectIntentCorrelationAsync(params);

    if (result.status === "correlated") {
      console.info("cashback.redirect.intent_correlated", {
        clickId: result.clickId,
        intentId: result.intentId,
        publisherId: result.publisherId,
        shortCode: result.shortCode,
      });
    } else if (result.status === "not_found") {
      console.info("cashback.redirect.intent_not_found", {
        clickId: result.clickId,
        publisherId: result.publisherId,
        shortCode: result.shortCode,
      });
    } else {
      console.warn("cashback.redirect.intent_correlation_failed", {
        clickId: result.clickId,
        publisherId: result.publisherId,
        shortCode: result.shortCode,
        error: result.error,
      });
    }
  } catch (error) {
    // Final safety net: even if a future refactor introduces a throw
    // outside our internal try/catches, the route's `void` call site
    // must not become an unhandled promise rejection.
    try {
      console.warn("cashback.redirect.intent_correlation_failed", {
        clickId: params.clickId,
        publisherId: params.publisherId,
        shortCode: params.shortCode,
        error: describeError(error),
      });
    } catch {
      // Logging itself must never throw.
    }
  }
}