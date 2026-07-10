"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import { Buffer } from "node:buffer";

import { recordAdminAction } from "@/lib/auth/audit-log";
import { requireAdmin } from "@/lib/auth/server-guard";

import {
  buildShopeeCsvPreview,
  SHOPEE_CSV_PREVIEW_MAX_BYTES,
} from "@/lib/shopee-csv-import/shopee-csv-preview";

import {
  ShopeeCsvDuplicateFileError,
  importShopeeCsvBufferAsync,
} from "@/repositories/shopee-csv-ingestion.repository";

import type { RunShopeeCsvImportActionState } from "./action-state";
// INITIAL_RUN_SHOPEE_CSV_IMPORT_ACTION_STATE is exported from
// `./action-state` (NOT this module). Next.js forbids exporting
// non-async values from a `"use server"` file -- the initial
// state constant is a plain object and must therefore live in a
// sibling module without `"use server"`. The client form imports
// it from `./action-state` directly.

/**
 * Phase 20J -- Shopee CSV import server action.
 *
 * Boundary guarantees (defense in depth):
 *
 *   1. `requireAdmin()` runs first. The action is only reachable
 *      through `/app/admin/shopee-csv-imports` which already
 *      mounts the admin layout (which also calls `requireAdmin()`);
 *      this is the belt-and-braces second guard so a future code
 *      path (route handler, scheduled job, console call) cannot
 *      invoke the action without an admin session.
 *   2. FormData validation runs server-side. The action refuses:
 *        - missing file,
 *        - non-CSV file name / mime,
 *        - empty buffer,
 *        - files over {@link SHOPEE_CSV_PREVIEW_MAX_BYTES}.
 *   3. The CSV is re-parsed server-side via the pure preview
 *      layer before any staging write is attempted. Client-side
 *      preview data is NEVER trusted.
 *   4. When the `commit` flag is set, the canonical repository
 *      `importShopeeCsvBufferAsync` is called. That repository
 *      uses an existing drizzle transaction against the
 *      `shopee_csv_import_batches` + `shopee_csv_rows` tables.
 *      No ledger, wallet, payout, payable/paid transitions, or
 *      user-facing order writes happen here -- those are
 *      explicitly out of scope for Phase 20J.
 *   5. The action records through the audit log emitter. The
 *      emitter is currently a no-op sink (per Phase 20I.5
 *      audit-log foundation); the call site is already in place
 *      so a future persistent sink lights up automatically.
 *   6. The response shape is a discriminated union that NEVER
 *      includes internal identifiers (raw CSV, sha256 of the
 *      payload, batch UUID, etc.). The UI never receives enough
 *      information to reach into the staging table directly.
 */

// Discriminated-union response type and initial-state constant
// for `useActionState` live in `./action-state` (NOT this module)
// because Next.js forbids exporting non-async values from a
// `"use server"` file. See the import block above.

const ALLOWED_FILE_EXTENSIONS: ReadonlyArray<string> = [".csv"];
const ALLOWED_CSV_MIME_TYPES: ReadonlyArray<string> = [
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "",
];

const ERR_INVALID_FILE =
  "Vui lòng chọn một tệp CSV hợp lệ (.csv, định dạng văn bản).";
const ERR_EMPTY_FILE =
  "Tệp CSV rỗng. Vui lòng chọn một tệp có dữ liệu.";
const ERR_TOO_LARGE =
  "Tệp CSV vượt quá giới hạn 8 MB. Vui lòng tách nhỏ tệp trước khi nhập.";

function isCsvFileName(name: string): boolean {
  const lowered = name.toLowerCase();
  return ALLOWED_FILE_EXTENSIONS.some((ext) => lowered.endsWith(ext));
}

function isCsvMimeType(mime: string): boolean {
  return ALLOWED_CSV_MIME_TYPES.includes(mime.toLowerCase());
}

