/**
 * Phase 20H.5 -- pure Shopee attribution matcher for CSV ingestion.
 *
 * Matches a Shopee CSV source row (with its sourceSubId1 / networkSubId
 * attribution token) against a Vaffiliate purchase-intent record that was
 * written at the time of the buyer handoff.
 *
 * Pure module: no database access, no clock dependency, no environment
 * access, no per-call shared mutable state.
 *
 * Attribution flow (Phase 20H.5):
 *
 *   1. CSV row arrives with sourceSubId1 = vaflnk[a-f0-9]{24}.
 *      This is the same token Vaffiliate wrote into the tracking link at
 *      handoff time, and which Shopee echoes back in the CSV export.
 *   2. The ingestor (Phase 20H.6) looks up the matching
 *      shopee_purchase_intents row by networkSubId (the sourceSubId1 value).
 *   3. This pure matcher validates the matched intent and returns a typed
 *      outcome so the repository can decide whether to proceed with
 *      promotion or surface a safe failure.
 *
 * Internal-ID safety:
 *
 *   - The matcher never surfaces purchaseIntentId, trackingLinkId,
 *     publisherId, networkSubId, shortCode, clickId, trackingPath,
 *     or an_redir in any return field.
 *   - All typed outcomes carry only safe domain labels and codes.
 *   - Buyer-facing DOM / logs are never touched.
 *
 * Design note: this module handles attribution against the purchase-intent
 * table. The Phase 20G.2a CSV-sub-id path (exact match against
 * tracking_links.networkSubId) is handled by the raw SQL in
 * shopee-csv-attribution.repository.ts and does NOT use this module.
 * This module is for the Phase 20H.5 purchase-intent attribution path
 * where a pre-matched intent row is passed in.
 */

// Shape of the matched purchase-intent record as seen by the matcher.
// Built from shopee_purchase_intents by the repository caller; never
// trusted as-is -- validated below. shortCode is intentionally NOT part
// of this input shape: the matcher does not validate short code format,
// and exposing it here would invite accidental leakage in failure paths.
export interface ShopeePurchaseIntentForAttribution {
  readonly id: string;
  readonly networkSubId: string;
  readonly publisherId: string;
  readonly trackingLinkId: string;
  readonly status: string;
}

// Shape of the staged CSV row as seen by the matcher.
// Built from shopee_csv_rows by the repository caller (already validated
// as ready_for_conversion by the staging pipeline). Only the
// attribution-relevant field is required here.
export interface ShopeeCsvSourceRowForAttribution {
  readonly sourceSubId1: string | null;
}

// Typed attribution outcomes returned by matchShopeeCsvPurchaseIntentAttribution.
// All fields use safe domain labels only. Internal UUIDs / sub_ids /
// short_codes are never surfaced in any variant.
export type ShopeeAttributionResult =
  | {
      // Attribution is valid. The CSV row sourceSubId1 token matches the
      // purchase-intent networkSubId, the intent is in a terminal status,
      // and the purchase-intent carries a valid publisher and tracking
      // link.
      readonly kind: "matched";
    }
  | {
      // The CSV row sourceSubId1 is blank or absent. The row cannot be
      // attributed through this path.
      // subKind: why it is missing.
      //   "source_sub_id1_blank" -- field is present but empty / whitespace.
      //   "source_sub_id1_null"  -- field is SQL NULL.
      readonly kind: "missing_attribution_field";
      readonly subKind: "source_sub_id1_blank" | "source_sub_id1_null";
    }
  | {
      // The CSV row sourceSubId1 does not match the purchase-intent
      // networkSubId. The row should not be attributed to this intent.
      readonly kind: "sub_id_mismatch";
    }
  | {
      // The CSV row sourceSubId1 does not conform to the
      // vaflnk[a-f0-9]{24} token format. It cannot be matched against a
      // purchase intent.
      readonly kind: "invalid_attribution_format";
    }
  | {
      // A purchase-intent record was found for this networkSubId, but its
      // status is not redirect_prepared. Only redirect_prepared intents
      // are trusted attribution anchors; others may be stale or abandoned.
      // reason: safe category label only (never the raw status value).
      //   "intent_status_pending"    -- intent was created but never redirected.
      //   "intent_status_expired"    -- intent expired without redirect.
      //   "intent_status_consumed"   -- intent already consumed by a prior conversion.
      //   "intent_status_unknown"    -- any other / future status value.
      readonly kind: "intent_not_redirect_prepared";
      readonly reason:
        | "intent_status_pending"
        | "intent_status_expired"
        | "intent_status_consumed"
        | "intent_status_unknown";
    }
  | {
      // The matched purchase-intent is missing a required field that must
      // be present for attribution to be valid.
      // subKind: which field is missing.
      //   "publisher_id_blank"   -- publisherId is null/blank.
      //   "tracking_link_id_blank" -- trackingLinkId is null/blank.
      readonly kind: "intent_missing_required_field";
      readonly subKind: "publisher_id_blank" | "tracking_link_id_blank";
    };

