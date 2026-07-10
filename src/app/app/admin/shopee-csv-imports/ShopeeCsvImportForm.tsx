"use client";

import { useActionState, useState } from "react";

import type { ShopeeCsvImportResult } from "@/repositories/shopee-csv-ingestion.repository";
import type { ShopeeCsvPreview } from "@/lib/shopee-csv-import/shopee-csv-preview";

import {
  INITIAL_RUN_SHOPEE_CSV_IMPORT_ACTION_STATE,
  type RunShopeeCsvImportActionState,
} from "./action-state";
import { runShopeeCsvImportAction } from "./actions";

/**
 * Phase 20J -- Admin-only form that drives the Shopee CSV import
 * server action. Lives at `/app/admin/shopee-csv-imports` so it
 * sits below the existing admin layout (which already calls
 * `requireAdmin()`). The form does not call any auth helper
 * itself; it only renders the fields, submits them, and renders
 * the action state.
 *
 * UX states:
 *
 *   - initial empty state (no file chosen, both buttons disabled
 *     in HTML, commit additionally disabled until validRows > 0);
 *   - selected file state (preview button enabled, commit gated
 *     by validRows > 0 AND a file currently selected);
 *   - upload/preview loading (server action pending);
 *   - validation failed (header / size / file-type errors);
 *   - preview success (counts + per-row preview table). After a
 *     successful preview the browser typically clears the file
 *     input on submit, so the form tracks file selection in
 *     React state via `onChange` and shows a clearly-worded
 *     "re-select same CSV before commit" hint;
 *   - duplicate rows warning (clearly labelled, non-blocking);
 *   - import success (batch counter, no wallet/ledger claim);
 *   - import failed (clean error banner, no stack trace).
 *
 * Preview -> commit flow (Option A, see the Phase 20J manual-QA
 * blocker fix): the admin previews a CSV, then must re-select
 * the SAME CSV from the file input and tick the commit checkbox
 * to trigger the staging import. The server action re-parses
 * and re-validates server-side on every submit (client preview
 * data is NEVER trusted), so re-selecting is safe and explicit.
 *
 * Defensive rendering mirrors the Addlivetag form: tiny pure
 * helpers accept the loose state shape and default to safe empty
 * values so the page never crashes on first paint. The defaults
 * do NOT manufacture fake success data -- a successful preview /
 * import is only rendered when `state.ok === true`.
 *
 * Visual language:
 *
 *   - Reuses Vaffiliate design tokens from `globals.css` and the
 *     same Tailwind utility patterns used elsewhere in the app
 *     (warm cream surface, soft radius, layered shadows). No new
 *     design system, no new utility classes.
 *   - All classes are local to the form (no buyer-shell imports).
 */

function readMessage(state: RunShopeeCsvImportActionState): string {
  if (!state) return "";
  if (state.ok === false && typeof state.message === "string") {
    return state.message;
  }
  return "";
}

function readPreview(
  state: RunShopeeCsvImportActionState,
): ShopeeCsvPreview | null {
  if (!state || state.ok !== true) return null;
  return state.preview;
}

function readImportResult(
  state: RunShopeeCsvImportActionState,
): ShopeeCsvImportResult | null {
  if (!state || state.ok !== true) return null;
  return state.importResult;
}

function readMode(state: RunShopeeCsvImportActionState): "preview" | "commit" | "" {
  if (!state || state.ok !== true) return "";
  return state.mode;
}

