/**
 * Runtime re-export of the pure Shopee purchase-intent helper.
 *
 * The pure module (`./shopee-purchase-persistence-helper`) is the
 * source of truth for validation rules and payload construction. This
 * module simply re-exports the surface the service layer consumes so
 * `server-only` boundaries are explicit and discoverable, and so tests
 * can stub the pure module without breaking the service's import path.
 */

export {
  buildShopeePurchaseIntentPayload,
  buildShopeePurchaseIntentQuoteSnapshot,
  SHOPEE_PURCHASE_INTENT_STATUSES,
  validateShopeePurchaseIntentPayload,
} from "@/lib/cashback/shopee-purchase-persistence-helper";

export type {
  ShopeePurchaseIntentPayload,
  ShopeePurchaseIntentQuoteSnapshot,
  ShopeePurchaseIntentStatus,
} from "@/lib/cashback/shopee-purchase-persistence-helper";