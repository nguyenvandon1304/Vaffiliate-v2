/**
 * Phase 20H.8 -- Addlivetag row normalizer.
 *
 * Pure, side-effect-free. Maps an Addlivetag raw row to either:
 *
 *   - a `shopee_csv_rows` shape (`AddlivetagNormalizedRow`)
 *   - a safe click audit shape (`AddlivetagNormalizedClickRow`)
 *   - a typed rejection reason (missing sub_id, malformed sub_id,
 *     malformed row)
 *
 * The normalizer never throws. The orchestrator treats every
 * rejection as a structured, machine-readable result.
 *
 * Money parsing:
 *   - the API emits decimals as strings (e.g. "12345.00000"); the
 *     staging service relies on the existing `numeric(20, 5)` column
 *     so the normalizer forwards the string verbatim. Money
 *     coercion into integer VND happens only in the promotion
 *     reducer, never here.
 *
 * Source map (Addlivetag `linked_product_status` /
 * `order_status` -> `shopee_csv_rows.linked_product_status`):
 *
 *   Addlivetag `pending`  -> "pending"
 *   Addlivetag `approved` -> "linked"
 *   Addlivetag `rejected` -> "rejected"
 *   anything else         -> "pending"
 *
 * The "approved -> linked" mapping is intentional: the staging
 * table's `linked_product_status` was originally written for Shopee
 * CSV imports where `linked` means "the order is settled and the
 * commission has been recorded". Addlivetag's "approved" is the
 * equivalent settled state.
 */
import { isValidNetworkSubIdFormat } from "@/services/shopee-attribution-matcher";

import type {
  AddlivetagNormalizeResult,
  AddlivetagNormalizedClickRow,
  AddlivetagNormalizedRow,
  AddlivetagRawClickRow,
  AddlivetagRawRow,
  AddlivetagResourceType,
  AddlivetagStatus,
} from "@/reporting/addlivetag-types";

/**
 * Canonicalise Addlivetag's status into a stable lowercase token.
 *
 * The API documents lowercase values; the normalizer tolerates
 * upper or mixed case and trims whitespace.
 */
function canonicalizeStatus(
  status: string | null | undefined,
): AddlivetagStatus | null {
  if (status === null || status === undefined) return null;
  const normalized = String(status).trim().toLowerCase();
  if (normalized === "pending") return "pending";
  if (normalized === "approved") return "approved";
  if (normalized === "rejected") return "rejected";
  return null;
}

function mapStatusToLinkedProductStatus(
  status: string | null | undefined,
): string {
  const canonical = canonicalizeStatus(status);
  if (canonical === "approved") return "linked";
  if (canonical === "rejected") return "rejected";
  // pending or unknown -> "pending"
  return "pending";
}

function toStringOrNull(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return String(value);
  }
  const trimmed = String(value).trim();
  return trimmed.length === 0 ? null : trimmed;
}

function toIntOrNull(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    if (!Number.isInteger(value)) return null;
    return value;
  }
  const trimmed = String(value).trim();
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return null;
  return parsed;
}

function isMissing(value: string | null): value is null {
  return value === null;
}

/**
 * Normalize a single Addlivetag order or item row into the
 * canonical staging shape.
 *
 * Returns:
 *
 *   - `{ kind: "ok", row }` for a well-formed row.
 *   - `{ kind: "missing_sub_id" }` if `sub_id1` is null/blank.
 *   - `{ kind: "malformed_sub_id" }` if `sub_id1` is present but
 *     does not match the Vaffiliate `vaflnk[a-f0-9]{24}` format.
 *   - `{ kind: "malformed_row", reason: "missing_external_order_id" }`
 *     if the row lacks an order id (which is the primary key for
 *     the existing reconciliation idempotency boundary).
 *   - `{ kind: "malformed_row", reason: "missing_item_id" }` for
 *     item rows that lack an `item_id` (which downstream reducer
 *     needs for product evidence).
 */
export function normalizeAddlivetagRowToStaging(
  raw: AddlivetagRawRow,
): AddlivetagNormalizeResult {
  const externalOrderId = toStringOrNull(raw.order_id ?? raw.id);
  if (isMissing(externalOrderId)) {
    return { kind: "malformed_row", reason: "missing_external_order_id" };
  }

  const itemId = toStringOrNull(raw.item_id);
  if (isMissing(itemId)) {
    return { kind: "malformed_row", reason: "missing_item_id" };
  }

  const sourceSubId1 = toStringOrNull(raw.sub_id1);
  if (isMissing(sourceSubId1)) {
    return { kind: "missing_sub_id", reason: "source_sub_id1_null" };
  }
  if (!isValidNetworkSubIdFormat(sourceSubId1)) {
    return {
      kind: "malformed_sub_id",
      reason: "invalid_attribution_format",
    };
  }

  const linkedProductStatus = mapStatusToLinkedProductStatus(
    raw.linked_product_status ?? raw.order_status,
  );

  const row: AddlivetagNormalizedRow = {
    externalOrderId,
    checkoutId: toStringOrNull(raw.checkout_id),
    orderStatus: toStringOrNull(raw.order_status),
    orderedAt: toStringOrNull(raw.ordered_at),
    completedAt: toStringOrNull(raw.completed_at),
    clickedAt: toStringOrNull(raw.clicked_at),
    shopId: toStringOrNull(raw.shop_id),
    itemId,
    modelId: toStringOrNull(raw.model_id),
    promotionId: toStringOrNull(raw.promotion_id),
    quantity: toIntOrNull(raw.quantity),
    orderValue: toStringOrNull(raw.order_value),
    refundedAmount: toStringOrNull(raw.refunded_amount),
    totalProductCommission: toStringOrNull(raw.total_product_commission),
    totalOrderCommission: toStringOrNull(raw.total_order_commission),
    netAffiliateCommission: toStringOrNull(raw.net_affiliate_commission),
    linkedProductStatus,
    sourceSubId1,
    sourceSubId2: toStringOrNull(raw.sub_id2),
    sourceSubId3: toStringOrNull(raw.sub_id3),
    sourceSubId4: toStringOrNull(raw.sub_id4),
    sourceSubId5: toStringOrNull(raw.sub_id5),
    channel: toStringOrNull(raw.channel),
  };
  return { kind: "ok", row };
}

