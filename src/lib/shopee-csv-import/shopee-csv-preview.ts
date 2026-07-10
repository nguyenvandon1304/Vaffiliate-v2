/**
 * Phase 20J -- Shopee CSV import: pure preview layer.
 *
 * `parseShopeeCsvBuffer` (in `scripts/shopee-csv-parser.mjs`)
 * throws on the FIRST row that fails validation. That is the
 * right behaviour for the staging ingest path (because we want
 * a clean fail), but it is the wrong behaviour for the admin
 * preview UI, which must:
 *
 *   - show the operator how many rows are valid / invalid /
 *     duplicate-within-file,
 *   - show per-row validation messages for every malformed row,
 *   - never mutate the database,
 *   - never depend on a Supabase round-trip.
 *
 * This module is a pure wrapper that re-parses the buffer row by
 * row, accumulates per-row errors, and computes the duplicate
 * fingerprint set so the UI can render the canonical preview.
 *
 * It is intentionally server-only safe (no `import "server-only"`
 * because it has no I/O and no DB access, and the unit tests
 * need to import it from a Node `--test` runner without the
 * server-only marker tripping them).
 *
 * The module deliberately re-implements row parsing by reaching
 * into the same csv-parse options and the same contract (`assertShopeeCsvHeaders`)
 * so the contract stays the single source of truth.
 *
 * No ledger writes happen here. No wallet writes. No buyer UI.
 * No TikTok Shop handling -- Phase 20J is Shopee-only.
 */

import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";

import { parse as csvParse } from "csv-parse/sync";

import {
  SHOPEE_CSV_FIELDS,
  SHOPEE_CSV_HEADERS,
  assertShopeeCsvHeaders,
} from "../../../scripts/shopee-csv-contract.mjs";

export const SHOPEE_CSV_PREVIEW_MAX_BYTES = 8 * 1024 * 1024; // 8 MiB
const MAX_POSTGRES_INTEGER = 2_147_483_647;
const SHOPEE_TIME_ZONE_OFFSET = "+07:00";

export interface ShopeeCsvPreviewRow {
  /** 1-indexed row number in the source CSV (header is row 1). */
  readonly sourceRowNumber: number;
  /** Stable fingerprint of the canonicalised raw row. */
  readonly rowFingerprintSha256: string;
  /** True when the row passed all per-row validators. */
  readonly valid: boolean;
  /** True when the row's fingerprint matches another row in the same file. */
  readonly duplicate: boolean;
  /** Normalised Shopee external order id, or null if missing/invalid. */
  readonly externalOrderId: string | null;
  /** Normalised Shopee checkout id, or null if missing. */
  readonly checkoutId: string | null;
  /** Normalised Shopee order status, or null if missing/invalid. */
  readonly orderStatus: string | null;
  /** Per-row error messages, never containing secrets. */
  readonly errors: ReadonlyArray<string>;
}

export interface ShopeeCsvPreviewSummary {
  readonly totalRows: number;
  readonly validRows: number;
  readonly invalidRows: number;
  readonly duplicateRows: number;
  readonly missingColumns: ReadonlyArray<string>;
  readonly headerValidationMessage: string | null;
}

export interface ShopeeCsvPreview {
  readonly parserVersion: "shopee-affiliate-commission-v1";
  readonly sourceFileName: string;
  readonly sourceFileSizeBytes: number;
  readonly sourceFileSha256: string;
  readonly sourceHeaders: ReadonlyArray<string>;
  readonly summary: ShopeeCsvPreviewSummary;
  readonly rows: ReadonlyArray<ShopeeCsvPreviewRow>;
  /** Preview is capped to keep the admin page responsive. */
  readonly previewTruncated: boolean;
  readonly maxPreviewRows: number;
}

export interface BuildShopeeCsvPreviewInput {
  readonly buffer: Buffer | string;
  readonly sourceFileName?: string;
  readonly maxPreviewRows?: number;
}

