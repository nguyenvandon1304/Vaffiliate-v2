"use client";

import { useActionState, useState } from "react";

import {
  INITIAL_RUN_RECONCILIATION_ACTION_STATE,
  type ReconciliationAppliedRow,
  type ReconciliationSkippedRow,
  type RunReconciliationActionState,
} from "./action-state";
import { runReconciliationAction } from "./actions";

/**
 * Phase 20K follow-up 2 -- admin reconciliation form (client component).
 *
 * UX model (BLK A/B/I + UI copy corrections):
 *
 *   1. Dry-run creates a server-side reconciliation run. The form
 *      receives the run id from the server response and stores it
 *      in a hidden form input.
 *   2. Commit sends that run id back; the server reloads ONLY the
 *      candidates belonging to the run and applies them. The
 *      client never supplies a candidate set, an actor, or any
 *      status / money values.
 *   3. Repeating the same commit (clicking Commit again) sends the
 *      SAME run id; the server treats that as an idempotent
 *      replay and returns zero new transitions + zero new audit
 *      events. The UI explicitly says so.
 *   4. The form copy never claims the commit writes into
 *      "staging". It writes an audited conversion transition.
 *   5. The form copy explicitly says `paid` is OUTSIDE Phase 20K.
 */

function readMessage(state: RunReconciliationActionState): string {
  if (!state) return "";
  if (state.ok === false && typeof state.message === "string") {
    return state.message;
  }
  return "";
}

function readSummary(
  state: RunReconciliationActionState,
):
  | {
      applied: number;
      skipped: number;
      scannedRowCount: number;
      committedAt: string;
      mode: "dry_run" | "commit";
      network: "shopee" | "manual";
      reconciliationRunId: string;
      totals: {
        networkCommission: number;
        userCashback: number;
        platformProfit: number;
      };
    }
  | null {
  if (!state || state.ok !== true) return null;
  return {
    applied: state.summary.applied,
    skipped: state.summary.skipped,
    scannedRowCount: state.scannedRowCount,
    committedAt: state.committedAt,
    mode: state.mode,
    network: state.network,
    reconciliationRunId: state.reconciliationRunId,
    totals: {
      networkCommission: state.summary.totals.networkCommission,
      userCashback: state.summary.totals.userCashback,
      platformProfit: state.summary.totals.platformProfit,
    },
  };
}

function formatVnd(amount: number): string {
  if (amount === 0) return "0";
  const grouped = Math.abs(amount)
    .toString()
    .split("")
    .reverse()
    .reduce<string[]>((acc, ch, idx) => {
      if (idx !== 0 && idx % 3 === 0) acc.push(".");
      acc.push(ch);
      return acc;
    }, [])
    .reverse()
    .join("");
  return (amount < 0 ? "-" : "") + grouped;
}

