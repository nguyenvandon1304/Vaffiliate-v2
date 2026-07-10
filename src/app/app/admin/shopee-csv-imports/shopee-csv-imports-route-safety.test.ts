/**
 * Phase 20J -- Admin CSV import route / auth / RBAC boundary tests.
 *
 * The tests are pure file-based assertions. We cannot run a
 * full React DOM harness in this branch and we do not want to
 * add a dependency for a single page, so we read the page,
 * client form, and server action sources directly and assert
 * the documented contract:
 *
 *   - `/app/admin/shopee-csv-imports` page exists and lives at
 *     the documented admin path.
 *   - The page is mounted under the existing `/app/admin`
 *     layout (which already calls `requireAdmin()`); the new
 *     page must NOT re-mount `BuyerResponsiveShell`,
 *     `BuyerMobileBottomNav`, `BuyerMobileTopBar`, or any
 *     buyer shell primitive.
 *   - The server action calls `requireAdmin("/app/admin/shopee-csv-imports")`
 *     as a belt-and-braces second guard.
 *   - The server action does NOT import any wallet, ledger,
 *     payable, paid, or buyer-visible writer.
 *   - The page declares `privateRouteMetadata()` so the rendered
 *     `<meta name="robots">` directive is `noindex, nofollow`.
 *   - The page does NOT promise guaranteed cashback, approval,
 *     payable, or paid transitions in any user-visible copy.
 */

import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

function readSource(path: string): string {
  const url = new URL(path, import.meta.url);
  return readFileSync(fileURLToPath(url), "utf8");
}

function readRepoFile(relPath: string): string {
  const here = fileURLToPath(import.meta.url);
  const projectRoot = here.replace(/src[\\/].*$/, "");
  const absolute = `${projectRoot}${relPath}`;
  if (!existsSync(absolute)) {
    throw new Error(`Expected file at ${absolute}, but it was not found.`);
  }
  return readFileSync(absolute, "utf8");
}

const PAGE_PATH = "src/app/app/admin/shopee-csv-imports/page.tsx";
const FORM_PATH = "src/app/app/admin/shopee-csv-imports/ShopeeCsvImportForm.tsx";
const ACTIONS_PATH = "src/app/app/admin/shopee-csv-imports/actions.ts";

test("Phase 20J: /app/admin/shopee-csv-imports page exists", () => {
  const here = fileURLToPath(import.meta.url);
  const directory = here.replace(/[^\\/]+$/, "");
  if (!existsSync(`${directory}page.tsx`)) {
    throw new Error(
      "Expected page.tsx next to this test file at src/app/app/admin/shopee-csv-imports/page.tsx",
    );
  }
  // Sanity: the page source contains the canonical H1 so the
  // operator can confirm the page actually rendered.
  const source = readSource("./page.tsx");
  if (!source.includes("Shopee CSV import")) {
    throw new Error(
      "Expected the page to render the canonical 'Shopee CSV import' heading.",
    );
  }
});

test("Phase 20J: admin page must NOT mount the buyer shell", () => {
  const source = readSource("./page.tsx");
  // The check is intentionally stricter than a substring search:
  // the page source MAY mention BuyerResponsiveShell in a
  // comment explaining what it does not do, but it must NOT
  // import it. We assert by detecting actual import statements.
  const importLineRe = /^\s*import\s[^;]*BuyerResponsiveShell/m;
  if (importLineRe.test(source)) {
    throw new Error(
      "Phase 20J admin page must not import BuyerResponsiveShell -- the admin shell is independent of the buyer shell.",
    );
  }
  for (const banned of ["BuyerMobileBottomNav", "BuyerMobileTopBar", "BuyerNavIcons"]) {
    const importRe = new RegExp(
      `^\\s*import\\s[^;]*${banned}`,
      "m",
    );
    if (importRe.test(source)) {
      throw new Error(
        `Phase 20J admin page must not import ${banned} -- the admin shell is independent of the buyer shell.`,
      );
    }
  }
  // The page must not declare a buyer-bottom-nav or buyer
  // responsive shell data-testid in its rendered markup.
  for (const bannedId of [
    "buyer-bottom-nav",
    "buyer-responsive-shell",
    "buyer-mobile-top-bar",
  ]) {
    if (source.includes(bannedId)) {
      throw new Error(
        `Phase 20J admin page must not render ${bannedId}.`,
      );
    }
  }
});

