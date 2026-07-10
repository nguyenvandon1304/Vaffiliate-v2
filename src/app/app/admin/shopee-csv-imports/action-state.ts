/**
 * Phase 20J -- Shared types and constants for the Shopee CSV import
 * server action and its client form.
 *
 * This file lives OUTSIDE `actions.ts` on purpose. Next.js requires
 * that any module with the `"use server"` directive ONLY export
 * async functions. The discriminated-union response type and the
 * initial-state constant for `useActionState` are not async, so they
 * MUST live in a module that does not declare `"use server"`. The
 * client form imports them from here.
 *
 * Boundary guarantees (defense in depth):
 *
 *   - This module is plain TypeScript. It does not declare
 *     `"use server"` and does not import `"server-only"`, so the
 *     client form can import it freely.
 *   - It does not pull in any database / network / file-system
 *     dependency: only two existing type-only imports from the
 *     preview module and the staging repository. Both modules
 *     are type-only here (the import is `import type`), so they
 *     are erased at compile time and produce no runtime cost in
 *     the client bundle.
 *   - It does not include any internal identifier (raw CSV,
 *     sha256 of the payload, batch UUID, etc.).
 */

import type { ShopeeCsvPreview } from "@/lib/shopee-csv-import/shopee-csv-preview";
import type { ShopeeCsvImportResult } from "@/repositories/shopee-csv-ingestion.repository";

/**
 * Discriminated-union state for the `useActionState` reducer that
 * drives the Shopee CSV import admin form.
 *
 *   - `{ ok: true, mode: "preview", preview, importResult }` is the
 *     preview-only response; `importResult` is always `null` in
 *     preview mode.
 *   - `{ ok: true, mode: "commit", preview, importResult }` is the
 *     commit response; `importResult` carries the staging batch
 *     counters (see `ShopeeCsvImportResult`).
 *   - `{ ok: false, message }` is the failure response used for
 *     missing/empty/oversized/non-CSV input and header validation
 *     failures. The `message` is a safe admin-friendly Vietnamese
 *     string -- no internal identifiers.
 */
export type RunShopeeCsvImportActionState =
  | {
      readonly ok: true;
      readonly mode: "preview" | "commit";
      readonly preview: ShopeeCsvPreview;
      readonly importResult: ShopeeCsvImportResult | null;
    }
  | { readonly ok: false; readonly message: string };

/**
 * Initial state for the `useActionState` reducer. Renders the
 * empty hint and disables the preview / commit buttons until the
 * admin uploads a CSV.
 */
export const INITIAL_RUN_SHOPEE_CSV_IMPORT_ACTION_STATE: RunShopeeCsvImportActionState =
  { ok: false, message: "" };