export function ReconciliationForm(): React.ReactElement {
  const [state, formAction, isPending] = useActionState<
    RunReconciliationActionState,
    FormData
  >(
    runReconciliationAction,
    INITIAL_RUN_RECONCILIATION_ACTION_STATE,
  );

  const message = readMessage(state);
  const summary = readSummary(state);
  const hasError = !state?.ok && message.length > 0;
  const appliedRows: ReadonlyArray<ReconciliationAppliedRow> =
    state?.ok === true ? state.applied : [];
  const skippedRows: ReadonlyArray<ReconciliationSkippedRow> =
    state?.ok === true ? state.skipped : [];

  const [commitConfirmed, setCommitConfirmed] = useState(false);
  const handleConfirmChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ): void => {
    setCommitConfirmed(event.currentTarget.checked);
  };

  const lastMode = state?.ok === true ? state.mode : null;
  const lastRunId =
    state?.ok === true ? state.reconciliationRunId : "";
  const lastNetwork =
    state?.ok === true ? state.network : "shopee";

  return (
    <form
      action={formAction}
      className="flex flex-col gap-5"
    >
      <ActionRow
        isPending={isPending}
        lastMode={lastMode}
        lastNetwork={lastNetwork}
        lastRunId={lastRunId}
        dryRunDisabled={isPending}
        commitDisabled={
          isPending ||
          !commitConfirmed ||
          summary === null ||
          summary.mode !== "dry_run" ||
          summary.applied === 0
        }
      />

      <ConfirmationCheckbox
        disabled={isPending}
        checked={commitConfirmed}
        onChange={handleConfirmChange}
      />

      {summary !== null && summary.mode === "dry_run" ? (
        <ReselectHint summary={summary} />
      ) : null}

      {hasError ? <ErrorBanner message={message} /> : null}

      {summary !== null ? (
        <SummaryCard summary={summary} />
      ) : (
        <EmptyHint />
      )}

      {summary !== null && summary.mode === "commit" ? (
        <IdempotentReplayNote />
      ) : null}

      {appliedRows.length > 0 ? (
        <AppliedTable rows={appliedRows} />
      ) : null}

      {skippedRows.length > 0 ? (
        <SkippedTable rows={skippedRows} />
      ) : null}
    </form>
  );
}

function ActionRow({
  isPending,
  lastMode,
  lastNetwork,
  lastRunId,
  dryRunDisabled,
  commitDisabled,
}: {
  isPending: boolean;
  lastMode: "dry_run" | "commit" | null;
  lastNetwork: "shopee" | "manual";
  lastRunId: string;
  dryRunDisabled: boolean;
  commitDisabled: boolean;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <select
        name="network"
        defaultValue={lastNetwork}
        aria-label="Network"
        className="inline-flex min-h-[2.75rem] items-center rounded-[var(--radius-pill)] border border-[rgba(124,63,44,0.18)] bg-[rgba(255,250,246,0.84)] px-4 text-sm font-semibold text-[color:var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus-ring)]"
      >
        <option value="shopee">Shopee (incl. Addlivetag)</option>
        <option value="manual">Manual</option>
      </select>
      <ScopeInputGroup />
      <button
        type="submit"
        name="intent"
        value="dry_run"
        disabled={dryRunDisabled}
        className="inline-flex min-h-[2.75rem] flex-1 items-center justify-center rounded-[var(--radius-pill)] border border-[rgba(124,63,44,0.18)] bg-[rgba(255,250,246,0.84)] px-5 py-2.5 text-sm font-semibold text-[color:var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] transition hover:border-[rgba(124,63,44,0.32)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
      >
        {isPending && lastMode !== "commit" ? (
          <span className="flex items-center gap-2">
            <Spinner /> Đang chạy dry run...
          </span>
        ) : (
          "Dry run"
        )}
      </button>
      <button
        type="submit"
        name="intent"
        value="commit"
        disabled={commitDisabled}
        className="inline-flex min-h-[2.75rem] flex-1 items-center justify-center rounded-[var(--radius-pill)] bg-gradient-to-br from-[color:var(--brand)] to-[color:var(--brand-strong)] px-5 py-2.5 text-sm font-semibold text-white shadow-[var(--shadow-glow)] transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
      >
        {isPending && lastMode === "commit" ? (
          <span className="flex items-center gap-2">
            <Spinner /> Đang commit...
          </span>
        ) : (
          "Commit"
        )}
      </button>
      {/* Server-generated run id, used to bind Commit to the
          Dry run candidate set. The user can never edit this. */}
      <input
        type="hidden"
        name="reconciliation_run_id"
        value={lastRunId}
      />
      <span className="text-[11px] leading-relaxed text-[color:var(--text-muted)] sm:ml-auto sm:max-w-[20rem]">
        Commit chỉ ghi transition cho các conversion thuộc
        reconciliation run đã chọn (server sinh). Lặp lại Commit với
        cùng run id là idempotent skipped: 0 transition mới, 0 audit
        event mới.
      </span>
    </div>
  );
}

