/**
 * Pure database-row to domain mapping for `conversions`.
 *
 * Lives outside `publisher-conversion.repository.ts` so the mapping can be
 * unit-tested without pulling in the `server-only` Supabase client. The
 * repository simply forwards raw database rows through mapConversionRow.
 *
 * Validation is performed eagerly at the database boundary:
 *
 * - Status strings are validated against the canonical CONVERSION_STATUSES
 *   tuple. An unknown database status throws instead of being silently
 *   coerced to ConversionStatus.
 * - Money columns are validated as non-negative safe integers. Database
 *   rows that violate the SQL check constraints still surface at the
 *   repository layer as explicit errors instead of corrupting the domain.
 * - Required identifier columns are validated as non-empty trimmed strings
 *   so the branded `ConversionId`-family casts do not silently propagate
 *   null or empty input.
 * - Required and optional timestamps are validated as non-empty trimmed
 *   strings that parse as a real Date. Optional timestamps additionally
 *   accept `null` and map it to `undefined`.
 */

import {
  CONVERSION_STATUSES,
  SETTLEMENT_STATUSES,
  VALIDATION_STATUSES,
  type Conversion,
  type ConversionStatus,
  type Money,
  type SettlementStatus,
  type ValidationStatus,
} from "@/types/affiliate";

/**
 * Supabase returns bigint columns as either number or string. The database
 * check constraint guarantees non-negative integers, but a stringified value
 * may arrive from a JS driver that does not parse bigints into the
 * safe-integer range. Repository callers therefore go through
 * parseConversionMoneyAmount.
 */
export type DatabaseMoneyValue = number | string;

/**
 * Row shape coming back from Supabase. The runtime validators in this
 * module accept `unknown` for every cell so a database row that violates
 * the SQL check constraints surfaces as an explicit error rather than
 * silently corrupting the domain.
 */
export interface ConversionDatabaseRow {
  id: unknown;
  external_order_id: unknown;
  publisher_id: unknown;
  advertiser_id: unknown;
  campaign_id: unknown;
  offer_id: unknown;
  tracking_link_id: unknown;
  status: unknown;
  order_amount: unknown;
  network_commission: unknown;
  user_cashback: unknown;
  platform_profit: unknown;
  occurred_at: unknown;
  approved_at: unknown;
  payable_at: unknown;
  paid_at: unknown;
  rejected_at: unknown;
  rejected_reason: unknown;
  /**
   * Phase 20G.2a additive foundation.
   */
  source_conversion_key: unknown;
  /**
   * Phase 20G.2a additive foundation.
   */
  validation_status: unknown;
  /**
   * Phase 20G.2a additive foundation.
   */
  settlement_status: unknown;
  /**
   * Phase 20G.2a additive foundation.
   */
  ingestion_event_id: unknown;
}

const conversionStatusSet: ReadonlySet<string> = new Set(
  CONVERSION_STATUSES,
);

const validationStatusSet: ReadonlySet<string> = new Set(
  VALIDATION_STATUSES,
);

const settlementStatusSet: ReadonlySet<string> = new Set(
  SETTLEMENT_STATUSES,
);

const REQUIRED_IDENTIFIER_FIELDS = [
  "id",
  "external_order_id",
  "publisher_id",
  "advertiser_id",
  "campaign_id",
  "offer_id",
  "tracking_link_id",
] as const satisfies readonly (keyof ConversionDatabaseRow)[];

export class InvalidConversionStatusError extends Error {
  readonly status: string;

  constructor(status: string) {
    super("Unsupported conversion status: " + status);
    this.name = "InvalidConversionStatusError";
    this.status = status;
  }
}

export class InvalidConversionMoneyError extends Error {
  readonly fieldName: string;

  constructor(fieldName: string) {
    super(
      "Invalid conversion money value for " +
        fieldName +
        ": expected a non-negative safe integer VND amount.",
    );
    this.name = "InvalidConversionMoneyError";
    this.fieldName = fieldName;
  }
}

export class InvalidConversionTimestampError extends Error {
  readonly fieldName: string;
  readonly value: unknown;

  constructor(fieldName: string, value: unknown) {
    super(
      "Invalid conversion timestamp for " +
        fieldName +
        ": " +
        JSON.stringify(value),
    );
    this.name = "InvalidConversionTimestampError";
    this.fieldName = fieldName;
    this.value = value;
  }
}