const DEFAULT_MAX_PREVIEW_ROWS = 50;

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function normaliseText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "--") {
    return null;
  }
  return trimmed;
}

function normaliseRequiredText(
  record: Record<string, unknown>,
  header: string,
): { value: string | null; error: string | null } {
  const raw = record[header];
  if (typeof raw !== "string") {
    return {
      value: null,
      error: `CSV field "${header}" must contain a string value.`,
    };
  }
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "--") {
    return {
      value: null,
      error: `CSV field "${header}" must not be blank.`,
    };
  }
  return { value: trimmed, error: null };
}

function normaliseNullableInteger(
  record: Record<string, unknown>,
  header: string,
): { value: number | null; error: string | null } {
  const normalised = normaliseText(record[header]);
  if (normalised === null) {
    return { value: null, error: null };
  }
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(normalised)) {
    return {
      value: null,
      error: `CSV field "${header}" is not a valid integer: "${normalised}".`,
    };
  }
  const parsed = Number(normalised.replaceAll(",", ""));
  if (!Number.isSafeInteger(parsed) || parsed > MAX_POSTGRES_INTEGER) {
    return {
      value: null,
      error: `CSV field "${header}" exceeds the supported integer range: "${normalised}".`,
    };
  }
  return { value: parsed, error: null };
}

function normaliseNullableDecimal(
  record: Record<string, unknown>,
  header: string,
): { value: string | null; error: string | null } {
  const normalised = normaliseText(record[header]);
  if (normalised === null) {
    return { value: null, error: null };
  }
  if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,5})?$/.test(normalised)) {
    return {
      value: null,
      error: `CSV field "${header}" is not a valid numeric(20,5) value: "${normalised}".`,
    };
  }
  const stripped = normalised.replaceAll(",", "");
  const unsigned = stripped.startsWith("-") ? stripped.slice(1) : stripped;
  const [intPart] = unsigned.split(".");
  if (intPart.length > 15) {
    return {
      value: null,
      error: `CSV field "${header}" exceeds numeric(20,5): "${normalised}".`,
    };
  }
  return { value: stripped, error: null };
}

function normaliseNullableDateTime(
  record: Record<string, unknown>,
  header: string,
): { value: string | null; error: string | null } {
  const normalised = normaliseText(record[header]);
  if (normalised === null) {
    return { value: null, error: null };
  }
  const match = normalised.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/,
  );
  if (match === null) {
    return {
      value: null,
      error: `CSV field "${header}" has an unsupported datetime: "${normalised}".`,
    };
  }
  const [, y, mo, d, h, mi, s] = match;
  const local = `${y}-${mo}-${d}T${h}:${mi}:${s}`;
  const parsed = new Date(`${local}${SHOPEE_TIME_ZONE_OFFSET}`);
  if (Number.isNaN(parsed.getTime())) {
    return {
      value: null,
      error: `CSV field "${header}" contains an invalid datetime: "${normalised}".`,
    };
  }
  const roundTrip = new Date(parsed.getTime() + 7 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 19);
  if (roundTrip !== local) {
    return {
      value: null,
      error: `CSV field "${header}" contains an invalid calendar datetime: "${normalised}".`,
    };
  }
  return { value: parsed.toISOString(), error: null };
}

