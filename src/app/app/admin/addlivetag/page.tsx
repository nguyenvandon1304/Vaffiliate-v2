/**
 * Phase 20H.8 -- Admin page for the Addlivetag import.
 *
 * Server component. Renders a small admin shell that hosts the
 * client-side form `AddlivetagImportForm`. The page is
 * intentionally minimal:
 *
 *   - one card with the import form (handled by the client form
 *     component, which uses `useActionState` to render the result),
 *   - one card explaining what the tool does and how to read the
 *     summary.
 *
 * Buyer-facing guarantees:
 *
 *   - The page is in `/app/admin` which requires the authenticated
 *     publisher boundary.
 *   - The page never displays internal identifiers. The summary
 *     shape (the discriminated union from `addlivetag-types.ts`)
 *     is contract-redacted.
 *   - No "guaranteed cashback" or similar buyer-facing promise.
 *     The page text says "internal reconciliation" only.
 */
import Link from "next/link";
import type { ReactElement } from "react";

import { AddlivetagImportForm } from "./AddlivetagImportForm";

export const dynamic = "force-dynamic";

export default function AddlivetagAdminPage(): ReactElement {
  return (
    <main className="va-admin-page">
      <header className="va-admin-page__header">
        <h1>Addlivetag import</h1>
        <p className="va-admin-page__subtitle">
          Internal reconciliation tool. Fetches order, item, and click
          evidence from the Addlivetag account API and feeds it into
          the existing Shopee staging pipeline.
        </p>
      </header>

      <section className="va-admin-page__card">
        <h2>Run import</h2>
        <AddlivetagImportForm />
        <p className="va-admin-page__footnote">
          Dry-run mode performs every compute step except the actual
          write into the staging tables. The summary is always
          returned, including per-row outcomes.
        </p>
      </section>

      <section className="va-admin-page__card">
        <h2>What this tool does</h2>
        <ul className="va-admin-list">
          <li>
            Calls the Addlivetag account API with the documented
            query parameters.
          </li>
          <li>
            Normalises every row into the existing
            <code> shopee_csv_rows </code>
            shape with
            <code> source = &apos;addlivetag_api&apos;</code>.
          </li>
          <li>
            Feeds each staged row into the existing Phase 20H.6
            reconciliation engine.
          </li>
          <li>
            Returns a flat, redacted summary. Internal identifiers
            (tracking-link id, publisher id, network sub id) are
            never included in the response.
          </li>
        </ul>
        <p className="va-admin-page__footnote">
          Buyer-facing copy on the public cashback surface is
          intentionally NOT changed by this tool. See
          <Link href="/app/cashback"> cashback reports</Link> for
          the buyer surface.
        </p>
      </section>
    </main>
  );
}
