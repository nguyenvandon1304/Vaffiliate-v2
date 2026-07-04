/**
 * Deterministic source_conversion_key derivation for Shopee CSV rows.
 *
 * Per docs/PHASE_20G0_ARCHITECTURE_DATA_CONTRACT.md:
 *
 *   External order identifier is a grouping key. The future ingestion
 *   contract must identify each source conversion by either a
 *   partner-provided external conversion identifier; or a deterministic
 *   source-line key generated from immutable source fields.
 *
 * Shopee CSV reports do NOT supply a per-line conversion identifier. Each
 * committed Shopee export is itself the canonical source event. A line is
 * identified by the immutable Shopee-supplied fields plus the immutable
 * commission and refund snapshot at the time of the export.
 *
 * The derivation is a pure module:
 *
 * - no database access;
 * - no clock dependency;
 * - no environment access;
 * - no per-call shared mutable state.
 *
 * Reproducibility: identical immutable Shopee source fields ALWAYS produce
 * the same 64-character lowercase hex digest.
 */
import { createHash } from "node:crypto";

export const SHOPEE_NETWORK_LABEL = "shopee";

export interface ShopeeCsvSourceLine {
  network: string;
  sourceEventId: string;
  externalOrderId: string;
  checkoutId: string;
  itemId: string;
  modelId: string;
  quantity: number;
  orderValue: string;
  totalProductCommission: string;
  refundedAmount: string;
  linkedProductStatus: string;
}

export class InvalidShopeeSourceLineError extends Error {
  readonly fieldName: string;
  readonly value: unknown;

  constructor(fieldName: string, value: unknown) {
    super(
      "Invalid Shopee CSV source-line field " +
        JSON.stringify(fieldName) +
        ": " +
        JSON.stringify(value),
    );
    this.name = "InvalidShopeeSourceLineError";
    this.fieldName = fieldName;
    this.value = value;
  }
}

const STRING_FIELDS = [
  "network",
  "sourceEventId",
  "externalOrderId",
  "checkoutId",
  "itemId",
  "modelId",
  "orderValue",
  "totalProductCommission",
  "refundedAmount",
  "linkedProductStatus",
] as const satisfies readonly (keyof ShopeeCsvSourceLine)[];

function assertNonBlankString(
  value: unknown,
  fieldName: string,
): string {
  if (typeof value !== "string") {
    throw new InvalidShopeeSourceLineError(fieldName, value);
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new InvalidShopeeSourceLineError(fieldName, value);
  }

  return trimmed;
}

function assertNonNegativeInteger(
  value: unknown,
  fieldName: string,
): number {
  if (typeof value !== "number") {
    throw new InvalidShopeeSourceLineError(fieldName, value);
  }

  if (
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0 ||
    !Number.isSafeInteger(value)
  ) {
    throw new InvalidShopeeSourceLineError(fieldName, value);
  }

  return value;
}

function validateShopeeCsvSourceLine(
  input: ShopeeCsvSourceLine,
): void {
  for (const fieldName of STRING_FIELDS) {
    assertNonBlankString(input[fieldName], fieldName);
  }

  assertNonNegativeInteger(input.quantity, "quantity");
}

/**
 * Compute the deterministic source_conversion_key for a Shopee CSV row.
 * Returns a 64-character lowercase hex SHA-256 digest.
 */
export function deriveShopeeSourceConversionKey(
  input: ShopeeCsvSourceLine,
): string {
  validateShopeeCsvSourceLine(input);

  const network = input.network.trim();
  const sourceEventId = input.sourceEventId.trim();
  const externalOrderId = input.externalOrderId.trim();
  const checkoutId = input.checkoutId.trim();
  const itemId = input.itemId.trim();
  const modelId = input.modelId.trim();
  const quantity = input.quantity;
  const orderValue = input.orderValue.trim();
  const totalProductCommission =
    input.totalProductCommission.trim();
  const refundedAmount = input.refundedAmount.trim();
  const linkedProductStatus = input.linkedProductStatus.trim();

  const hash = createHash("sha256");
  hash.update("network=" + network);
  hash.update("\n");
  hash.update("source_event_id=" + sourceEventId);
  hash.update("\n");
  hash.update("external_order_id=" + externalOrderId);
  hash.update("\n");
  hash.update("checkout_id=" + checkoutId);
  hash.update("\n");
  hash.update("item_id=" + itemId);
  hash.update("\n");
  hash.update("model_id=" + modelId);
  hash.update("\n");
  hash.update("quantity=" + quantity);
  hash.update("\n");
  hash.update("order_value=" + orderValue);
  hash.update("\n");
  hash.update(
    "total_product_commission=" + totalProductCommission,
  );
  hash.update("\n");
  hash.update("refunded_amount=" + refundedAmount);
  hash.update("\n");
  hash.update("linked_product_status=" + linkedProductStatus);
  hash.update("\n");

  return hash.digest("hex");
}