function normaliseRow(
  record: Record<string, unknown>,
): { row: ShopeeCsvPreviewRow; fingerprint: string } {
  const errors: string[] = [];

  // externalOrderId: required
  const externalOrder = normaliseRequiredText(
    record,
    SHOPEE_CSV_FIELDS.externalOrderId,
  );
  if (externalOrder.error) errors.push(externalOrder.error);

  // orderStatus: required
  const orderStatus = normaliseRequiredText(
    record,
    SHOPEE_CSV_FIELDS.orderStatus,
  );
  if (orderStatus.error) errors.push(orderStatus.error);

  // Nullable text columns -- missing/empty is allowed, but
  // a non-string value is rejected so the operator sees a clear
  // error instead of a silent "".
  for (const header of [
    SHOPEE_CSV_FIELDS.checkoutId,
    SHOPEE_CSV_FIELDS.shopId,
    SHOPEE_CSV_FIELDS.itemId,
    SHOPEE_CSV_FIELDS.modelId,
    SHOPEE_CSV_FIELDS.promotionId,
    SHOPEE_CSV_FIELDS.linkedProductStatus,
    SHOPEE_CSV_FIELDS.sourceSubId1,
    SHOPEE_CSV_FIELDS.sourceSubId2,
    SHOPEE_CSV_FIELDS.sourceSubId3,
    SHOPEE_CSV_FIELDS.sourceSubId4,
    SHOPEE_CSV_FIELDS.sourceSubId5,
    SHOPEE_CSV_FIELDS.channel,
  ]) {
    const raw = record[header];
    if (raw !== undefined && raw !== null && typeof raw !== "string") {
      errors.push(
        `CSV field "${header}" must contain a string value when present.`,
      );
    }
  }

  // Nullable numeric columns
  const quantity = normaliseNullableInteger(
    record,
    SHOPEE_CSV_FIELDS.quantity,
  );
  if (quantity.error) errors.push(quantity.error);

  const decimalChecks: ReadonlyArray<readonly [string, string]> = [
    [SHOPEE_CSV_FIELDS.orderValue, "decimal"],
    [SHOPEE_CSV_FIELDS.refundedAmount, "decimal"],
    [SHOPEE_CSV_FIELDS.totalProductCommission, "decimal"],
    [SHOPEE_CSV_FIELDS.totalOrderCommission, "decimal"],
    [SHOPEE_CSV_FIELDS.netAffiliateCommission, "decimal"],
  ];
  for (const [header] of decimalChecks) {
    const result = normaliseNullableDecimal(record, header);
    if (result.error) errors.push(result.error);
  }

  // Nullable datetime columns
  for (const header of [
    SHOPEE_CSV_FIELDS.orderedAt,
    SHOPEE_CSV_FIELDS.completedAt,
    SHOPEE_CSV_FIELDS.clickedAt,
  ]) {
    const result = normaliseNullableDateTime(record, header);
    if (result.error) errors.push(result.error);
  }

  // Build a stable fingerprint from the canonical raw row.
  const canonicalValues = SHOPEE_CSV_HEADERS.map((header) => {
    const raw = record[header];
    return typeof raw === "string" ? raw : "";
  });
  const fingerprint = sha256(JSON.stringify(canonicalValues));

  return {
    row: {
      sourceRowNumber: 0, // filled in by caller
      rowFingerprintSha256: fingerprint,
      valid: errors.length === 0,
      duplicate: false, // filled in by caller
      externalOrderId: externalOrder.value,
      checkoutId: normaliseText(record[SHOPEE_CSV_FIELDS.checkoutId]),
      orderStatus: orderStatus.value,
      errors,
    },
    fingerprint,
  };
}

