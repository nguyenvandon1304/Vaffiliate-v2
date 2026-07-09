"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import { runAddlivetagImportAsync } from "@/services/addlivetag-import.service";
import type { AddlivetagImportResult } from "@/reporting/addlivetag-types";

export type RunAddlivetagImportActionState =
  | { readonly ok: true; readonly result: AddlivetagImportResult }
  | { readonly ok: false; readonly message: string };

export const INITIAL_RUN_ADDLIVETAG_IMPORT_ACTION_STATE: RunAddlivetagImportActionState =
  { ok: false, message: "" };

const ALLOWED_SOURCES: ReadonlyArray<"shopee" | "food"> = ["shopee", "food"];
const ALLOWED_TYPES: ReadonlyArray<"orders" | "items" | "clicks"> = [
  "orders",
  "items",
  "clicks",
];

/**
 * Admin-only server action. Used with `useActionState` so the
 * admin page can render the summary after the action returns.
 *
 * Validates inputs against the allow-list and never invokes the
 * import service with malformed values.
 *
 * The action NEVER includes internal identifiers in the response.
 * The `result` shape (from `addlivetag-types.ts`) is contract-
 * redacted.
 */
export async function runAddlivetagImportAction(
  _previousState: RunAddlivetagImportActionState,
  formData: FormData,
): Promise<RunAddlivetagImportActionState> {
  const sourceRaw = formData.get("source");
  const typeRaw = formData.get("type");
  const fromRaw = formData.get("from");
  const toRaw = formData.get("to");
  const pageSizeRaw = formData.get("pageSize");
  const dryRunRaw = formData.get("dryRun");
  // Phase 20I.3 -- optional `account_id`. Empty string is treated
  // as omitted so the API key's owning account remains the
  // implicit filter.
  const accountIdRaw = formData.get("accountId");

  if (
    typeof sourceRaw !== "string" ||
    !ALLOWED_SOURCES.includes(sourceRaw as "shopee" | "food")
  ) {
    return { ok: false, message: "Invalid source" };
  }
  const source = sourceRaw as "shopee" | "food";
  if (
    typeof typeRaw !== "string" ||
    !ALLOWED_TYPES.includes(typeRaw as "orders" | "items" | "clicks")
  ) {
    return { ok: false, message: "Invalid resource type" };
  }
  const type = typeRaw as "orders" | "items" | "clicks";
  if (typeof fromRaw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fromRaw)) {
    return {
      ok: false,
      message: "Invalid from date (expected YYYY-MM-DD)",
    };
  }
  if (typeof toRaw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(toRaw)) {
    return { ok: false, message: "Invalid to date (expected YYYY-MM-DD)" };
  }
  const pageSize = Number(pageSizeRaw ?? 200);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1_000) {
    return {
      ok: false,
      message: "Invalid page size (expected integer in [1, 1000])",
    };
  }
  const dryRun = dryRunRaw === "on" || dryRunRaw === "true";

  // Phase 20I.3 -- sanitise `accountId` at the admin boundary.
  // The HTTP client also caps length but the action does an extra
  // pass so the user sees a clear message before a network round
  // trip.
  let accountId: string | undefined;
  if (typeof accountIdRaw === "string") {
    const trimmed = accountIdRaw.trim();
    if (trimmed.length > 0) {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(trimmed)) {
        return {
          ok: false,
          message:
            "Invalid account id (expected [A-Za-z0-9_-]{1,64}, or leave empty)",
        };
      }
      accountId = trimmed;
    }
  }

  try {
    const result = await runAddlivetagImportAsync(
      {
        source,
        type,
        from: fromRaw,
        to: toRaw,
        pageSize,
        dryRun,
        accountId,
      },
      {
        fetchImpl: (fetchInput, init) => fetch(fetchInput, init),
        getApiKey: () => process.env.ADDLIVETAG_API_KEY ?? "",
      },
    );
    revalidatePath("/app/admin/addlivetag");
    return { ok: true, result };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Addlivetag import failed";
    // The error message is sanitised by the import service
    // (it never includes the API key); we forward it as-is.
    return { ok: false, message };
  }
}
