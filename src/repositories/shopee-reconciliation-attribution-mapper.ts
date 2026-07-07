/**
 * Phase 20H.6 -- pure mapper from Phase 20H.5 attribution results to
 * Phase 20H.6 repository results, plus a typed safe-details contract.
 *
 * This module is intentionally separate from
 * src/repositories/shopee-reconciliation-ingestion.repository.ts so
 * the mapper can be unit-tested without pulling in `server-only` and
 * Drizzle / database context.
 *
 * No database, no clock, no environment, no per-call shared state.
 *
 * Safe-details contract:
 *
 *   - Every details string returned by the mapper MUST NOT contain any
 *     of FORBIDDEN_DETAIL_TOKENS. throwSafeDetailsIfForbidden enforces
 *     this invariant by throwing on violation.
 *   - The mapper emits GENERIC, human-readable, Vietnamese/English
 *     prose only. Technical subKind / reason labels live in the typed
 *     structured fields, NEVER inside the details string.
 */
import type { ShopeeAttributionResult } from "@/services/shopee-attribution-matcher";

// Forbidden detail tokens. Any details string returned by the mapper
// MUST NOT contain any of these. The expanded list covers every
// identifier / token / label that must never leak into a safe failure
// message.
export const FORBIDDEN_DETAIL_TOKENS = Object.freeze([
  // Technical tokens from internal identifiers / sub_ids / short_codes
  // / paths / click IDs.
  "vaflnk",
  "an_redir",
  "/go/",
  "clickId",
  "trackingPath",
  // Explicit field-name labels. Any details string mentioning the
  // literal field names risks duplicating raw values.
  "networkSubId",
  "sourceSubId1",
  "source_sub_id1",
  "purchaseIntentId",
  "trackingLinkId",
  "publisherId",
  "shortCode",
] as const);

export type SafeIntentStatusReason =
  | "intent_status_pending"
  | "intent_status_expired"
  | "intent_status_consumed"
  | "intent_status_unknown";

export type AttributionInvalidReason =
  | "missing_attribution_field"
  | "invalid_attribution_format"
  | "sub_id_mismatch"
  | "intent_not_redirect_prepared"
  | "intent_missing_required_field";

export type AttributionInvalidResult = {
  readonly kind: "attribution_invalid";
  readonly reason: AttributionInvalidReason;
  // Optional structured subKind for matcher outcomes that carry one
  // (missing_attribution_field, intent_missing_required_field). NEVER
  // includes raw values -- only closed enum labels.
  readonly attributionSubKind?: string;
  // Optional structured reason label for intent_not_redirect_prepared.
  // NEVER includes the raw status string.
  readonly intentStatusReason?: SafeIntentStatusReason;
  // Generic, human-readable, NO-TOKEN details string. Always passes
  // throwSafeDetailsIfForbidden before being returned.
  readonly details: string;
};

// Throw a programmer-error if the details string contains any forbidden
// token. Callers should call this before returning any details field.
export function throwSafeDetailsIfForbidden(details: string): void {
  for (const forbidden of FORBIDDEN_DETAIL_TOKENS) {
    if (details.includes(forbidden)) {
      throw new Error(
        "shopee-reconciliation-attribution-mapper: forbidden token in details: " +
          forbidden,
      );
    }
  }
}

// Generic details messages. These are the ONLY strings the mapper may
// return. They are intentionally short, non-technical, and contain no
// field names / tokens / IDs.
const GENERIC_DETAILS: Record<AttributionInvalidReason, string> = Object.freeze({
  missing_attribution_field:
    "The Shopee source row is missing an attribution value.",
  invalid_attribution_format:
    "The Shopee source row attribution value is not in the expected format.",
  sub_id_mismatch:
    "The Shopee source row attribution value does not match the purchase intent.",
  intent_not_redirect_prepared:
    "The matched purchase intent is not ready for reconciliation.",
  intent_missing_required_field:
    "The matched purchase intent is missing required attribution context.",
}) as Record<AttributionInvalidReason, string>;

// Map a Phase 20H.5 attribution result onto the typed attribution_invalid
// result. Returns null when the matcher returned matched (success path).
export function mapAttributionResultToInvalid(
  result: ShopeeAttributionResult,
): AttributionInvalidResult | null {
  if (result.kind === "matched") return null;

  const reason = result.kind;
  const attributionSubKind =
    "subKind" in result ? (result.subKind as string) : undefined;
  const intentStatusReason =
    "reason" in result ? (result.reason as SafeIntentStatusReason) : undefined;

  const details = GENERIC_DETAILS[reason];
  throwSafeDetailsIfForbidden(details);

  return {
    kind: "attribution_invalid",
    reason,
    attributionSubKind,
    intentStatusReason,
    details,
  };
}