export class InvalidConversionIdentifierError extends Error {
  readonly fieldName: string;
  readonly value: unknown;

  constructor(fieldName: string, value: unknown) {
    super(
      "Invalid conversion identifier for " +
        fieldName +
        ": expected a non-empty string.",
    );
    this.name = "InvalidConversionIdentifierError";
    this.fieldName = fieldName;
    this.value = value;
  }
}

export class InvalidConversionRejectedReasonError extends Error {
  readonly value: unknown;

  constructor(value: unknown) {
    super(
      "Invalid conversion rejected_reason: expected null or a string.",
    );
    this.name = "InvalidConversionRejectedReasonError";
    this.value = value;
  }
}

/**
 * Phase 20G.2a additive foundation.
 */
export class InvalidConversionValidationStatusError extends Error {
  readonly value: unknown;

  constructor(value: unknown) {
    super(
      "Invalid conversion validation_status: " +
        JSON.stringify(value),
    );
    this.name = "InvalidConversionValidationStatusError";
    this.value = value;
  }
}

/**
 * Phase 20G.2a additive foundation.
 */
export class InvalidConversionSettlementStatusError extends Error {
  readonly value: unknown;

  constructor(value: unknown) {
    super(
      "Invalid conversion settlement_status: " +
        JSON.stringify(value),
    );
    this.name = "InvalidConversionSettlementStatusError";
    this.value = value;
  }
}

/**
 * Phase 20G.2a additive foundation.
 */
export class InvalidConversionSourceKeyError extends Error {
  readonly value: unknown;

  constructor(value: unknown) {
    super(
      "Invalid conversion source_conversion_key: expected null or a 64-char lowercase hex SHA-256 digest.",
    );
    this.name = "InvalidConversionSourceKeyError";
    this.value = value;
  }
}

/**
 * Phase 20G.2a additive foundation.
 */
export class InvalidConversionIngestionEventIdError extends Error {
  readonly value: unknown;

  constructor(value: unknown) {
    super(
      "Invalid conversion ingestion_event_id: expected null or a canonical UUID string.",
    );
    this.name = "InvalidConversionIngestionEventIdError";
    this.value = value;
  }
}

/**
 * Type guard that confirms a runtime string belongs to the canonical
 * ConversionStatus union without an unchecked cast. The return value is
 * only assigned to a ConversionStatus-typed slot after this guard returns
 * true.
 */
function isConversionStatus(value: unknown): value is ConversionStatus {
  return typeof value === "string" && conversionStatusSet.has(value);
}

/**
 * Validate that the database status belongs to the canonical set without
 * silently coercing it through an unchecked `as` cast.
 */
export function parseConversionStatus(value: unknown): ConversionStatus {
  if (!isConversionStatus(value)) {
    throw new InvalidConversionStatusError(String(value));
  }

  return value;
}

/**
 * Validate that a database money column decodes to a non-negative safe
 * integer. Throws InvalidConversionMoneyError otherwise.
 *
 * The contract is explicit so database rows that violate the SQL check
 * constraints surface at the repository layer as typed errors instead of
 * silently corrupting the domain with a coerced `0`.
 *
 * Accepted:
 *
 * - finite non-negative integer `number`;
 * - decimal-integer non-negative `string` (for example `"123456"` as
 *   returned by a bigint driver). Empty strings and whitespace-only
 *   strings are rejected instead of being coerced through `Number(value)`
 *   which would silently become `0`.
 *
 * Rejected:
 *
 * - non-string and non-number values;
 * - `NaN`, `Infinity`, `-Infinity`;
 * - negative numbers or negative stringified numbers;
 * - non-integer numbers (for example `1.5` or `"1.5"`);
 * - stringified values that are not a decimal integer (for example
 *   `"1e3"`, `"0x10"`, `" 123 "`, `""`, `"   "`, `"abc"`);
 * - integers outside the `Number.MAX_SAFE_INTEGER` range.
 */
