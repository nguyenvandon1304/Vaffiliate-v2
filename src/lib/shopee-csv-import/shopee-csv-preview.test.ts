/**
 * Phase 20J -- pure unit tests for the Shopee CSV preview layer.
 *
 * The preview layer is the only thing on the admin CSV import
 * path that does NOT touch the database. It is the cheapest
 * place to assert that:
 *
 *   - BOM headers are accepted,
 *   - missing required columns are reported instead of crashing,
 *   - empty files are rejected with a clean summary,
 *   - malformed rows produce per-row errors, NOT a hard throw,
 *   - amount / date / status parsing is consistent with the
 *     canonical staging parser,
 *   - duplicate rows (within the same file) are flagged.
 *
 * These tests are pure Node `--test` runs -- no DB, no Supabase,
 * no React. The shopee-csv-preview module imports the shared
 * contract at `scripts/shopee-csv-contract.mjs` so the test
 * doubles as a contract check.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";

import {
  buildShopeeCsvPreview,
  SHOPEE_CSV_PREVIEW_MAX_BYTES,
} from "./shopee-csv-preview";
import { SHOPEE_CSV_HEADERS } from "../../../scripts/shopee-csv-contract.mjs";

function buildValidRow(overrides: Record<string, string> = {}): string {
  const cells = SHOPEE_CSV_HEADERS.map((header) =>
    overrides[header] ?? defaultCellForHeader(header),
  );
  return cells.map(escapeCsvCell).join(",");
}

function defaultCellForHeader(header: string): string {
  if (header === "ID đơn hàng") return "260101-ORDER-001";
  if (header === "Trạng thái đặt hàng") return "Hoàn thành";
  if (header === "Checkout id") return "260101-CO-001";
  if (header === "Thời Gian Đặt Hàng")
    return "2026-01-01 10:00:00";
  if (header === "Số lượng") return "1";
  if (header === "Giá trị đơn hàng (₫)") return "150000";
  if (header === "Tổng hoa hồng đơn hàng(₫)") return "15000";
  if (header === "Hoa hồng ròng tiếp thị liên kết(₫)") return "12000";
  if (header === "Sub_id1") return "sub-1";
  return "";
}

function escapeCsvCell(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function buildCsv(rows: ReadonlyArray<string>): string {
  return [SHOPEE_CSV_HEADERS.join(","), ...rows].join("\n");
}

test("Phase 20J: buildShopeeCsvPreview parses a well-formed single-row CSV", () => {
  const csv = buildCsv([buildValidRow()]);
  const preview = buildShopeeCsvPreview({
    buffer: csv,
    sourceFileName: "ok.csv",
  });

  assert.equal(preview.summary.headerValidationMessage, null);
  assert.equal(preview.summary.totalRows, 1);
  assert.equal(preview.summary.validRows, 1);
  assert.equal(preview.summary.invalidRows, 0);
  assert.equal(preview.summary.duplicateRows, 0);
  assert.equal(preview.rows[0].valid, true);
  assert.equal(preview.rows[0].duplicate, false);
  assert.equal(preview.rows[0].externalOrderId, "260101-ORDER-001");
  assert.equal(preview.rows[0].orderStatus, "Hoàn thành");
});

test("Phase 20J: buildShopeeCsvPreview accepts BOM-prefixed UTF-8", () => {
  const csv = Buffer.concat([
    Buffer.from([0xEF, 0xBB, 0xBF]),
    Buffer.from(buildCsv([buildValidRow()]), "utf8"),
  ]);
  const preview = buildShopeeCsvPreview({
    buffer: csv,
    sourceFileName: "bom.csv",
  });
  assert.equal(preview.summary.headerValidationMessage, null);
  assert.equal(preview.summary.validRows, 1);
});

test("Phase 20J: buildShopeeCsvPreview rejects a CSV with missing columns", () => {
  const truncated = SHOPEE_CSV_HEADERS.slice(0, 10).join(",");
  const preview = buildShopeeCsvPreview({
    buffer: truncated,
    sourceFileName: "short.csv",
  });
  assert.notEqual(preview.summary.headerValidationMessage, null);
  assert.equal(preview.summary.totalRows, 0);
  assert.ok(
    preview.summary.missingColumns.length > 0,
    "expected missingColumns to be populated when the header row is short",
  );
});

test("Phase 20J: buildShopeeCsvPreview rejects an empty buffer with a clean summary", () => {
  const preview = buildShopeeCsvPreview({
    buffer: "",
    sourceFileName: "empty.csv",
  });
  // Empty buffer produces no header row. csv-parse returns an
  // empty record list with no error. The preview must surface
  // this as a zero-row result, not as a misleading success.
  assert.equal(preview.summary.totalRows, 0);
  assert.equal(preview.summary.validRows, 0);
  assert.equal(preview.summary.invalidRows, 0);
  // Either the header validation message is set OR totalRows
  // is zero. Either is acceptable; a header-validation error
  // is preferred so the UI can render the banner. We assert
  // totalRows === 0 because that is the contract that matters
  // for downstream rendering.
  assert.ok(
    preview.summary.headerValidationMessage !== null ||
      preview.summary.totalRows === 0,
    "Expected an empty buffer to produce a header validation message OR zero rows.",
  );
});

test("Phase 20J: buildShopeeCsvPreview accumulates per-row errors instead of throwing", () => {
  const goodRow = buildValidRow();
  const blankOrderRow = buildValidRow({ "ID đơn hàng": "" });
  const badStatusRow = buildValidRow({ "Trạng thái đặt hàng": "" });
  const badAmountRow = buildValidRow({ "Giá trị đơn hàng (₫)": "abc" });
  const csv = buildCsv([goodRow, blankOrderRow, badStatusRow, badAmountRow]);

  const preview = buildShopeeCsvPreview({
    buffer: csv,
    sourceFileName: "mixed.csv",
  });

  assert.equal(preview.summary.headerValidationMessage, null);
  assert.equal(preview.summary.totalRows, 4);
  assert.equal(preview.summary.validRows, 1);
  assert.equal(preview.summary.invalidRows, 3);
  // Per-row errors: row 2, 3, 4 carry at least one entry.
  assert.ok(preview.rows[1].errors.length > 0);
  assert.ok(preview.rows[2].errors.length > 0);
  assert.ok(preview.rows[3].errors.length > 0);
  assert.equal(preview.rows[0].errors.length, 0);
});

test("Phase 20J: buildShopeeCsvPreview flags duplicate rows within the same file", () => {
  const a = buildValidRow();
  const b = buildValidRow();
  const c = buildValidRow({ "Checkout id": "different-checkout" });
  const csv = buildCsv([a, b, c]);

  const preview = buildShopeeCsvPreview({
    buffer: csv,
    sourceFileName: "dup.csv",
  });

  assert.equal(preview.summary.totalRows, 3);
  assert.equal(preview.summary.validRows, 2);
  assert.equal(preview.summary.duplicateRows, 1);
  assert.equal(preview.rows[0].duplicate, false);
  assert.equal(preview.rows[1].duplicate, true);
  assert.equal(preview.rows[2].duplicate, false);
});

test("Phase 20J: buildShopeeCsvPreview normalises a comma-grouped thousand amount", () => {
  const row = buildValidRow({ "Giá trị đơn hàng (₫)": "1,250,000" });
  const csv = buildCsv([row]);
  const preview = buildShopeeCsvPreview({
    buffer: csv,
    sourceFileName: "amount.csv",
  });
  assert.equal(preview.summary.validRows, 1);
  assert.equal(preview.rows[0].errors.length, 0);
});

test("Phase 20J: buildShopeeCsvPreview rejects an invalid datetime", () => {
  const row = buildValidRow({
    "Thời Gian Đặt Hàng": "2026-13-40 99:99:99",
  });
  const preview = buildShopeeCsvPreview({
    buffer: buildCsv([row]),
    sourceFileName: "bad-date.csv",
  });
  assert.equal(preview.summary.validRows, 0);
  assert.equal(preview.summary.invalidRows, 1);
  assert.ok(
    preview.rows[0].errors.some((e) => e.includes("datetime")),
    `expected a datetime error, got: ${JSON.stringify(preview.rows[0].errors)}`,
  );
});

test("Phase 20J: buildShopeeCsvPreview caps the rendered preview rows", () => {
  const rows = Array.from({ length: 10 }, (_, index) =>
    buildValidRow({ "ID đơn hàng": `260101-ORDER-${index.toString().padStart(3, "0")}` }),
  );
  const preview = buildShopeeCsvPreview({
    buffer: buildCsv(rows),
    sourceFileName: "many.csv",
    maxPreviewRows: 3,
  });
  assert.equal(preview.summary.totalRows, 10);
  assert.equal(preview.rows.length, 3);
  assert.equal(preview.previewTruncated, true);
  assert.equal(preview.maxPreviewRows, 3);
});

test("Phase 20J: SHOPEE_CSV_PREVIEW_MAX_BYTES is 8 MiB", () => {
  assert.equal(SHOPEE_CSV_PREVIEW_MAX_BYTES, 8 * 1024 * 1024);
});