// Token anatomy (30 characters total):
//   "vaflnk"          -- 6-char Vaffiliate prefix
//   + 24 hex digits   -- e.g. "000000000000000000000001"
// Mirrors the shopee_purchase_intents_network_sub_id_check DB constraint
// and the tracking_links_network_sub_id_check constraint.
const NETWORK_SUB_ID_PATTERN = /^vaflnk[a-f0-9]{24}$/;

// Validates that sourceSubId1 from a Shopee CSV row is a well-formed
// Vaffiliate networkSubId token: vaflnk[a-f0-9]{24}.
export function isValidNetworkSubIdFormat(value: string): boolean {
  return NETWORK_SUB_ID_PATTERN.test(value);
}

// Maps a raw purchase-intent status string to a safe reason category.
// Never returns the raw status value to callers, so internal status
// transitions cannot leak through attribution outcomes.
function intentStatusToReason(status: string):
  | "intent_status_pending"
  | "intent_status_expired"
  | "intent_status_consumed"
  | "intent_status_unknown" {
  switch (status) {
    case "pending":
    case "prepared":
      return "intent_status_pending";
    case "expired":
    case "cancelled":
      return "intent_status_expired";
    case "consumed":
      return "intent_status_consumed";
    default:
      return "intent_status_unknown";
  }
}

// Phase 20H.5 -- core attribution matcher.
//
// Validates that a CSV source row sourceSubId1 token matches the
// networkSubId of a purchase-intent record that was written at buyer
// handoff time, and that the intent is in the redirect_prepared status
// (the only terminal status that guarantees a real handoff happened).
//
// Returns a typed ShopeeAttributionResult discriminated union. No
// exceptions for data-level problems -- every invalid input maps to a
// typed failure outcome.
export function matchShopeeCsvPurchaseIntentAttribution(args: {
  readonly sourceRow: ShopeeCsvSourceRowForAttribution;
  readonly purchaseIntent: ShopeePurchaseIntentForAttribution;
}): ShopeeAttributionResult {
  const { sourceRow, purchaseIntent } = args;

  // Defensive guard: handle null / undefined inputs without throwing.
  // Treats "no sourceRow at all" the same as "sourceSubId1 is null".
  if (!sourceRow || !purchaseIntent) {
    return {
      kind: "missing_attribution_field",
      subKind: "source_sub_id1_null",
    };
  }

  // Step 1: validate sourceSubId1 presence.
  const rawSubId = sourceRow.sourceSubId1;
  if (rawSubId === null || rawSubId === undefined) {
    return {
      kind: "missing_attribution_field",
      subKind: "source_sub_id1_null",
    };
  }

  // Trim once and use the trimmed value consistently for every
  // downstream check. This avoids the foot-gun of comparing a trimmed
  // token against an un-trimmed intent.networkSubId later.
  const trimmedSubId = rawSubId.trim();
  if (trimmedSubId.length === 0) {
    return {
      kind: "missing_attribution_field",
      subKind: "source_sub_id1_blank",
    };
  }

  // Step 2: validate sourceSubId1 format.
  if (!isValidNetworkSubIdFormat(trimmedSubId)) {
    return {
      kind: "invalid_attribution_format",
    };
  }

  // Step 3: validate purchase-intent status. Only redirect_prepared is
  // a trusted attribution anchor. Other statuses mean the buyer never
  // completed the handoff. Return a safe reason category only.
  if (purchaseIntent.status !== "redirect_prepared") {
    return {
      kind: "intent_not_redirect_prepared",
      reason: intentStatusToReason(purchaseIntent.status),
    };
  }

  // Step 4: validate matched purchase-intent fields.
  if (
    !purchaseIntent.publisherId ||
    purchaseIntent.publisherId.trim().length === 0
  ) {
    return {
      kind: "intent_missing_required_field",
      subKind: "publisher_id_blank",
    };
  }

  if (
    !purchaseIntent.trackingLinkId ||
    purchaseIntent.trackingLinkId.trim().length === 0
  ) {
    return {
      kind: "intent_missing_required_field",
      subKind: "tracking_link_id_blank",
    };
  }

  // Step 5: validate the purchase-intent networkSubId matches CSV
  // sourceSubId1. Both must be identical; case-sensitive comparison.
  // purchaseIntent.networkSubId is validated as non-null by the DB
  // constraint.
  if (purchaseIntent.networkSubId.trim() !== trimmedSubId) {
    return {
      kind: "sub_id_mismatch",
    };
  }

  // All checks passed: attribution is valid.
  return { kind: "matched" };
}