function ConfirmationCheckbox({
  disabled,
  checked,
  onChange,
}: {
  disabled: boolean;
  checked: boolean;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}): React.ReactElement {
  return (
    <label className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[rgba(124,63,44,0.12)] bg-[rgba(255,252,249,0.7)] p-3 sm:p-4">
      <input
        type="checkbox"
        name="commit_confirm"
        value="on"
        disabled={disabled}
        checked={checked}
        onChange={onChange}
        className="mt-0.5 h-4 w-4 flex-none cursor-pointer rounded border-[rgba(124,63,44,0.32)] text-[color:var(--brand)] accent-[color:var(--brand)] focus:ring-[color:var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60"
      />
      <span className="flex flex-col gap-1 text-sm leading-relaxed text-[color:var(--text)]">
        <span className="font-medium">
          Tôi đã đọc và hiểu các quyết định ở phần Dry run.
        </span>
        <span className="text-xs text-[color:var(--text-muted)]">
          Bật ô này mới cho phép bấm Commit. Server reload lại từng
          conversion trong run và chỉ áp dụng transition khi
          provenance + trạng thái hiện tại còn khớp. Đánh dấu `paid`
          nằm ngoài Phase 20K.
        </span>
      </span>
    </label>
  );
}

function ReselectHint({
  summary,
}: {
  summary: NonNullable<ReturnType<typeof readSummary>>;
}): React.ReactElement {
  return (
    <div
      role="status"
      data-testid="phase-20k-dry-run-summary"
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
          Run {summary.reconciliationRunId.slice(0, 8)}... đã tạo
          với {summary.applied} dòng sẽ được áp dụng. Tick xác nhận
          rồi bấm Commit.
        </p>
        <p className="text-xs leading-relaxed text-[color:var(--text-muted)] sm:text-sm">
          Mỗi candidate chỉ áp dụng được một transition mỗi lần
          commit; click lại với cùng run id không tạo transition
          mới. Không ghi `paid` -- yêu cầu đó nằm ngoài Phase 20K.
        </p>
      </div>
    </div>
  );
}

function SummaryCard({
  summary,
}: {
  summary: NonNullable<ReturnType<typeof readSummary>>;
}): React.ReactElement {
  return (
    <div className="rounded-[var(--radius-md)] border border-[rgba(124,63,44,0.14)] bg-[rgba(255,252,249,0.7)] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
            Tóm tắt ({summary.mode === "dry_run" ? "Dry run" : "Commit"})
          </p>
          <p className="text-sm text-[color:var(--text)]">
            Run {summary.reconciliationRunId.slice(0, 8)}... ·{" "}
            network <code className="rounded bg-[rgba(255,250,246,0.7)] px-1.5 py-0.5 text-[10px]">{summary.network}</code>
            {" · "}quét {summary.scannedRowCount} dòng{" · "}
            <span className="font-semibold">áp dụng {summary.applied}</span>{" "}
            · bỏ qua {summary.skipped}
          </p>
        </div>
        <p className="text-[11px] text-[color:var(--text-muted)]">
          {summary.committedAt}
        </p>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Totals
          label="Tổng hoa hồng mạng"
          amount={summary.totals.networkCommission}
        />
        <Totals
          label="Tiền hoàn người dùng (60%)"
          amount={summary.totals.userCashback}
        />
        <Totals
          label="Lợi nhuận nền tảng"
          amount={summary.totals.platformProfit}
        />
      </div>
    </div>
  );
}