export function ShopeeCsvImportForm(): React.ReactElement {
  const [state, formAction, isPending] = useActionState<
    RunShopeeCsvImportActionState,
    FormData
  >(
    runShopeeCsvImportAction,
    INITIAL_RUN_SHOPEE_CSV_IMPORT_ACTION_STATE,
  );

  const message = readMessage(state);
  const preview = readPreview(state);
  const importResult = readImportResult(state);
  const mode = readMode(state);
  const hasError = !state?.ok && message.length > 0;
  const validRows = preview?.summary.validRows ?? 0;
  const hasPreview = preview !== null;
  const headerInvalid =
    hasPreview && preview.summary.headerValidationMessage !== null;
  const missingColumns = preview?.summary.missingColumns ?? [];
  const hasPreviewRows = hasPreview && preview.rows.length > 0;

  // Track file selection in React state. The browser clears the
  // <input type="file"> value on every form submit (it is not
  // part of React's controlled state), so we capture the latest
  // selection through `onChange` and use it to gate the commit
  // button as well as to surface the re-select hint below.
  const [fileSelected, setFileSelected] = useState(false);
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const files = event.currentTarget.files;
    setFileSelected(files !== null && files.length > 0);
  };

  // After a successful preview the file input typically resets
  // (form submit clears <input type="file">). Show a clear
  // Vietnamese hint telling the admin to re-select the SAME CSV
  // before they tick the commit checkbox and click "Nhập vào
  // staging". The server action re-validates server-side so the
  // re-selection is the explicit, low-trust way to drive the
  // commit step (Option A from the Phase 20J manual-QA blocker
  // fix).
  const hasSuccessfulPreview =
    hasPreview && !headerInvalid && validRows > 0 && preview !== null;
  const needsReselect =
    hasSuccessfulPreview && !fileSelected;

  return (
    <form
      action={formAction}
      encType="multipart/form-data"
      className="flex flex-col gap-5"
    >
      <FileField
        name="file"
        disabled={isPending}
        onChange={handleFileChange}
      />

      {needsReselect ? <ReselectHint /> : null}

      <CommitCheckbox
        disabled={isPending || validRows === 0 || headerInvalid}
      />

      <ActionRow
        isPending={isPending}
        mode={mode}
        previewDisabled={isPending || hasPreview}
        commitDisabled={
          isPending ||
          validRows === 0 ||
          headerInvalid ||
          !fileSelected
        }
      />

      {hasError ? <ErrorBanner message={message} /> : null}

      {hasPreview ? (
        <PreviewSummary preview={preview} />
      ) : (
        <EmptyHint />
      )}

      {hasPreview && headerInvalid ? (
        <WarningBanner>
          {preview?.summary.headerValidationMessage ??
            "Tệp CSV không khớp hợp đồng tiêu đề Shopee."}
        </WarningBanner>
      ) : null}

      {hasPreview && missingColumns.length > 0 ? (
        <WarningBanner>
          Thiếu cột:{" "}
          <code className="rounded bg-[rgba(255,250,246,0.7)] px-1.5 py-0.5 text-[11px]">
            {missingColumns.join(", ")}
          </code>
        </WarningBanner>
      ) : null}

      {hasPreviewRows ? <PreviewTable preview={preview!} /> : null}

      {preview && importResult ? (
        <CommitSummary preview={preview} importResult={importResult} />
      ) : null}
    </form>
  );
}

function FileField({
  name,
  disabled,
  onChange,
}: {
  name: string;
  disabled: boolean;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}): React.ReactElement {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
        Tệp CSV Shopee Affiliate
      </span>
      <span className="text-[11px] leading-relaxed text-[color:var(--text-muted)]">
        Định dạng .csv, tối đa 8 MB. Cần khớp hợp đồng tiêu đề
        Shopee (47 cột).
      </span>
      <input
        type="file"
        name={name}
        accept=".csv,text/csv"
        required
        disabled={disabled}
        onChange={onChange}
        className="block w-full cursor-pointer rounded-[var(--radius-md)] border border-[rgba(124,63,44,0.18)] bg-[rgba(255,250,246,0.84)] px-4 py-3 text-sm text-[color:var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] file:mr-4 file:cursor-pointer file:rounded-full file:border-0 file:bg-[color:var(--brand)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:border-[rgba(124,63,44,0.32)] focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60"
      />
    </label>
  );
}

function ReselectHint(): React.ReactElement {
  // Phase 20J manual-QA blocker fix -- Option A. After a
  // successful preview the form re-renders with the new state,
  // and the browser typically clears the file input on submit
  // (browsers do not preserve <input type="file"> selections
  // across form submits). Before the admin ticks the commit
  // checkbox and clicks "Nhập vào staging" they must re-select
  // the SAME CSV from the file input above. The server action
  // re-parses and re-validates server-side on every submit, so
  // this is a low-trust, explicit handoff: no client preview
  // data is ever reused.
  return (
    <div
      role="status"
      data-testid="phase-20j-reselect-hint"
      className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[rgba(220,157,67,0.45)] bg-[rgba(244,216,196,0.5)] p-3 sm:p-4"
    >
      <span
        aria-hidden="true"
        className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[color:var(--accent)] text-[11px] font-bold text-white"
      >
        i
      </span>
      <div className="flex flex-col gap-1 text-sm leading-relaxed text-[color:var(--text)]">
        <p className="font-medium">
          Sau khi xem trước, hãy chọn lại cùng tệp CSV rồi bấm Nhập
          vào staging.
        </p>
        <p className="text-xs leading-relaxed text-[color:var(--text-muted)] sm:text-sm">
          Trình duyệt đã xóa lựa chọn tệp sau khi submit xem trước.
          Hành động nhập staging sẽ phân tích và xác thực lại tệp ở
          phía server, nên không có dữ liệu preview nào của client
          được tin tưởng.
        </p>
      </div>
    </div>
  );
}