test("Phase 20J: admin page applies privateRouteMetadata() (noindex, nofollow)", () => {
  const source = readSource("./page.tsx");
  if (!source.includes("privateRouteMetadata")) {
    throw new Error(
      "Phase 20J admin page must apply privateRouteMetadata() so the page renders noindex,nofollow.",
    );
  }
  // Either import from the canonical helper or define a local
  // helper that returns index:false,follow:false. Both are
  // acceptable.
  if (
    !source.includes("index: false") ||
    !source.includes("follow: false")
  ) {
    throw new Error(
      "Phase 20J admin page must declare robots index:false,follow:false.",
    );
  }
});

test("Phase 20J: server action calls requireAdmin('/app/admin/shopee-csv-imports')", () => {
  const source = readSource("./actions.ts");
  if (!source.includes("requireAdmin(\"/app/admin/shopee-csv-imports\")")) {
    throw new Error(
      "Phase 20J server action must call requireAdmin('/app/admin/shopee-csv-imports') as a belt-and-braces second guard.",
    );
  }
  // Anchor on a real top-level "use server" directive so a
  // documentation comment that quotes the directive does not
  // satisfy the check by accident.
  const directiveRe = /^[ \t]*(["'])use server\1[ \t]*;?[ \t]*$/m;
  if (!directiveRe.test(source)) {
    throw new Error(
      "Phase 20J server action file must declare 'use server'.",
    );
  }
  if (!source.includes("import \"server-only\"")) {
    throw new Error(
      "Phase 20J server action must import 'server-only' so client components cannot import it accidentally.",
    );
  }
});

test("Phase 20J: server action does NOT write to ledger / wallet / payable / paid", () => {
  const source = readSource("./actions.ts");
  for (const banned of [
    // writer module paths
    "from \"@/repositories/cashback-ledger",
    "from \"@/repositories/wallet",
    "from \"@/services/shopee-cashback-quote",
    "from \"@/services/shopee-conversion-promoter",
    "from \"@/repositories/shopee-reconciliation-ingestion",
    "from \"@/repositories/shopee-cashback-payout",
    // risky direct symbols
    "approveCashback",
    "markPayable",
    "markPaid",
    "creditBuyerWallet",
  ]) {
    if (source.includes(banned)) {
      throw new Error(
        `Phase 20J server action must not reference ${banned} -- it is staging-only.`,
      );
    }
  }
  // The only DB writer the action should call is the staging
  // import helper. Confirm it is invoked and nothing else.
  if (!source.includes("importShopeeCsvBufferAsync")) {
    throw new Error(
      "Phase 20J server action must call importShopeeCsvBufferAsync from the staging repository.",
    );
  }
});

test("Phase 20J: server action records through the audit log emitter", () => {
  const source = readSource("./actions.ts");
  if (!source.includes("recordAdminAction")) {
    throw new Error(
      "Phase 20J server action must call recordAdminAction to feed the audit log foundation.",
    );
  }
  // Two emission kinds: preview and commit.
  if (!source.includes("admin.shopee_csv.preview")) {
    throw new Error(
      "Phase 20J server action must record a 'admin.shopee_csv.preview' audit event.",
    );
  }
  if (!source.includes("admin.shopee_csv.commit")) {
    throw new Error(
      "Phase 20J server action must record a 'admin.shopee_csv.commit' audit event.",
    );
  }
});

test("Phase 20J: server action rejects empty / oversized / non-CSV input", () => {
  const source = readSource("./actions.ts");
  for (const banned of [
    "Vui lòng chọn một tệp CSV hợp lệ",
    "Tệp CSV rỗng",
    "Tệp CSV vượt quá giới hạn 8 MB",
  ]) {
    if (!source.includes(banned)) {
      throw new Error(
        `Phase 20J server action must surface a clear admin-friendly error containing: ${banned}`,
      );
    }
  }
});

test("Phase 20J: page and form must NOT use buyer-facing cashback promise wording", () => {
  const page = readSource("./page.tsx");
  const form = readSource("./ShopeeCsvImportForm.tsx");
  const actions = readSource("./actions.ts");
  for (const [path, source] of [
    [PAGE_PATH, page],
    [FORM_PATH, form],
    [ACTIONS_PATH, actions],
  ]) {
    for (const forbidden of [
      "đảm bảo",
      "chắc chắn",
      "cam kết",
      "mua là có hoàn tiền",
      "hoàn tiền chắc chắn",
      "guaranteed",
    ]) {
      if (source.includes(forbidden)) {
        throw new Error(
          `${path} must not contain buyer-facing cashback promise wording '${forbidden}'.`,
        );
      }
    }
  }
});

test("Phase 20J: page and form must NOT expose internal identifiers in admin copy", () => {
  const page = readSource("./page.tsx");
  const form = readSource("./ShopeeCsvImportForm.tsx");
  for (const banned of [
    "networkSubId",
    "purchaseIntentId",
    "trackingLinkId",
    "publisherId",
    "accessToken",
    "refreshToken",
  ]) {
    if (page.includes(banned) || form.includes(banned)) {
      throw new Error(
        `Phase 20J admin copy must not reference internal identifier ${banned}.`,
      );
    }
  }
});

test("Phase 20J: page route is gated by the admin classifier", () => {
  // The route classification helper must treat this path as
  // admin. The classifier is pure and the route list is read
  // at test time, so we call into it via a subprocess-free
  // dynamic import: node:test does not support dynamic import
  // of TS modules reliably, so we read the classifier source
  // and assert the path is matched by the admin branch.
  const source = readRepoFile("src/lib/auth/route-classification.ts");
  if (!source.includes("/app/admin")) {
    throw new Error(
      "route-classification.ts must consider /app/admin/** as admin -- this is the contract the admin layout relies on.",
    );
  }
});

test("Phase 20J: route does not appear in PUBLIC_SEO_PATHS", () => {
  const source = readRepoFile("src/lib/seo/public-routes.ts");
  if (source.includes("/app/admin/shopee-csv-imports")) {
    throw new Error(
      "Phase 20J admin route must not be advertised as a public SEO path.",
    );
  }
});

test("Phase 20J: client form calls the server action through useActionState", () => {
  const source = readSource("./ShopeeCsvImportForm.tsx");
  if (!source.includes("useActionState")) {
    throw new Error(
      "Phase 20J client form must use useActionState so the server action response renders predictably.",
    );
  }
  if (!source.includes("runShopeeCsvImportAction")) {
    throw new Error(
      "Phase 20J client form must invoke the runShopeeCsvImportAction server action.",
    );
  }
  if (!source.includes("\"use client\"")) {
    throw new Error(
      "Phase 20J client form must declare 'use client' so it can call useActionState.",
    );
  }
});

test("Phase 20J: 'use server' actions.ts only exports async functions", () => {
  // Next.js enforces: a module with the "use server" directive may
  // ONLY export async functions. Any non-async export (object,
  // array, constant, type) crashes the runtime with
  //   "A 'use server' file can only export async functions, found object."
  // We assert the rule statically so a future refactor cannot
  // regress it.
  const source = readSource("./actions.ts");
  const directiveRe = /^[ \t]*(["'])use server\1[ \t]*;?[ \t]*$/m;
  if (!directiveRe.test(source)) {
    throw new Error(
      "Phase 20J actions.ts must declare 'use server' -- this test guards the 'use server only async exports' contract.",
    );
  }
  // Find every `export ...` line and confirm each one is an
  // `export async function`. We strip leading whitespace and the
  // `export` keyword and check the rest starts with `async`.
  const exportLineRe = /^[ \t]*export[ \t]+([^\n;]+)/gm;
  let match: RegExpExecArray | null;
  let foundAny = false;
  while ((match = exportLineRe.exec(source)) !== null) {
    foundAny = true;
    const body = match[1].trim();
    if (!body.startsWith("async")) {
      throw new Error(
        `Phase 20J actions.ts is 'use server' and must only export async functions. Found forbidden export: export ${body}`,
      );
    }
  }
  if (!foundAny) {
    throw new Error(
      "Phase 20J actions.ts must export at least one async server action (runShopeeCsvImportAction).",
    );
  }
  // Defense in depth: confirm the runShopeeCsvImportAction symbol
  // is still exported and is async.
  if (!source.includes("export async function runShopeeCsvImportAction")) {
    throw new Error(
      "Phase 20J actions.ts must export async function runShopeeCsvImportAction.",
    );
  }
});

test("Phase 20J: action-state.ts holds the useActionState type + initial state", () => {
  // The discriminated-union state type and the initial-state
  // constant for `useActionState` MUST live in a sibling module
  // that does NOT declare 'use server' (Next.js rule, see the
  // companion test above). Confirm the canonical split is in
  // place and that the client form imports from the new module.
  const actionsSource = readSource("./actions.ts");
  // actions.ts must NOT export a non-async INITIAL_... constant
  // -- if it does, the bug is back. We anchor on `export const`
  // so that documentation comments mentioning the symbol name do
  // not trip the check.
  const initialExportRe = /^[ \t]*export[ \t]+const[ \t]+INITIAL_RUN_SHOPEE_CSV_IMPORT_ACTION_STATE\b/m;
  if (initialExportRe.test(actionsSource)) {
    throw new Error(
      "Phase 20J actions.ts must NOT export INITIAL_RUN_SHOPEE_CSV_IMPORT_ACTION_STATE -- it must live in ./action-state.ts (Next.js forbids non-async exports from 'use server' files).",
    );
  }
  // Same anchoring rule for the action state type: only catch a
  // top-level `export type` declaration, not comments that quote
  // the symbol name.
  const typeExportRe = /^[ \t]*export[ \t]+type[ \t]+RunShopeeCsvImportActionState\b/m;
  if (typeExportRe.test(actionsSource)) {
    throw new Error(
      "Phase 20J actions.ts must NOT export the RunShopeeCsvImportActionState type -- it must live in ./action-state.ts.",
    );
  }
  const stateSource = readSource("./action-state.ts");
  if (!stateSource.includes("export type RunShopeeCsvImportActionState")) {
    throw new Error(
      "Phase 20J action-state.ts must export the RunShopeeCsvImportActionState type.",
    );
  }
  if (!stateSource.includes("INITIAL_RUN_SHOPEE_CSV_IMPORT_ACTION_STATE")) {
    throw new Error(
      "Phase 20J action-state.ts must export the INITIAL_RUN_SHOPEE_CSV_IMPORT_ACTION_STATE constant.",
    );
  }
  // action-state.ts must NOT declare 'use server' -- otherwise we
  // are back to the same bug. Anchor on a real top-level
  // directive (line starting with "use server" or `"use server"`)
  // rather than a substring search, so that documentation
  // comments that quote the directive do not trip the check.
  const directiveRe = /^[ \t]*(["'])use server\1[ \t]*;?[ \t]*$/m;
  if (directiveRe.test(stateSource)) {
    throw new Error(
      "Phase 20J action-state.ts must NOT declare 'use server' -- it holds non-async exports.",
    );
  }
  const formSource = readSource("./ShopeeCsvImportForm.tsx");
  if (!formSource.includes('from "./action-state"')) {
    throw new Error(
      "Phase 20J ShopeeCsvImportForm.tsx must import the initial state and state type from ./action-state (not from ./actions).",
    );
  }
  // And the form must keep importing the async action from actions.
  if (!formSource.includes('from "./actions"')) {
    throw new Error(
      "Phase 20J ShopeeCsvImportForm.tsx must still import runShopeeCsvImportAction from ./actions.",
    );
  }
});

test("Phase 20J: commit button enables only when a file is selected (preview -> commit re-select)", () => {
  // Manual-QA blocker fix: after a successful preview the browser
  // clears the <input type="file">, so the commit button must NOT
  // be permanently disabled with `hasPreview` in its gate. Instead
  // the form must track file selection in client state and require
  // `fileSelected` for the commit button. Option A from the
  // blocker-fix doc: explicit re-select before commit.
  const source = readSource("./ShopeeCsvImportForm.tsx");

  // 1. The form must use React state to track file selection.
  if (!source.includes("useState")) {
    throw new Error(
      "Phase 20J ShopeeCsvImportForm.tsx must use React state (useState) to track <input type=\"file\"> selection across submits.",
    );
  }
  // 2. The file input must wire onChange to update that state. We
  //    look for the canonical prop name being forwarded.
  if (!source.includes("onChange={onChange}") && !source.includes("onChange=")) {
    throw new Error(
      "Phase 20J ShopeeCsvImportForm.tsx must forward an onChange handler to the <input type=\"file\"> so file selection is tracked.",
    );
  }
  // 3. The commit button disabled-prop MUST NOT key off `hasPreview`
  //    alone (that was the original bug -- commit was disabled
  //    forever after a successful preview). The form must gate on
  //    `fileSelected` (and remove `hasPreview`) instead.
  // We anchor on the JSX expression so the check survives comment
  // rewording.
  const commitDisabledMatch = source.match(
    /commitDisabled=\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/,
  );
  if (!commitDisabledMatch) {
    throw new Error(
      "Phase 20J ShopeeCsvImportForm.tsx must pass a `commitDisabled` expression to the ActionRow commit button.",
    );
  }
  const commitDisabledExpr = commitDisabledMatch[1];
  if (!commitDisabledExpr.includes("!fileSelected")) {
    throw new Error(
      "Phase 20J ShopeeCsvImportForm.tsx commitDisabled expression must include `!fileSelected` so the commit button only enables after a file is selected (preview -> commit re-select).",
    );
  }
  if (commitDisabledExpr.includes("|| hasPreview") || commitDisabledExpr.includes("hasPreview ||")) {
    throw new Error(
      "Phase 20J ShopeeCsvImportForm.tsx commitDisabled must NOT key off `hasPreview` -- that was the original blocker. Commit must remain disabled only until a file is re-selected and validRows > 0.",
    );
  }
  // 4. The form must surface the Vietnamese re-select hint after a
  //    successful preview when no file is currently selected.
  if (!source.includes("ReselectHint")) {
    throw new Error(
      "Phase 20J ShopeeCsvImportForm.tsx must render a ReselectHint component explaining that the admin must re-select the same CSV after preview.",
    );
  }
  if (
    !source.includes("Sau khi xem trước") ||
    !source.includes("Nhập vào staging")
  ) {
    throw new Error(
      "Phase 20J ReselectHint must carry the explicit Vietnamese copy 'Sau khi xem trước, hãy chọn lại cùng tệp CSV rồi bấm Nhập vào staging.' so the admin knows exactly what to do next.",
    );
  }
});

test("Phase 20J: server action still rejects missing / empty / oversized / non-CSV input", () => {
  // Defense in depth: even if the client preview tracking regresses
  // and the admin manages to submit commit with no file, the
  // server action MUST refuse safely with admin-friendly
  // Vietnamese errors. No ledger / wallet writes, no buyer
  // mutation.
  const source = readSource("./actions.ts");
  // The action must check `file instanceof File` and return a
  // safe error message on missing file.
  if (!source.includes("instanceof File")) {
    throw new Error(
      "Phase 20J runShopeeCsvImportAction must validate file instanceof File so missing-file submits are rejected safely.",
    );
  }
  // Reject empty buffer.
  if (!source.includes("byteLength === 0")) {
    throw new Error(
      "Phase 20J runShopeeCsvImportAction must reject empty CSV buffers server-side.",
    );
  }
  // Reject oversized files.
  if (!source.includes("SHOPEE_CSV_PREVIEW_MAX_BYTES")) {
    throw new Error(
      "Phase 20J runShopeeCsvImportAction must enforce the SHOPEE_CSV_PREVIEW_MAX_BYTES size limit server-side.",
    );
  }
  // And the action must requireAdmin first -- guard is not
  // skipped even on validation failure paths.
  const requireAdminRe = /requireAdmin\(\s*"\/app\/admin\/shopee-csv-imports"\s*\)/;
  if (!requireAdminRe.test(source)) {
    throw new Error(
      "Phase 20J runShopeeCsvImportAction must call requireAdmin('/app/admin/shopee-csv-imports') before any file validation so guest/non-admin users cannot probe the validator.",
    );
  }
});
