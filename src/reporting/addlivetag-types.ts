/**
 * Phase 20H.8 -- Addlivetag Report Source Adapter types.
 *
 * Pure type definitions shared by the HTTP client, the row
 * normalizer, the import service, the admin page, the dry-run
 * script, and the tests. No runtime code, no secrets, no env reads.
 *
 * Source model (forward-compatible):
 *
 *   - AddlivetagSource: which platform the report row came from.
 *     `shopee` is the only active source for Phase 20H.8. `food` is
 *     a future Shopee Food adapter -- types-only scaffolding, no
 *     buyer UI is shipped for it.
 *
 *   - AddlivetagResourceType: which Addlivetag endpoint produced the
 *     row.
 *
 *     - `orders` carries a complete order and is the only resource
 *       that can carry the canonical commission numbers.
 *     - `items`  carries item-level evidence; an `items` row is
 *       promoted to a staging row whose `linked_product_status` is
 *       set to `linked` so the existing attribution matcher can
 *       process it.
 *     - `clicks` carries click-level evidence; in Phase 20H.8 a click
 *       row is recorded as a safe internal audit model (no
 *       `shopee_purchase_intents` write, no buyer-facing claim).
 *
 *   - AddlivetagStatus: Addlivetag's own commission lifecycle. Mapped
 *     to a staging `linked_product_status` (and never to a buyer
 *     promise like "guaranteed cashback").
 */
export type AddlivetagSource = "shopee" | "food";

export type AddlivetagResourceType = "orders" | "items" | "clicks";

/**
 * Addlivetag commission lifecycle as reported by the API.
 *
 * The value `pending` is intentionally included even though Addlivetag
 * does not currently emit it, so the staging ingest does not have to
 * change when a future version of the source starts reporting
 * pending commissions. All other values are real today.
 */
export type AddlivetagStatus =
  | "pending"
  | "approved"
  | "rejected";

/**
 * Raw row shape as Addlivetag returns it from its REST API.
 *
 * Every field is optional because Addlivetag documents optional
 * fields. The normalizer is the only layer that asserts presence.
 */
export interface AddlivetagRawRow {
  readonly id?: string;
  readonly order_id?: string;
  readonly order_status?: string;
  readonly checkout_id?: string;
  readonly item_id?: string;
  readonly shop_id?: string;
  readonly model_id?: string;
  readonly promotion_id?: string;
  readonly quantity?: string | number;
  readonly order_value?: string | number;
  readonly total_product_commission?: string | number;
  readonly total_order_commission?: string | number;
  readonly net_affiliate_commission?: string | number;
  readonly refunded_amount?: string | number;
  readonly linked_product_status?: string;
  readonly sub_id1?: string;
  readonly sub_id2?: string;
  readonly sub_id3?: string;
  readonly sub_id4?: string;
  readonly sub_id5?: string;
  readonly channel?: string;
  readonly ordered_at?: string;
  readonly completed_at?: string;
  readonly clicked_at?: string;
}

/**
 * Shape Addlivetag returns for its `clicks` endpoint.
 *
 * Click rows are recorded as a SAFE INTERNAL audit model in Phase
 * 20H.8. They are never joined to `shopee_purchase_intents` and
 * never claimed to be the click that produced an order.
 */
export interface AddlivetagRawClickRow {
  readonly click_id?: string;
  readonly click_token?: string;
  readonly sub_id1?: string;
  readonly sub_id2?: string;
  readonly item_id?: string;
  readonly shop_id?: string;
  readonly clicked_at?: string;
  readonly channel?: string;
}

/**
 * Normalized row ready to be written into `shopee_csv_rows`.
 *
 * This is the canonical shape produced by the Addlivetag normalizer.
 * Field names mirror the staging table exactly so the staging
 * service does not have to re-translate.
 */