export function buildShopeeCsvPreview(
  input: BuildShopeeCsvPreviewInput,
): ShopeeCsvPreview {
  const buffer = Buffer.isBuffer(input.buffer)
    ? input.buffer
    : Buffer.from(input.buffer, "utf8");
  const sourceFileName = (
    input.sourceFileName ?? "shopee-affiliate-report.csv"
  )
    .split(/[\\/]/)
    .pop() as string;
  const sourceFileSha256 = sha256(buffer);
  const sourceFileSizeBytes = buffer.byteLength;

  const maxPreviewRows =
    input.maxPreviewRows ?? DEFAULT_MAX_PREVIEW_ROWS;

  // csv-parse/sync with the exact same options the canonical
  // parser uses (bom: true, relax_column_count: false,
  // skip_empty_lines: true, trim: false). We let header
  // validation happen via the shared contract.
  let parsed: Array<{ record: Record<string, unknown>; lines: number }>;
  let headerValidationMessage: string | null = null;
  let missingColumns: ReadonlyArray<string> = [];
  try {
    parsed = csvParse(buffer, {
      bom: true,
      columns: (headers: string[]) => {
        // Run the contract's strict assertion. On failure
        // capture the missing columns so the UI can show them
        // instead of just "expected 47 headers".
        try {
          assertShopeeCsvHeaders(headers);
          return headers;
        } catch (error) {
          headerValidationMessage =
            error instanceof Error
              ? error.message
              : "CSV header validation failed.";
          missingColumns = computeMissingColumns(headers);
          return headers;
        }
      },
      info: true,
      relax_column_count: false,
      skip_empty_lines: true,
      trim: false,
    }) as Array<{ record: Record<string, unknown>; lines: number }>;
  } catch (error) {
    // Parser-level failure (e.g. malformed CSV). Surface a
    // clean summary that the UI can render as a preview-failure
    // banner. No raw error stacks leak through.
    const message =
      error instanceof Error
        ? error.message
        : "CSV file could not be parsed.";
    return {
      parserVersion: "shopee-affiliate-commission-v1",
      sourceFileName,
      sourceFileSizeBytes,
      sourceFileSha256,
      sourceHeaders: [],
      summary: {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        duplicateRows: 0,
        missingColumns: [],
        headerValidationMessage: message,
      },
      rows: [],
      previewTruncated: false,
      maxPreviewRows,
    };
  }

  if (headerValidationMessage !== null) {
    return {
      parserVersion: "shopee-affiliate-commission-v1",
      sourceFileName,
      sourceFileSizeBytes,
      sourceFileSha256,
      sourceHeaders: SHOPEE_CSV_HEADERS,
      summary: {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        duplicateRows: 0,
        missingColumns,
        headerValidationMessage,
      },
      rows: [],
      previewTruncated: false,
      maxPreviewRows,
    };
  }

  // Two-pass: first collect fingerprints to compute duplicate
  // flags, then assign per-row metadata.
  const fingerprints = new Map<string, number>();
  const rowsByIndex = parsed.map(({ record, lines }, index) => {
    const { row, fingerprint } = normaliseRow(record);
    const sourceRowNumber = Number.isInteger(lines)
      ? (lines as number)
      : index + 2; // +1 for header, +1 for 1-indexing
    const withNumber: ShopeeCsvPreviewRow = {
      ...row,
      sourceRowNumber,
    };
    fingerprints.set(
      fingerprint,
      (fingerprints.get(fingerprint) ?? 0) + 1,
    );
    return withNumber;
  });

  const seenFingerprints = new Set<string>();
  let validRows = 0;
  let invalidRows = 0;
  let duplicateRows = 0;
  const finalRows = rowsByIndex.map((row) => {
    const isDuplicate = seenFingerprints.has(row.rowFingerprintSha256);
    if (isDuplicate) duplicateRows += 1;
    seenFingerprints.add(row.rowFingerprintSha256);
    const tagged: ShopeeCsvPreviewRow = {
      ...row,
      duplicate: isDuplicate,
    };
    if (row.valid && !isDuplicate) {
      validRows += 1;
    } else if (!row.valid) {
      invalidRows += 1;
    }
    return tagged;
  });

  const previewTruncated = finalRows.length > maxPreviewRows;
  const truncatedRows = previewTruncated
    ? finalRows.slice(0, maxPreviewRows)
    : finalRows;

  return {
    parserVersion: "shopee-affiliate-commission-v1",
    sourceFileName,
    sourceFileSizeBytes,
    sourceFileSha256,
    sourceHeaders: SHOPEE_CSV_HEADERS,
    summary: {
      totalRows: finalRows.length,
      validRows,
      invalidRows,
      duplicateRows,
      missingColumns: [],
      headerValidationMessage: null,
    },
    rows: truncatedRows,
    previewTruncated,
    maxPreviewRows,
  };
}

function computeMissingColumns(actualHeaders: ReadonlyArray<string>): ReadonlyArray<string> {
  return SHOPEE_CSV_HEADERS.filter(
    (expected) => !actualHeaders.includes(expected),
  );
}