function CommitCheckbox({
  disabled,
}: {
  disabled: boolean;
}): React.ReactElement {
  return (
    <label className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[rgba(124,63,44,0.12)] bg-[rgba(255,252,249,0.7)] p-3 sm:p-4">
      <input
        type="checkbox"
        name="commit"
        value="on"
        disabled={disabled}
        className="mt-0.5 h-4 w-4 flex-none cursor-pointer rounded border-[rgba(124,63,44,0.32)] text-[color:var(--brand)] accent-[color:var(--brand)] focus:ring-[color:var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60"
      />
      <span className="flex flex-col gap-1 text-sm leading-relaxed text-[color:var(--text)]">
        <span className="font-medium">
          Ghi các dòng hợp lệ vào staging
        </span>
        <span className="text-xs text-[color:var(--text-muted)]">
          Mặc định chỉ xem trước. Bật checkbox này mới ghi vào
          bảng{" "}
          <code className="rounded bg-[rgba(255,250,246,0.7)] px-1.5 py-0.5 text-[11px]">
            shopee_csv_rows
          </code>
          .
        </span>
      </span>
    </label>
  );
}

function ActionRow({
  isPending,
  mode,
  previewDisabled,
  commitDisabled,
}: {
  isPending: boolean;
  mode: "preview" | "commit" | "";
  previewDisabled: boolean;
  commitDisabled: boolean;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <button
        type="submit"
        name="intent"
        value="preview"
        disabled={previewDisabled}
        className="inline-flex min-h-[2.75rem] flex-1 items-center justify-center rounded-[var(--radius-pill)] bg-gradient-to-br from-[color:var(--brand)] to-[color:var(--brand-strong)] px-5 py-2.5 text-sm font-semibold text-white shadow-[var(--shadow-glow)] transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
      >
        {isPending && mode !== "commit" ? (
          <span className="flex items-center gap-2">
            <Spinner /> Đang xem trước...
          </span>
        ) : (
          "Xem trước CSV"
        )}
      </button>
      <button
        type="submit"
        name="intent"
        value="commit"
        disabled={commitDisabled}
        className="inline-flex min-h-[2.75rem] flex-1 items-center justify-center rounded-[var(--radius-pill)] border border-[rgba(124,63,44,0.18)] bg-[rgba(255,250,246,0.84)] px-5 py-2.5 text-sm font-semibold text-[color:var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] transition hover:border-[rgba(124,63,44,0.32)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
      >
        {isPending && mode === "commit" ? (
          <span className="flex items-center gap-2">
            <Spinner /> Đang ghi vào staging...
          </span>
        ) : (
          "Nhập vào staging"
        )}
      </button>
      <span className="text-[11px] leading-relaxed text-[color:var(--text-muted)] sm:ml-auto sm:max-w-[16rem]">
        Preview không ghi DB. Commit chỉ ghi vào bảng staging
        <code className="ml-1 rounded bg-[rgba(255,250,246,0.7)] px-1.5 py-0.5 text-[10px]">
          shopee_csv_*
        </code>
        .
      </span>
    </div>
  );
}

function Spinner(): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white"
    />
  );
}

function ErrorBanner({ message }: { message: string }): React.ReactElement {
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[rgba(180,70,70,0.35)] bg-[rgba(180,70,70,0.08)] p-3 sm:p-4"
    >
      <span
        aria-hidden="true"
        className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-red-700 text-[11px] font-bold text-white"
      >
        !
      </span>
      <p className="text-sm leading-relaxed text-red-800">{message}</p>
    </div>
  );
}

function WarningBanner({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[rgba(220,157,67,0.45)] bg-[rgba(244,216,196,0.5)] p-3 sm:p-4"
    >
      <span
        aria-hidden="true"
        className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[color:var(--accent)] text-[11px] font-bold text-white"
      >
        i
      </span>
      <div className="text-sm leading-relaxed text-[color:var(--text)]">
        {children}
      </div>
    </div>
  );
}

function EmptyHint(): React.ReactElement {
  return (
    <div className="rounded-[var(--radius-md)] border border-dashed border-[rgba(124,63,44,0.22)] bg-[rgba(255,252,249,0.6)] p-4 text-center text-xs leading-relaxed text-[color:var(--text-muted)] sm:text-sm">
      Chọn tệp CSV rồi nhấn{" "}
      <span className="font-semibold text-[color:var(--text)]">
        Xem trước CSV
      </span>{" "}
      để kiểm tra các dòng trước khi quyết định ghi vào staging.
    </div>
  );
}