async function readTextFile(
  formData: FormData,
): Promise<{ buffer: Buffer; fileName: string } | null> {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return null;
  }
  const fileName = file.name || "shopee-affiliate-report.csv";
  if (!isCsvFileName(fileName)) {
    return null;
  }
  // `File.type` may be empty when the browser could not infer a
  // MIME type. Empty is allowed; any non-empty value MUST match
  // the CSV allow-list.
  if (file.type.length > 0 && !isCsvMimeType(file.type)) {
    return null;
  }
  // `File` is a Blob; the synchronous Buffer constructor only
  // accepts strings / typed arrays / ArrayBuffer, so we read the
  // bytes via `arrayBuffer()` first.
  const arrayBuffer = await file.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    fileName,
  };
}

export async function runShopeeCsvImportAction(
  _previousState: RunShopeeCsvImportActionState,
  formData: FormData,
): Promise<RunShopeeCsvImportActionState> {
  const actor = await requireAdmin("/app/admin/shopee-csv-imports");

  const commitFlag = formData.get("commit");
  const mode: "preview" | "commit" =
    commitFlag === "on" || commitFlag === "true" ? "commit" : "preview";

  const file = await readTextFile(formData);
  if (!file) {
    return { ok: false, message: ERR_INVALID_FILE };
  }
  if (file.buffer.byteLength === 0) {
    return { ok: false, message: ERR_EMPTY_FILE };
  }
  if (file.buffer.byteLength > SHOPEE_CSV_PREVIEW_MAX_BYTES) {
    return { ok: false, message: ERR_TOO_LARGE };
  }

  const preview = buildShopeeCsvPreview({
    buffer: file.buffer,
    sourceFileName: file.fileName,
  });

  // Header / column validation error: stop here, never write.
  if (preview.summary.headerValidationMessage !== null) {
    return {
      ok: false,
      message:
        "Tiêu đề CSV không khớp với hợp đồng Shopee. " +
        "Vui lòng kiểm tra lại thứ tự cột và các biến thể tiêu đề đã biết. " +
        "(Chi tiết: " +
        preview.summary.headerValidationMessage +
        ")",
    };
  }

  if (mode === "preview") {
    recordAdminAction({
      kind: "admin.shopee_csv.preview",
      actorUserId: actor.userId,
      actorRole: actor.role,
      targetType: "shopee_csv_import",
      metadata: {
        sourceFileName: preview.sourceFileName,
        sourceFileSizeBytes: preview.sourceFileSizeBytes,
        totalRows: preview.summary.totalRows,
        validRows: preview.summary.validRows,
        invalidRows: preview.summary.invalidRows,
        duplicateRows: preview.summary.duplicateRows,
      },
    });

    return { ok: true, mode: "preview", preview, importResult: null };
  }

  // commit path: re-validate via the canonical repository. The
  // repository re-runs the parser inside a drizzle transaction
  // and rejects duplicates via the file-level sha256 unique
  // constraint and the row-level fingerprint unique constraint.
  // We pass the buffer again -- the preview result is a count
  // tool, not an authoritative source of truth.
  try {
    const result = await importShopeeCsvBufferAsync(file.buffer, {
      sourceFileName: file.fileName,
    });
    revalidatePath("/app/admin/shopee-csv-imports");

    recordAdminAction({
      kind: "admin.shopee_csv.commit",
      actorUserId: actor.userId,
      actorRole: actor.role,
      targetType: "shopee_csv_import",
      targetId: result.batchId,
      metadata: {
        sourceFileName: preview.sourceFileName,
        sourceFileSizeBytes: preview.sourceFileSizeBytes,
        totalRows: result.totalRows,
        insertedRows: result.insertedRows,
        duplicateRows: result.duplicateRows,
      },
    });

    return { ok: true, mode: "commit", preview, importResult: result };
  } catch (error) {
    if (error instanceof ShopeeCsvDuplicateFileError) {
      return {
        ok: false,
        message:
          "Tệp CSV này đã được nhập trước đó (trùng sha256). " +
          "Không có dòng nào được ghi vào staging.",
      };
    }
    const message =
      error instanceof Error
        ? error.message
        : "Không thể nhập Shopee CSV vào staging.";
    return { ok: false, message };
  }
}