/**
 * Normalize a single Addlivetag click row into a safe internal
 * audit shape.
 *
 * Click rows are NEVER joined to `shopee_purchase_intents` in
 * Phase 20H.8 and NEVER claimed as the click that produced an
 * order. The normalizer surfaces a typed rejection when the row
 * lacks a usable click id so the audit log can record the gap.
 */
export function normalizeAddlivetagClickRow(
  raw: AddlivetagRawClickRow,
): AddlivetagNormalizeResult {
  const clickId = toStringOrNull(raw.click_id);
  if (isMissing(clickId)) {
    return { kind: "malformed_row", reason: "missing_click_id" };
  }
  const row: AddlivetagNormalizedClickRow = {
    clickId,
    clickToken: toStringOrNull(raw.click_token),
    itemId: toStringOrNull(raw.item_id),
    shopId: toStringOrNull(raw.shop_id),
    sourceSubId1: toStringOrNull(raw.sub_id1),
    sourceSubId2: toStringOrNull(raw.sub_id2),
    channel: toStringOrNull(raw.channel),
    clickedAt: toStringOrNull(raw.clicked_at),
  };
  return { kind: "ok_click", row };
}

/**
 * Compute the row-level fingerprint SHA-256 for a normalized row.
 *
 * Mirrors the existing CSV row fingerprint contract: a stable
 * canonical JSON of the immutable row fields, hashed with SHA-256,
 * lowercase hex. Two normalized rows with identical content produce
 * the same fingerprint; this is the row-level idempotency
 * boundary.
 */
export async function computeAddlivetagRowFingerprintAsync(
  row: AddlivetagNormalizedRow | AddlivetagNormalizedClickRow,
  type: AddlivetagResourceType,
): Promise<string> {
  const canonical = canonicalizeForFingerprint(row, type);
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return bufferToLowercaseHex(new Uint8Array(digest));
}

function isClickRow(
  row: AddlivetagNormalizedRow | AddlivetagNormalizedClickRow,
): row is AddlivetagNormalizedClickRow {
  return (row as AddlivetagNormalizedClickRow).clickId !== undefined;
}

function canonicalizeForFingerprint(
  row: AddlivetagNormalizedRow | AddlivetagNormalizedClickRow,
  type: AddlivetagResourceType,
): string {
  if (type === "clicks" || isClickRow(row)) {
    const click = row as AddlivetagNormalizedClickRow;
    return JSON.stringify({
      type,
      clickId: click.clickId,
      clickToken: click.clickToken,
      itemId: click.itemId,
      shopId: click.shopId,
      sourceSubId1: click.sourceSubId1,
      sourceSubId2: click.sourceSubId2,
      channel: click.channel,
      clickedAt: click.clickedAt,
    });
  }
  const order = row as AddlivetagNormalizedRow;
  return JSON.stringify({
    type,
    externalOrderId: order.externalOrderId,
    checkoutId: order.checkoutId,
    orderStatus: order.orderStatus,
    orderedAt: order.orderedAt,
    completedAt: order.completedAt,
    clickedAt: order.clickedAt,
    shopId: order.shopId,
    itemId: order.itemId,
    modelId: order.modelId,
    promotionId: order.promotionId,
    quantity: order.quantity,
    orderValue: order.orderValue,
    refundedAmount: order.refundedAmount,
    totalProductCommission: order.totalProductCommission,
    totalOrderCommission: order.totalOrderCommission,
    netAffiliateCommission: order.netAffiliateCommission,
    linkedProductStatus: order.linkedProductStatus,
    sourceSubId1: order.sourceSubId1,
    sourceSubId2: order.sourceSubId2,
    sourceSubId3: order.sourceSubId3,
    sourceSubId4: order.sourceSubId4,
    sourceSubId5: order.sourceSubId5,
    channel: order.channel,
  });
}

function bufferToLowercaseHex(buffer: Uint8Array): string {
  let out = "";
  for (let i = 0; i < buffer.length; i++) {
    const value = buffer[i]!;
    out += value.toString(16).padStart(2, "0");
  }
  return out;
}