function PreviewSummary({
  preview,
}: {
  preview: ShopeeCsvPreview;
}): React.ReactElement {
  const { summary, sourceFileName, sourceFileSizeBytes, parserVersion } =
    preview;
  const hasDuplicates = summary.duplicateRows > 0;
  return (
    <section
      aria-live="polite"
      className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[rgba(124,63,44,0.14)] bg-[rgba(255,250,246,0.82)] p-4 shadow-[var(--shadow-sm)] sm:p-5"
    >
      <header className="flex flex-col gap-1">
        <h3 className="text-base font-semibold text-[color:var(--text)]">
          Tóm tắt xem trước
        </h3>
        <p className="text-xs leading-relaxed text-[color:var(--text-muted)]">
          Dữ liệu chỉ nằm trong bộ nhớ client. Chưa ghi vào DB.
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryStat label="Tổng dòng" value={summary.totalRows} />
        <SummaryStat
          label="Hợp lệ"
          value={summary.validRows}
          tone="ok"
        />
        <SummaryStat
          label="Không hợp lệ"
          value={summary.invalidRows}
          tone={summary.invalidRows > 0 ? "err" : undefined}
        />
        <SummaryStat
          label="Trùng lặp"
          value={summary.duplicateRows}
          tone={hasDuplicates ? "warn" : undefined}
        />
      </dl>

      <details className="rounded-[var(--radius-md)] border border-[rgba(124,63,44,0.1)] bg-[rgba(255,252,249,0.6)] p-3 text-xs leading-relaxed text-[color:var(--text-muted)]">
        <summary className="cursor-pointer text-sm font-medium text-[color:var(--text)]">
          Chi tiết tệp
        </summary>
        <ul className="mt-2 flex flex-col gap-1">
          <li>
            Tên tệp:{" "}
            <code className="rounded bg-[rgba(255,250,246,0.7)] px-1.5 py-0.5 text-[11px]">
              {sourceFileName}
            </code>
          </li>
          <li>
            Kích thước:{" "}
            {sourceFileSizeBytes.toLocaleString("vi-VN")} bytes
          </li>
          <li>
            Phiên bản parser:{" "}
            <code className="rounded bg-[rgba(255,250,246,0.7)] px-1.5 py-0.5 text-[11px]">
              {parserVersion}
            </code>
          </li>
        </ul>
      </details>
    </section>
  );
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "ok" | "err" | "warn";
}): React.ReactElement {
  const toneClass =
    tone === "ok"
      ? "border-[rgba(47,143,97,0.35)] bg-[rgba(47,143,97,0.08)]"
      : tone === "err"
        ? "border-[rgba(180,70,70,0.35)] bg-[rgba(180,70,70,0.08)]"
        : tone === "warn"
          ? "border-[rgba(220,157,67,0.45)] bg-[rgba(244,216,196,0.55)]"
          : "border-[rgba(124,63,44,0.12)] bg-[rgba(255,250,246,0.7)]";
  const toneText =
    tone === "ok"
      ? "text-[color:var(--success)]"
      : tone === "err"
        ? "text-red-700"
        : tone === "warn"
          ? "text-[color:var(--warning)]"
          : "text-[color:var(--text)]";
  return (
    <div
      className={`flex flex-col gap-1 rounded-[var(--radius-md)] border p-3 ${toneClass}`}
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
        {label}
      </span>
      <span className={`text-xl font-semibold leading-tight ${toneText}`}>
        {value.toLocaleString("vi-VN")}
      </span>
    </div>
  );
}

