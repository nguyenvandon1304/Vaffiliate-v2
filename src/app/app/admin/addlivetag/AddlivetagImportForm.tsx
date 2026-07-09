"use client";

import { useActionState } from "react";

import {
  INITIAL_RUN_ADDLIVETAG_IMPORT_ACTION_STATE,
  runAddlivetagImportAction,
  type RunAddlivetagImportActionState,
} from "./actions";

/**
 * Admin-only form that drives the Addlivetag import server action.
 * Lives at /app/admin/addlivetag and is therefore already behind
 * the requireAdmin() guard wired by /app/admin/layout.tsx. The form
 * does not call any auth helper itself; it only renders the fields,
 * submits them, and renders the action state.
 *
 * Defensive rendering: RunAddlivetagImportActionState is a
 * discriminated union ({ ok: true; result } | { ok: false; message }).
 * useActionState hydrates the initial state from the server module,
 * and in some hydration windows the initial state can be observed
 * as an object that does not yet expose the narrowed message / result
 * fields. Reading state.message.length or state.result.* on that
 * window used to throw
 * `Cannot read properties of undefined (reading 'length')`
 * (Phase 20I.5 manual QA on /app/admin/addlivetag).
 *
 * To keep the form safe without weakening the discriminated union
 * in actions.ts, the form reads through tiny pure helpers that
 * accept the loose state shape and default to safe empty values
 * ("", 0) so the page never crashes on first paint. The defaults
 * do NOT manufacture fake success data -- a successful summary is
 * still only rendered when state.ok === true AND the result fields
 * are present.
 *
 * No secret material is rendered here. The action returns a
 * sanitised, redacted summary; this form only displays that summary.
 */

function readMessage(state: RunAddlivetagImportActionState): string {
  if (!state) return "";
  if (state.ok === false && typeof state.message === "string") {
    return state.message;
  }
  return "";
}

function readResultSummary(
  state: RunAddlivetagImportActionState,
): Readonly<{
  source: string;
  type: string;
  pagesFetched: number;
  rowsFetched: number;
  rowsStaged: number;
  rowsReconciled: number;
  rowsDuplicate: number;
  rowsRejected: number;
  dryRun: boolean;
}> | null {
  if (!state || state.ok !== true) return null;
  const r = state.result;
  if (!r || typeof r !== "object") return null;
  return {
    source: typeof r.source === "string" ? r.source : "",
    type: typeof r.type === "string" ? r.type : "",
    pagesFetched: Number.isFinite(r.pagesFetched) ? r.pagesFetched : 0,
    rowsFetched: Number.isFinite(r.rowsFetched) ? r.rowsFetched : 0,
    rowsStaged: Number.isFinite(r.rowsStaged) ? r.rowsStaged : 0,
    rowsReconciled: Number.isFinite(r.rowsReconciled) ? r.rowsReconciled : 0,
    rowsDuplicate: Number.isFinite(r.rowsDuplicate) ? r.rowsDuplicate : 0,
    rowsRejected: Number.isFinite(r.rowsRejected) ? r.rowsRejected : 0,
    dryRun: r.dryRun === true,
  };
}

export function AddlivetagImportForm(): React.ReactElement {
  const [state, formAction, isPending] = useActionState<
    RunAddlivetagImportActionState,
    FormData
  >(runAddlivetagImportAction, INITIAL_RUN_ADDLIVETAG_IMPORT_ACTION_STATE);

  const message = readMessage(state);
  const summary = readResultSummary(state);
  const hasError = !state?.ok && message.length > 0;

  return (
    <form action={formAction} className="va-admin-form">
      <label className="va-admin-form__field">
        <span>Source</span>
        <select name="source" defaultValue="shopee">
          <option value="shopee">shopee</option>
          <option value="food" disabled>
            food (scaffolded only)
          </option>
        </select>
      </label>
      <label className="va-admin-form__field">
        <span>Resource type</span>
        <select name="type" defaultValue="orders">
          <option value="orders">orders</option>
          <option value="items">items</option>
          <option value="clicks">clicks</option>
        </select>
      </label>
      <label className="va-admin-form__field">
        <span>From (YYYY-MM-DD)</span>
        <input
          type="text"
          name="from"
          inputMode="numeric"
          pattern="\d{4}-\d{2}-\d{2}"
          placeholder="2026-01-01"
          required
        />
      </label>
      <label className="va-admin-form__field">
        <span>To (YYYY-MM-DD)</span>
        <input
          type="text"
          name="to"
          inputMode="numeric"
          pattern="\d{4}-\d{2}-\d{2}"
          placeholder="2026-01-31"
          required
        />
      </label>
      <label className="va-admin-form__field">
        <span>
          Account id <small>(optional)</small>
        </span>
        <input
          type="text"
          name="accountId"
          inputMode="text"
          pattern="[A-Za-z0-9_-]{0,64}"
          maxLength={64}
          placeholder="leave empty to use the API key's account"
        />
      </label>
      <label className="va-admin-form__field">
        <span>Page size</span>
        <input
          type="number"
          name="pageSize"
          min={1}
          max={1000}
          defaultValue={200}
        />
      </label>
      <label className="va-admin-form__field va-admin-form__field--inline">
        <input type="checkbox" name="dryRun" defaultChecked />
        <span>Dry run (no writes)</span>
      </label>
      <button type="submit" className="va-admin-form__submit" disabled={isPending}>
        {isPending ? "Running..." : "Run import"}
      </button>
      {hasError ? (
        <p className="va-admin-form__error" role="status">
          {message}
        </p>
      ) : null}
      {summary ? (
        <section className="va-admin-form__summary">
          <h3>Import summary</h3>
          <ul>
            <li>
              Source: <code>{summary.source}</code>
            </li>
            <li>
              Type: <code>{summary.type}</code>
            </li>
            <li>Pages fetched: {summary.pagesFetched}</li>
            <li>Rows fetched: {summary.rowsFetched}</li>
            <li>Rows staged: {summary.rowsStaged}</li>
            <li>Rows reconciled: {summary.rowsReconciled}</li>
            <li>Rows duplicate: {summary.rowsDuplicate}</li>
            <li>Rows rejected: {summary.rowsRejected}</li>
            <li>
              Mode: {summary.dryRun ? "dry-run" : "live write"}
            </li>
          </ul>
        </section>
      ) : null}
    </form>
  );
}