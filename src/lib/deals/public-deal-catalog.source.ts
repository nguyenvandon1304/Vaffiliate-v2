/**
 * Phase 20I.2 -- public deal catalog source / repository.
 *
 * Composes:
 *
 *   - the manual / seeded catalog (currently exported from
 *     `@/lib/mock/public-deals`);
 *   - one or more {@link PublicOfferFeedAdapter} instances that may
 *     fetch remote offers.
 *
 * The composition rules are strict:
 *
 *   1. Manual entries always appear in the output (the catalog
 *      cannot regress to empty if every adapter fails).
 *   2. Adapter output is normalized then sanitized before being
 *      merged; any record that fails normalization or sanitization
 *      is dropped silently.
 *   3. Duplicates (by `id`) are resolved with manual entries winning
 *      over adapter entries, then first-encountered adapter winning
 *      over later duplicates. This protects the buyer from
 *      conflicting copy if two adapters surface the same id.
 *   4. Unknown category does NOT crash the catalog. The normalizer
 *      maps unknown categories to the "popular" fallback bucket so
 *      every offer is still surfaced.
 *   5. The catalog source NEVER throws on adapter failure. Adapter
 *      errors degrade silently to the manual list.
 *
 * This module is pure (no I/O, no `server-only`). The actual
 * adapter wiring (env keys, fetch implementations) lives in the
 * server-only factory below it.
 */

import {
  PUBLIC_DEALS,
} from "@/lib/mock/public-deals";
import type { PublicDeal } from "@/services/public-deals.types";

import { normalizeRawOfferBatch } from "./public-deal-normalizer";
import { sanitizePublicDealBatch } from "./public-deal-sanitizer";
import type { PublicOfferFeedAdapter } from "./sources/public-offer-feed.types";

export interface PublicDealCatalogSource {
  /** Manually-seeded entries (never empty). */
  readonly manual: ReadonlyArray<PublicDeal>;
  /** Adapter-normalized entries (empty when every adapter fails). */
  readonly adapter: ReadonlyArray<PublicDeal>;
  /** Manual + adapter, deduped, sanitized. What the UI sees. */
  readonly all: ReadonlyArray<PublicDeal>;
  /** Skipped entries from adapters (for diagnostics only). */
  readonly diagnostics: PublicDealCatalogDiagnostics;
}

export interface PublicDealCatalogDiagnostics {
  readonly normalizedSkipped: ReadonlyArray<{ readonly id: string; readonly reason: string }>;
  readonly sanitizedDropped: ReadonlyArray<{ readonly id: string; readonly reason: string }>;
  readonly adapterFailures: ReadonlyArray<{ readonly source: string; readonly reason: string }>;
}

/**
 * Build the public catalog synchronously from already-fetched raw
 * payloads. Pure: no network, no env access.
 *
 * Used by:
 *
 *   - the server-only factory when adapters have already resolved;
 *   - unit tests that drive the catalog with deterministic inputs.
 */
export function composePublicCatalog(input: {
  readonly manual?: ReadonlyArray<PublicDeal>;
  readonly adapterResults: ReadonlyArray<{
    readonly source: string;
    readonly result:
      | { readonly ok: true; readonly offers: ReadonlyArray<unknown> }
      | { readonly ok: false; readonly reason: string };
  }>;
}): PublicDealCatalogSource {
  const manual = input.manual ?? PUBLIC_DEALS;
  const adapterDeals: PublicDeal[] = [];
  const normalizedSkipped: { id: string; reason: string }[] = [];
  const sanitizedDropped: { id: string; reason: string }[] = [];
  const adapterFailures: { source: string; reason: string }[] = [];

  for (const entry of input.adapterResults) {
    if (!entry.result.ok) {
      adapterFailures.push({ source: entry.source, reason: entry.result.reason });
      continue;
    }
    const rawList = entry.result.offers as ReadonlyArray<never>;
    const { deals: normalized, skipped } = normalizeRawOfferBatch(rawList);
    for (const s of skipped) {
      normalizedSkipped.push({ id: s.id, reason: s.reason });
    }
    const { safe, dropped } = sanitizePublicDealBatch(normalized);
    for (const d of dropped) {
      sanitizedDropped.push({ id: d.id, reason: d.reason });
    }
    for (const d of safe) {
      adapterDeals.push(d);
    }
  }

  // Sanitize manual entries too -- defence in depth.
  const { safe: safeManual } = sanitizePublicDealBatch(manual);

  const seen = new Set<string>();
  const all: PublicDeal[] = [];
  // Manual wins over adapter.
  for (const d of safeManual) {
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    all.push(d);
  }
  for (const d of adapterDeals) {
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    all.push(d);
  }

  return {
    manual: safeManual,
    adapter: adapterDeals,
    all,
    diagnostics: {
      normalizedSkipped,
      sanitizedDropped,
      adapterFailures,
    },
  };
}

export interface BuildPublicDealCatalogOptions {
  readonly manual?: ReadonlyArray<PublicDeal>;
  readonly adapters?: ReadonlyArray<PublicOfferFeedAdapter>;
}

/**
 * Async entry point that drives the adapters and composes the
 * catalog. Used by the production wiring. Safe to call without any
 * adapters -- it will then return a catalog equal to the manual
 * list.
 */
export async function buildPublicDealCatalog(
  opts: BuildPublicDealCatalogOptions = {},
): Promise<PublicDealCatalogSource> {
  const adapterResults: {
    source: string;
    result:
      | { ok: true; offers: ReadonlyArray<unknown> }
      | { ok: false; reason: string };
  }[] = [];

  const adapters = opts.adapters ?? [];
  for (const adapter of adapters) {
    let outcome;
    try {
      outcome = await adapter.fetchOffers();
    } catch (err) {
      outcome = {
        ok: false as const,
        source: adapter.source,
        reason: `adapter-threw:${err instanceof Error ? err.message : String(err)}`,
      };
    }
    if (outcome.ok) {
      adapterResults.push({
        source: adapter.source,
        result: { ok: true, offers: outcome.offers },
      });
    } else {
      adapterResults.push({
        source: outcome.source,
        result: { ok: false, reason: outcome.reason },
      });
    }
  }

  return composePublicCatalog({
    manual: opts.manual,
    adapterResults,
  });
}