function PreviewTable({
  preview,
}: {
  preview: ShopeeCsvPreview;
}): React.ReactElement {
  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[rgba(124,63,44,0.14)] bg-[rgba(255,250,246,0.82)] p-4 shadow-[var(--shadow-sm)] sm:p-5">
      <header className="flex flex-col gap-1">
        <h4 className="text-sm font-semibold text-[color:var(--text)]">
          Bảng xem trước ({preview.rows.length}
          {preview.previewTruncated ? `/${preview.summary.totalRows}` : ""}{" "}
          dòng)
        </h4>
        {preview.previewTruncated ? (
          <p className="text-xs leading-relaxed text-[color:var(--text-muted)]">
            Chỉ hiển thị {preview.maxPreviewRows} dòng đầu tiên.
          </p>
        ) : null}
      </header>
      <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[rgba(124,63,44,0.12)] bg-[rgba(255,252,249,0.85)]">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="bg-[rgba(244,216,196,0.5)] text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-[color:var(--text-muted)]">
              <th scope="col" className="px-3 py-2">#</th>
              <th scope="col" className="px-3 py-2">Mã đơn hàng</th>
              <th scope="col" className="px-3 py-2">Trạng thái</th>
              <th scope="col" className="px-3 py-2">Checkout</th>
              <th scope="col" className="px-3 py-2">Trạng thái dòng</th>
              <th scope="col" className="px-3 py-2">Lỗi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgba(124,63,44,0.08)]">
            {preview.rows.map((row) => (
              <tr key={`${row.sourceRowNumber}-${row.rowFingerprintSha256}`}>
                <td className="px-3 py-2 font-mono text-[11px] text-[color:var(--text-muted)]">
                  {row.sourceRowNumber}
                </td>
                <td className="px-3 py-2">
                  <code className="rounded bg-[rgba(255,250,246,0.7)] px-1.5 py-0.5 text-[11px]">
                    {row.externalOrderId ?? "-"}
                  </code>
                </td>
                <td className="px-3 py-2 text-[color:var(--text)]">
                  {row.orderStatus ?? "-"}
                </td>
                <td className="px-3 py-2 text-[color:var(--text)]">
                  {row.checkoutId ?? "-"}
                </td>
                <td className="px-3 py-2">
                  <RowStatusBadge
                    duplicate={row.duplicate}
                    valid={row.valid}
                  />
                </td>
                <td className="px-3 py-2">
                  {row.errors.length === 0 ? (
                    <span className="text-[color:var(--text-muted)]">-</span>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {row.errors.map((err) => (
                        <li
                          key={err}
                          className="text-[11px] leading-snug text-red-700"
                        >
                          {err}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RowStatusBadge({
  duplicate,
  valid,
}: {
  duplicate: boolean;
  valid: boolean;
}): React.ReactElement {
  if (duplicate) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(220,157,67,0.45)] bg-[rgba(244,216,196,0.55)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[color:var(--warning)]">
        <span aria-hidden="true">.</span> Trùng
      </span>
    );
  }
  if (valid) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(47,143,97,0.35)] bg-[rgba(47,143,97,0.1)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[color:var(--success)]">
        <span aria-hidden="true">.</span> Hợp lệ
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(180,70,70,0.35)] bg-[rgba(180,70,70,0.08)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-red-700">
      <span aria-hidden="true">.</span> Lỗi
    </span>
  );
}

function CommitSummary({
  preview,
  importResult,
}: {
  preview: ShopeeCsvPreview;
  importResult: ShopeeCsvImportResult;
}): React.ReactElement {
  return (
    <section
      aria-live="polite"
      className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[rgba(47,143,97,0.35)] bg-[rgba(47,143,97,0.08)] p-4 shadow-[var(--shadow-sm)] sm:p-5"
    >
      <header className="flex flex-col gap-1">
        <h3 className="text-base font-semibold text-[color:var(--text)]">
          Đã ghi vào staging
        </h3>
        <p className="text-xs leading-relaxed text-[color:var(--text-muted)]">
          Dữ liệu chỉ nằm trong bảng staging{" "}
          <code className="rounded bg-[rgba(255,250,246,0.7)] px-1.5 py-0.5 text-[11px]">
            shopee_csv_*
          </code>
          .
        </p>
      </header>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <SummaryStat label="Tổng dòng CSV" value={importResult.totalRows} />
        <SummaryStat
          label="Đã ghi"
          value={importResult.insertedRows}
          tone="ok"
        />
        <SummaryStat
          label="Bỏ qua (trùng)"
          value={importResult.duplicateRows}
          tone={
            importResult.duplicateRows > 0 ? "warn" : undefined
          }
        />
      </dl>
      <p className="text-xs leading-relaxed text-[color:var(--text-muted)]">
        Mã batch (hệ thống):{" "}
        <code className="rounded bg-[rgba(255,250,246,0.7)] px-1.5 py-0.5 text-[11px]">
          {importResult.batchId}
        </code>
        . Tệp:{" "}
        <code className="rounded bg-[rgba(255,250,246,0.7)] px-1.5 py-0.5 text-[11px]">
          {preview.sourceFileName}
        </code>
        .
      </p>
      <div className="rounded-[var(--radius-md)] border border-[rgba(47,143,97,0.35)] bg-[rgba(47,143,97,0.06)] p-3 text-xs leading-relaxed text-[color:var(--text)]">
        <strong>Chưa ghi vào ví người dùng.</strong>{" "}
        <strong>Chưa đối soát.</strong>{" "}
        <strong>Chưa duyệt hoàn tiền.</strong> Phase 20K sẽ đọc các
        dòng này để tính cashback.
      </div>
    </section>
  );
}