export function parseConversionMoneyAmount(
  value: unknown,
  fieldName: string,
): number {
  if (typeof value === "number") {
    if (
      !Number.isFinite(value) ||
      !Number.isInteger(value) ||
      value < 0 ||
      !Number.isSafeInteger(value)
    ) {
      throw new InvalidConversionMoneyError(fieldName);
    }
    return value;
  }

  if (typeof value === "string") {
    // Reject empty and whitespace-only strings explicitly so they cannot
    // be silently coerced to `0` through `Number("")` / `Number("   ")`.
    if (value.trim().length === 0) {
      throw new InvalidConversionMoneyError(fieldName);
    }

    // Require a strict decimal-integer shape so strings like "1e3",
    // "0x10", " 123 ", "12.0" or "+1" do not slip past the parser.
    if (!/^-?\d+$/.test(value)) {
      throw new InvalidConversionMoneyError(fieldName);
    }

    const amount = Number(value);

    if (
      !Number.isFinite(amount) ||
      !Number.isInteger(amount) ||
      amount < 0 ||
      !Number.isSafeInteger(amount)
    ) {
      throw new InvalidConversionMoneyError(fieldName);
    }

    return amount;
  }

  throw new InvalidConversionMoneyError(fieldName);
}

/**
 * Validate the optional `rejected_reason` column coming back from the
 * database. The contract is:
 *
 * - `null` becomes `undefined` (the database stores NULL when no reason
 *   was recorded);
 * - a `string` is preserved as-is so the rejection reason propagates to
 *   the domain;
 * - every other runtime shape (including `undefined`, numbers, booleans,
 *   objects, arrays, and symbols) raises
 *   {@link InvalidConversionRejectedReasonError} instead of being
 *   silently coerced to `undefined`. That keeps database-side type drift
 *   from being hidden behind a generic fallback.
 */
export function parseConversionRejectedReason(
  value: unknown,
): string | undefined {
  if (value === null) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  throw new InvalidConversionRejectedReasonError(value);
}

function assertRequiredIdentifier(
  value: unknown,
  fieldName: string,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidConversionIdentifierError(fieldName, value);
  }

  return value;
}

/**
 * Convert an ISO timestamp into a YYYY-MM-DD string anchored to the
 * Vietnam timezone. Domain consumers use the date-only form for grouping
 * and rendering; the full ISO timestamp is intentionally discarded at the
 * boundary. The required-timestamp variant throws on any non-string,
 * empty, whitespace-only, or unparseable value.
 */
function formatRequiredConversionDate(
  value: unknown,
  fieldName: string,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidConversionTimestampError(fieldName, value);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new InvalidConversionTimestampError(fieldName, value);
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new InvalidConversionTimestampError(fieldName, value);
  }

  return year + "-" + month + "-" + day;
}

/**
 * Optional-timestamp variant. `null` becomes `undefined`. Any other value
 * (non-string, empty, whitespace-only, or unparseable) throws
 * InvalidConversionTimestampError.
 */
function formatOptionalConversionDate(
  value: unknown,
  fieldName: string,
): string | undefined {
  if (value === null) {
    return undefined;
  }

  return formatRequiredConversionDate(value, fieldName);
}

function buildMoney(amount: number): Money {
  return { amount, currency: "VND" };
}

/**
 * Type guard that confirms a runtime string belongs to the canonical
 * validation lifecycle without an unchecked cast.
 */
function isValidationStatus(
  value: unknown,
): value is ValidationStatus {
  return typeof value === "string" && validationStatusSet.has(value);
}

/**
 * Type guard that confirms a runtime string belongs to the canonical
 * settlement lifecycle without an unchecked cast.
 */
function isSettlementStatus(
  value: unknown,
): value is SettlementStatus {
  return typeof value === "string" && settlementStatusSet.has(value);
}

/**
 * Validate and return the validation status, accepting `null` for legacy
 * rows. Throws `InvalidConversionValidationStatusError` for non-null
 * values that are not in the canonical lifecycle.
 */
function parseOptionalValidationStatus(
  value: unknown,
): ValidationStatus | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!isValidationStatus(value)) {
    throw new InvalidConversionValidationStatusError(value);
  }

  return value;
}

/**
 * Validate and return the settlement status, accepting `null` for legacy
 * rows. Throws `InvalidConversionSettlementStatusError` for non-null
 * values that are not in the canonical lifecycle.
 */
function parseOptionalSettlementStatus(
  value: unknown,
): SettlementStatus | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!isSettlementStatus(value)) {
    throw new InvalidConversionSettlementStatusError(value);
  }

  return value;
}