function IdempotentReplayNote(): React.ReactElement {
  return (
    <div
      role="note"
      data-testid="phase-20k-idempotent-replay-note"
      className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[rgba(124,63,44,0.18)] bg-[rgba(255,252,249,0.6)] p-3 sm:p-4"
    >
      <span
        aria-hidden="true"
        className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[color:var(--brand)] text-[11px] font-bold text-white"
      >
        ↺
      </span>
      <div className="flex flex-col gap-1 text-sm leading-relaxed text-[color:var(--text)]">
        <p className="font-medium">Commit lặp lại với cùng run id là idempotent skipped.</p>
        <p className="text-xs leading-relaxed text-[color:var(--text-muted)] sm:text-sm">
          DB từ chối mọi attempt mới thông qua UNIQUE index trên
          <code className="ml-1 rounded bg-[rgba(255,250,246,0.7)] px-1.5 py-0.5 text-[10px]">run_candidate_id</code>.
          Để advance thêm một transition, cần tạo run mới (chạy lại Dry run).
        </p>
      </div>
    </div>
  );
}

function Totals({
  label,
  amount,
}: {
  label: string;
  amount: number;
}): React.ReactElement {
  return (
    <div className="rounded-[var(--radius-md)] border border-[rgba(124,63,44,0.10)] bg-white/70 p-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-[color:var(--text)]">
        {formatVnd(amount)}đ
      </p>
    </div>
  );
}