// Phase 20H.5: canonical list of trusted intent statuses.
// Only redirect_prepared is used for attribution in Phase 20H.5.
// Exported so callers and tests can reference it without repeating
// the literal.
export const ATTRIBUTION_TRUSTED_INTENT_STATUSES = ["redirect_prepared"] as const;

export type AttributionTrustedIntentStatus =
  (typeof ATTRIBUTION_TRUSTED_INTENT_STATUSES)[number];

// Phase 20H.5 -- documented interface stub for Phase 20H.6 ingestion
// wiring. This is intentionally NOT IMPLEMENTED in Phase 20H.5; it is
// the contract the Phase 20H.6 ingestion path must satisfy when it
// wires the CSV ingestor to this matcher.
//
// Contract:
//   - Input: a staged Shopee CSV row id (string) plus an authenticated
//     DB transaction handle.
//   - Steps the Phase 20H.6 wiring MUST perform, in order, BEFORE any
//     database lookup for shopee_purchase_intents:
//       1. Load the staged CSV row.
//       2. Reject without DB lookup when sourceSubId1 is null / blank /
//          whitespace / malformed (re-use isValidNetworkSubIdFormat).
//          Return a typed failure with kind matching one of:
//            - missing_attribution_field
//            - invalid_attribution_format
//       3. Trim sourceSubId1 once and use the trimmed value for every
//          downstream comparison.
//   - Steps that DO require a DB lookup:
//       4. Lock and load the matching shopee_purchase_intents row by
//          networkSubId (FOR UPDATE).
//       5. If no row exists, return a typed
//          "purchase_intent_not_found" outcome -- never the raw token
//          in any details field.
//       6. Run matchShopeeCsvPurchaseIntentAttribution against the
//          loaded row.
//       7. On "matched", delegate to the existing
//          reduceShopeeCsvPromotion reducer and PRESERVE its existing
//          skip / duplicate / promoted outcome semantics. Do NOT
//          collapse them into attribution_invalid /
//          missing_attribution_field.
//   - Failure details MUST NOT include any of: networkSubId,
//     purchaseIntentId, trackingLinkId, publisherId, shortCode,
//     clickId, trackingPath, an_redir.
//   - This function must NOT be called from any buyer-facing UI path.
export interface ShopeeAttributionMatcherPort {
  attributeAndPromote(input: { stagedRowId: string }): Promise<unknown>;
}
