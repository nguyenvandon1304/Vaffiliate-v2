"use client";

import { useActionState } from "react";

import {
  INITIAL_RUN_ADDLIVETAG_IMPORT_ACTION_STATE,
  runAddlivetagImportAction,
  type RunAddlivetagImportActionState,
} from "./actions";

export function AddlivetagImportForm(): React.ReactElement {
  const [state, formAction, isPending] = useActionState<
    RunAddlivetagImportActionState,
    FormData
  >(runAddlivetagImportAction, INITIAL_RUN_ADDLIVETAG_IMPORT_ACTION_STATE);

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
          pattern="[A-Za-z0-9_\-]{0,64}"
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
      {!state.ok && state.message.length > 0 ? (
        <p className="va-admin-form__error" role="status">
          {state.message}
        </p>
      ) : null}
      {state.ok ? (
        <section className="va-admin-form__summary">
          <h3>Import summary</h3>
          <ul>
            <li>
              Source: <code>{state.result.source}</code>
            </li>
            <li>
              Type: <code>{state.result.type}</code>
            </li>
            <li>Pages fetched: {state.result.pagesFetched}</li>
            <li>Rows fetched: {state.result.rowsFetched}</li>
            <li>Rows staged: {state.result.rowsStaged}</li>
            <li>Rows reconciled: {state.result.rowsReconciled}</li>
            <li>Rows duplicate: {state.result.rowsDuplicate}</li>
            <li>Rows rejected: {state.result.rowsRejected}</li>
            <li>
              Mode: {state.result.dryRun ? "dry-run" : "live write"}
            </li>
          </ul>
        </section>
      ) : null}
    </form>
  );
}