function AppliedTable({
  rows,
}: {
  rows: ReadonlyArray<ReconciliationAppliedRow>;
}): React.ReactElement {
  return (
    <section className="rounded-[var(--radius-md)] border border-[rgba(124,63,44,0.14)] bg-white/70 p-4 sm:p-5">
      <h3 className="mb-2 text-sm font-semibold text-[color:var(--text)]">
        Quyết định đã áp dụng ({rows.length})
      </h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
              <th className="px-2 py-2">Conversion</th>
              <th className="px-2 py-2">Trạng thái cũ -&gt; mới</th>
              <th className="px-2 py-2">Reason code</th>
              <th className="px-2 py-2 text-right">Mạng</th>
              <th className="px-2 py-2 text-right">Người dùng</th>
              <th className="px-2 py-2 text-right">Nền tảng</th>
              <th className="px-2 py-2">Idempotency</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 12).map((row) => (
              <tr
                key={row.conversionId + ":" + row.nextStatus}
                className="border-t border-[rgba(124,63,44,0.08)]"
              >
                <td className="px-2 py-2 font-mono text-[11px] text-[color:var(--text-muted)]">
                  {row.conversionId.slice(0, 8)}...
                </td>
                <td className="px-2 py-2 text-[color:var(--text)]">
                  <code className="rounded bg-[rgba(255,250,246,0.7)] px-1.5 py-0.5 text-[11px]">
                    {row.previousStatus} -&gt; {row.nextStatus}
                  </code>
                </td>
                <td className="px-2 py-2 font-mono text-[11px] text-[color:var(--text-muted)]">
                  {row.reasonCode}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {formatVnd(row.networkCommission)}đ
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {formatVnd(row.userCashback)}đ
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {formatVnd(row.platformProfit)}đ
                </td>
                <td className="px-2 py-2 font-mono text-[11px] text-[color:var(--text-muted)]">
                  {row.idempotencyKeyShort}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 12 ? (
          <p className="pt-2 text-[11px] text-[color:var(--text-muted)]">
            Hiển thị 12 / {rows.length} dòng đầu tiên. Toàn bộ kết quả
            đã được ghi vào audit log.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function SkippedTable({
  rows,
}: {
  rows: ReadonlyArray<ReconciliationSkippedRow>;
}): React.ReactElement {
  return (
    <section className="rounded-[var(--radius-md)] border border-[rgba(124,63,44,0.14)] bg-white/70 p-4 sm:p-5">
      <h3 className="mb-2 text-sm font-semibold text-[color:var(--text)]">
        Dòng bị bỏ qua ({rows.length})
      </h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
              <th className="px-2 py-2">Conversion</th>
              <th className="px-2 py-2">Reason code</th>
              <th className="px-2 py-2">Replay?</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 12).map((row) => (
              <tr
                key={row.conversionId + ":" + row.reasonCode}
                className="border-t border-[rgba(124,63,44,0.08)]"
              >
                <td className="px-2 py-2 font-mono text-[11px] text-[color:var(--text-muted)]">
                  {row.conversionId.slice(0, 8)}...
                </td>
                <td className="px-2 py-2 font-mono text-[11px] text-[color:var(--text-muted)]">
                  {row.reasonCode}
                </td>
                <td className="px-2 py-2 font-mono text-[11px] text-[color:var(--text-muted)]">
                  {row.idempotentReplay === true ? "yes" : "no"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
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

function EmptyHint(): React.ReactElement {
  return (
    <div className="rounded-[var(--radius-md)] border border-dashed border-[rgba(124,63,44,0.22)] bg-[rgba(255,252,249,0.6)] p-4 text-center text-xs leading-relaxed text-[color:var(--text-muted)] sm:text-sm">
      Bấm{" "}
      <span className="font-semibold text-[color:var(--text)]">
        Dry run
      </span>{" "}
      để server tạo một reconciliation run. Commit chỉ áp dụng
      được các dòng thuộc run gần nhất.
    </div>
  );
}

/**
 * Phase 20K follow-up 3 -- bounded source scope input group.
 *
 * The dry-run refuses to plan an unbounded run. The admin must
 * always supply at least one server-validated boundary before the
 * engine scans any conversion. The fields below are validated by
 * `readBoundedSourceScope` in `actions.ts`; values that fail
 * validation are dropped, leaving only valid identifiers for the
 * repository.
 */
function ScopeInputGroup(): React.ReactElement {
  return (
    <fieldset className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[rgba(124,63,44,0.14)] bg-white/70 p-3 sm:p-4">
      <legend className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
        Source scope giới hạn (bắt buộc)
      </legend>
      <label className="flex flex-col gap-1 text-xs leading-relaxed text-[color:var(--text)]">
        <span className="font-medium">
          Ingestion event ids (UUID, mỗi dòng hoặc phẩy)
        </span>
        <textarea
          name="scope_ingestion_event_ids"
          rows={2}
          placeholder="e.g. 9b0f...-...-..."
          className="rounded-[var(--radius-sm)] border border-[rgba(124,63,44,0.18)] bg-[rgba(255,250,246,0.84)] px-2 py-1 font-mono text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus-ring)]"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs leading-relaxed text-[color:var(--text)]">
        <span className="font-medium">
          Source conversion keys (SHA-256, mỗi dòng hoặc phẩy)
        </span>
        <textarea
          name="scope_source_conversion_keys"
          rows={2}
          placeholder="e.g. 3a7b...c2"
          className="rounded-[var(--radius-sm)] border border-[rgba(124,63,44,0.18)] bg-[rgba(255,250,246,0.84)] px-2 py-1 font-mono text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus-ring)]"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs leading-relaxed text-[color:var(--text)]">
        <span className="font-medium">Occurred window (ISO, UTC)</span>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            name="scope_occurred_after"
            placeholder="2026-07-01T00:00:00Z"
            className="flex-1 rounded-[var(--radius-sm)] border border-[rgba(124,63,44,0.18)] bg-[rgba(255,250,246,0.84)] px-2 py-1 font-mono text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus-ring)]"
          />
          <input
            type="text"
            name="scope_occurred_before"
            placeholder="2026-07-12T00:00:00Z"
            className="flex-1 rounded-[var(--radius-sm)] border border-[rgba(124,63,44,0.18)] bg-[rgba(255,250,246,0.84)] px-2 py-1 font-mono text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus-ring)]"
          />
        </div>
      </label>
      <p className="text-[11px] leading-relaxed text-[color:var(--text-muted)]">
        Phải cung cấp ít nhất một boundary. Dry run chỉ quét các
        conversion khớp scope. Mọi conversion ngoài scope đều không
        được phát hiện, không được mutate.
      </p>
    </fieldset>
  );
}