/**
 * Phase 20K follow-up 3 / 4G1H -- pure, server-internal parser for the
 * reconciliation dry-run source scope.
 *
 * Lives in a sibling module to `actions.ts` for two reasons:
 *
 *   1. `actions.ts` declares `"use server";` at the top, so Next.js
 *      refuses to export anything other than async functions from
 *      that file. This parser is a pure synchronous function.
 *
 *   2. `actions.ts` also imports `server-only`, which Node's test
 *      runner cannot resolve outside Next's bundler. Extracting the
 *      pure parser into a sibling module makes it unit-testable
 *      with `node --import tsx --test`.
 *
 * 4G1H contract (Phase 20K checkpoint 4G1H):
 *
 *   - The parser NEVER reads `scope_explicit_conversion_ids` from
 *     FormData. The `explicitConversionIds` boundary is a
 *     server-internal capability only -- no production external
 *     caller can populate it.
 *   - The returned `ReconciliationSourceScope` never carries
 *     `explicitConversionIds`.
 *   - A handcrafted FormData field with the name
 *     `scope_explicit_conversion_ids` is silently ignored.
 *   - The parser continues to accept ONLY the rendered safe
 *     boundaries: ingestionEventIds, sourceConversionKeys,
 *     occurredAfter, occurredBefore.
 */

import type { ReconciliationSourceScope } from "@/server/reconciliation/reconciliation.repository";

export function readBoundedSourceScope(
  formData: FormData,
): ReconciliationSourceScope {
  // Phase 20K 4G1H -- the server action does NOT read
  // `scope_explicit_conversion_ids` (and never will). The
  // `explicitConversionIds` boundary is a server-internal
  // capability only; clients cannot supply conversion ids
  // through this FormData, the form never renders the field,
  // and a handcrafted multipart body carrying the field is
  // silently ignored.
  const occurredAfterRaw = formData.get("scope_occurred_after");
  const occurredBeforeRaw = formData.get("scope_occurred_before");
  const ingestionRaw = formData.get("scope_ingestion_event_ids");
  const keyRaw = formData.get("scope_source_conversion_keys");
  // Phase 20K 4G1H -- intentionally NOT read: any FormData
  // field named `scope_explicit_conversion_ids` is dropped on
  // the floor.

  const occurredAfter =
    typeof occurredAfterRaw === "string" && occurredAfterRaw.trim().length > 0
      ? occurredAfterRaw.trim()
      : undefined;
  const occurredBefore =
    typeof occurredBeforeRaw === "string" && occurredBeforeRaw.trim().length > 0
      ? occurredBeforeRaw.trim()
      : undefined;

  const parseList = (
    raw: FormDataEntryValue | null,
  ): ReadonlyArray<string> => {
    if (typeof raw !== "string") return [];
    return raw
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  };

  // Phase 20K 4G1H -- `explicitConversionIds` is intentionally
  // omitted from the returned scope. The action layer has no
  // way to populate it from FormData.
  return {
    ingestionEventIds: parseList(ingestionRaw),
    sourceConversionKeys: parseList(keyRaw),
    occurredAfter,
    occurredBefore,
  };
}