export interface AddlivetagNormalizedRow {
  readonly externalOrderId: string | null;
  readonly checkoutId: string | null;
  readonly orderStatus: string | null;
  readonly orderedAt: string | null;
  readonly completedAt: string | null;
  readonly clickedAt: string | null;
  readonly shopId: string | null;
  readonly itemId: string | null;
  readonly modelId: string | null;
  readonly promotionId: string | null;
  readonly quantity: number | null;
  readonly orderValue: string | null;
  readonly refundedAmount: string | null;
  readonly totalProductCommission: string | null;
  readonly totalOrderCommission: string | null;
  readonly netAffiliateCommission: string | null;
  readonly linkedProductStatus: string | null;
  readonly sourceSubId1: string | null;
  readonly sourceSubId2: string | null;
  readonly sourceSubId3: string | null;
  readonly sourceSubId4: string | null;
  readonly sourceSubId5: string | null;
  readonly channel: string | null;
}

/**
 * Normalized click row ready to be written into a safe internal click
 * audit table. The Phase 20H.8 adapter records these as a
 * server-side model only -- no buyer-facing claim, no click-level
 * attribution assertion.
 */
export interface AddlivetagNormalizedClickRow {
  readonly clickId: string;
  readonly clickToken: string | null;
  readonly itemId: string | null;
  readonly shopId: string | null;
  readonly sourceSubId1: string | null;
  readonly sourceSubId2: string | null;
  readonly channel: string | null;
  readonly clickedAt: string | null;
}

/**
 * Discriminated union result returned by the row normalizer.
 *
 * Every reason is a safe machine-readable code. The `details` field
 * never carries the raw sub_id, raw row body, raw token, or any
 * internal identifier.
 */
export type AddlivetagNormalizeResult =
  | { kind: "ok"; row: AddlivetagNormalizedRow }
  | { kind: "ok_click"; row: AddlivetagNormalizedClickRow }
  | { kind: "missing_sub_id"; reason: "source_sub_id1_null" }
  | { kind: "malformed_sub_id"; reason: "invalid_attribution_format" }
  | { kind: "malformed_row"; reason: "missing_external_order_id" }
  | { kind: "malformed_row"; reason: "missing_item_id" }
  | { kind: "malformed_row"; reason: "missing_click_id" };

/**
 * Per-batch summary returned by the import service.
 *
 * The adapter only feeds the existing reconciliation pipeline; the
 * `result` array summarizes each row's reconciliation outcome so the
 * admin page can render a flat audit list.
 */
export interface AddlivetagImportResult {
  readonly batchId: string;
  readonly source: AddlivetagSource;
  readonly type: AddlivetagResourceType;
  readonly pagesFetched: number;
  readonly rowsFetched: number;
  readonly rowsStaged: number;
  readonly rowsDuplicate: number;
  readonly rowsReconciled: number;
  readonly rowsRejected: number;
  readonly dryRun: boolean;
  readonly outcome: AddlivetagRowOutcome[];
}

export type AddlivetagRowOutcome =
  | { kind: "promoted"; stagedRowId: string; conversionId: string }
  | { kind: "duplicate"; stagedRowId: string }
  | { kind: "rejected"; reason: string; rowNumber: number }
  | { kind: "missing_sub_id"; rowNumber: number }
  | { kind: "malformed_sub_id"; rowNumber: number }
  | { kind: "malformed_row"; rowNumber: number; reason: string }
  | { kind: "click_recorded"; clickId: string };

/**
 * Pagination cursor for the import service.
 *
 * The Addlivetag API exposes `from`/`to`/`page`/`page_size`; the
 * orchestrator pages through them in order, stopping when the API
 * returns a page with fewer rows than `page_size`.
 */
export interface AddlivetagPageRequest {
  readonly from: string;
  readonly to: string;
  readonly source: AddlivetagSource;
  readonly type: AddlivetagResourceType;
  readonly page: number;
  readonly pageSize: number;
}

/**
 * The HTTP client returns this shape on success. The client NEVER
 * includes the X-API-Key value (or any of its substrings) here.
 */
export interface AddlivetagPageResponse {
  readonly request: AddlivetagPageRequest;
  readonly rows: ReadonlyArray<AddlivetagRawRow | AddlivetagRawClickRow>;
  readonly pageSize: number;
  readonly totalPages: number | null;
}