/**
 * Shape contract for `source_conversion_key`: deterministic SHA-256 hex
 * digest, lowercase, exactly 64 characters.
 */
const SOURCE_CONVERSION_KEY_PATTERN = /^[a-f0-9]{64}$/;

/**
 * Shape contract for `ingestion_event_id`: canonical 8-4-4-4-12 UUID.
 */
const INGESTION_EVENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Validate the optional `source_conversion_key` column. Accepts `null`
 * for legacy rows and a 64-char lowercase hex SHA-256 digest otherwise.
 */
function parseOptionalSourceConversionKey(
  value: unknown,
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new InvalidConversionSourceKeyError(value);
  }

  const trimmed = value.trim();

  if (trimmed.length === 0 || !SOURCE_CONVERSION_KEY_PATTERN.test(trimmed)) {
    throw new InvalidConversionSourceKeyError(value);
  }

  return trimmed;
}

/**
 * Validate the optional `ingestion_event_id` column. Accepts `null` for
 * legacy rows and a canonical UUID string otherwise.
 */
function parseOptionalIngestionEventId(
  value: unknown,
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new InvalidConversionIngestionEventIdError(value);
  }

  const trimmed = value.trim();

  if (
    trimmed.length === 0 ||
    !INGESTION_EVENT_ID_PATTERN.test(trimmed)
  ) {
    throw new InvalidConversionIngestionEventIdError(value);
  }

  return trimmed;
}

/**
 * Map a raw conversions row coming back from Supabase into the domain
 * Conversion shape. Throws on any database value that violates the
 * canonical conversion contract rather than silently coercing it.
 */
export function mapConversionRow(row: ConversionDatabaseRow): Conversion {
  for (const fieldName of REQUIRED_IDENTIFIER_FIELDS) {
    assertRequiredIdentifier(row[fieldName], fieldName);
  }

  const mapped: Conversion = {
    id: row.id as Conversion["id"],
    orderId: row.external_order_id as Conversion["orderId"],
    publisherId: row.publisher_id as Conversion["publisherId"],
    advertiserId: row.advertiser_id as Conversion["advertiserId"],
    campaignId: row.campaign_id as Conversion["campaignId"],
    offerId: row.offer_id as Conversion["offerId"],
    trackingLinkId: row.tracking_link_id as Conversion["trackingLinkId"],

    status: parseConversionStatus(row.status),

    orderAmount: buildMoney(
      parseConversionMoneyAmount(row.order_amount, "order_amount"),
    ),

    networkCommission: buildMoney(
      parseConversionMoneyAmount(
        row.network_commission,
        "network_commission",
      ),
    ),

    userCashback: buildMoney(
      parseConversionMoneyAmount(row.user_cashback, "user_cashback"),
    ),

    platformProfit: buildMoney(
      parseConversionMoneyAmount(row.platform_profit, "platform_profit"),
    ),

    occurredAt: formatRequiredConversionDate(
      row.occurred_at,
      "occurred_at",
    ),
    approvedAt: formatOptionalConversionDate(
      row.approved_at,
      "approved_at",
    ),
    payableAt: formatOptionalConversionDate(row.payable_at, "payable_at"),
    paidAt: formatOptionalConversionDate(row.paid_at, "paid_at"),
    rejectedAt: formatOptionalConversionDate(
      row.rejected_at,
      "rejected_at",
    ),
    rejectedReason: parseConversionRejectedReason(row.rejected_reason),
  };

  const sourceKey = parseOptionalSourceConversionKey(
    row.source_conversion_key,
  );
  if (sourceKey !== undefined) {
    mapped.sourceConversionKey = sourceKey;
  }

  const validation = parseOptionalValidationStatus(
    row.validation_status,
  );
  if (validation !== undefined) {
    mapped.validationStatus = validation;
  }

  const settlement = parseOptionalSettlementStatus(
    row.settlement_status,
  );
  if (settlement !== undefined) {
    mapped.settlementStatus = settlement;
  }

  const ingestionEventId = parseOptionalIngestionEventId(
    row.ingestion_event_id,
  );
  if (ingestionEventId !== undefined) {
    mapped.ingestionEventId = ingestionEventId;
  }

  return mapped;
}
