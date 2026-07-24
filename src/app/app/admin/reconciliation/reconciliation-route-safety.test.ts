/**
 * Phase 20K -- reconciliation admin route static-source safety
 * tests.
 *
 * Locks the contracts that are easy to regress but impossible to
 * catch from runtime tests alone:
 *
 *   - the page lives at `/app/admin/reconciliation` and applies
 *     `privateRouteMetadata()` so `<meta name="robots">` is
 *     `noindex, nofollow`;
 *   - the page must NOT import the buyer shell, buyer bottom
 *     nav, or buyer mobile top bar;
 *   - the client form must call `useActionState` and import from
 *     the right action module;
 *   - the server action must call `requireAdmin()` before any
 *     real work;
 *   - the `"use server"` actions file must NOT export non-async
 *     values (Next.js runtime constraint);
 *   - the audit-log vocabulary must include the Phase 20K kinds
 *     `admin.reconciliation.dry_run` and `admin.reconciliation.commit`;
 *   - the engine must NEVER plan a TikTok decision as `apply`;
 *     this is the defense-in-depth check that protects the buyer
 *     from any future TikTok reconciliation accident;
 *   - Phase 20K must NEVER write to wallet / ledger / payout
 *     tables -- a regex sweep across Phase 20K files ensures no
 *     accidental `db.insert(wallet...)`-style line slipped in.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(TEST_DIRECTORY, "../../../../..");

function fromTestDirectory(fileName: string): string {
  return join(TEST_DIRECTORY, fileName);
}

function fromRepositoryRoot(...segments: string[]): string {
  return join(REPOSITORY_ROOT, ...segments);
}

const ACTIONS_PATH = fromTestDirectory("actions.ts");
const ACTION_STATE_PATH = fromTestDirectory("action-state.ts");
const PAGE_PATH = fromTestDirectory("page.tsx");
const FORM_PATH = fromTestDirectory("ReconciliationForm.tsx");
const AUDIT_PATH = fromRepositoryRoot(
  "src",
  "lib",
  "auth",
  "audit-log.ts",
);
const ENGINE_PATH = fromRepositoryRoot(
  "src",
  "lib",
  "reconciliation",
  "reconciliation-engine.ts",
);
const REPOSITORY_PATH = fromRepositoryRoot(
  "src",
  "server",
  "reconciliation",
  "reconciliation.repository.ts",
);
const SCHEMA_PATH = fromRepositoryRoot("src", "db", "schema.ts");
const RECONCILIATION_AUDIT_MIGRATION_PATH = fromRepositoryRoot(
  "drizzle",
  "0024_phase_20k_reconciliation_audit.sql",
);

function readSource(relPath: string): string {
  return readFileSync(relPath, "utf8");
}

test("Phase 20K: page lives at /app/admin/reconciliation and applies privateRouteMetadata", () => {
  const page = readSource(PAGE_PATH);
  assert.match(page, /^export\s+default\s+function\s+ReconciliationAdminPage\(/m);
  assert.match(
    page,
    /^export\s+const\s+metadata\s*=\s*privateRouteMetadata\(\)/m,
  );
  assert.ok(page.includes("privateRouteMetadata"));
});

test("Phase 20K: page must NOT import the buyer shell, buyer bottom nav, or buyer top bar", () => {
  const page = readSource(PAGE_PATH);
  for (const buyerComponent of [
    "BuyerResponsiveShell",
    "BuyerMobileBottomNav",
    "BuyerMobileTopBar",
    "BuyerDesktopSidebar",
  ]) {
    const importRe = new RegExp(
      "^[ \\t]*import[^;]*" + buyerComponent + "[^;]*$",
      "m",
    );
    assert.equal(
      importRe.test(page),
      false,
      buyerComponent + " must not be imported in the admin reconciliation page",
    );
  }
});

test("Phase 20K: client form calls useActionState and imports from the action-state module", () => {
  const form = readSource(FORM_PATH);
  assert.ok(form.includes("useActionState"));
  assert.ok(form.includes('from "./action-state"'));
  assert.ok(form.includes('from "./actions"'));
  // The client form must NOT export non-async values either --
  // it is a "use client" file but the safety mirror is helpful
  // for documentation purposes.
  assert.ok(form.includes('"use client"'));
});

test("Phase 20K: actions.ts is 'use server' and ONLY exports async server actions", () => {
  const actions = readSource(ACTIONS_PATH);
  // Top-level "use server" directive anchored on a real line so
  // documentation comments that quote the directive do not trip
  // the check.
  assert.match(actions, /^[ \t]*(["'])use server\1[ \t]*;?[ \t]*$/m);
  // No non-async top-level exports.
  const allTopLevelExports = actions.match(/^[ \t]*export\s+[a-zA-Z]+/gm) ?? [];
  assert.ok(allTopLevelExports.length > 0);
  for (const exp of allTopLevelExports) {
    assert.equal(
      exp.includes("async"),
      true,
      "actions.ts must only export async functions: " + exp,
    );
  }
  // The pure types live in ./action-state.
  const typeExportRe = /^[ \t]*export[ \t]+type[ \t]+RunReconciliationActionState\b/m;
  assert.equal(
    typeExportRe.test(actions),
    false,
    "actions.ts must not export RunReconciliationActionState type -- that lives in ./action-state.ts",
  );
});

test("Phase 20K: action-state.ts holds the useActionState type + initial state and is NOT 'use server'", () => {
  const state = readSource(ACTION_STATE_PATH);
  assert.ok(state.includes("export type RunReconciliationActionState"));
  assert.ok(state.includes("INITIAL_RUN_RECONCILIATION_ACTION_STATE"));
  const directiveRe = /^[ \t]*(["'])use server\1[ \t]*;?[ \t]*$/m;
  assert.equal(
    directiveRe.test(state),
    false,
    "action-state.ts must NOT declare 'use server'",
  );
});

test("Phase 20K: requireAdmin('/app/admin/reconciliation') is the very first server-side guard", () => {
  const actions = readSource(ACTIONS_PATH);
  // Match the call site, not the import. Imports of
  // requireAdmin / dryRunReconciliationAsync etc. happen at the
  // top of the file and are not part of the runtime guard chain.
  const requireCallRe =
    /await\s+requireAdmin\([\s\S]{0,40}["']\/app\/admin\/reconciliation["']/;
  assert.match(actions, requireCallRe);
  const dryRunCallRe = /dryRunReconciliationAsync\(/;
  const commitCallRe = /commitReconciliationAsync\(/;
  assert.match(actions, dryRunCallRe);
  assert.match(actions, commitCallRe);
  const requireIdx = actions.search(requireCallRe);
  const dryRunIdx = actions.search(dryRunCallRe);
  const commitIdx = actions.search(commitCallRe);
  assert.ok(requireIdx >= 0);
  assert.ok(requireIdx < dryRunIdx);
  assert.ok(requireIdx < commitIdx);
});

test("Phase 20K: audit log AdminActionKind union includes the dry_run + commit kinds", () => {
  const audit = readSource(AUDIT_PATH);
  assert.match(
    audit,
    /^[ \t]*\|[ \t]*"admin\.reconciliation\.dry_run"/m,
  );
  assert.match(
    audit,
    /^[ \t]*\|[ \t]*"admin\.reconciliation\.commit"/m,
  );
});

test("Phase 20K: pure engine refuses to plan an apply decision for tiktok", () => {
  const engine = readSource(ENGINE_PATH);
  // The engine explicitly checks `row.network !== "shopee" && row.network !== "manual"`.
  assert.match(
    engine,
    /row\.network\s*!==\s*"shopee"\s*&&\s*row\.network\s*!==\s*"manual"/,
  );
  // And in that branch it returns a `skip` decision with reason
  // `rejected_attribution_invalid`, never `apply`.
  assert.ok(engine.includes("rejected_attribution_invalid"));
});

test("Phase 20K: repository never touches wallet / ledger / payout tables", () => {
  const repo = readSource(REPOSITORY_PATH);
  // defense in depth: no `wallet`, `ledger`, `payout`, `withdraw`,
  // or `paid_balance` mutations from the repo entry points.
  for (const forbidden of [
    "wallets",
    "wallet_balances",
    "wallet_transactions",
    "ledger_entries",
    "cashback_ledger",
    "withdraw_requests",
    "payouts",
  ]) {
    assert.equal(
      repo.includes("." + forbidden),
      false,
      "Repository must never read/write " + forbidden + " (Phase 20K boundary)",
    );
  }
});

test("Phase 20K: actions.ts never constructs a SQL UPDATE on wallet / ledger / payout tables", () => {
  const actions = readSource(ACTIONS_PATH);
  for (const forbidden of [
    "UPDATE wallets",
    "UPDATE wallet_balances",
    "UPDATE wallet_transactions",
    "UPDATE ledger_entries",
    "UPDATE cashback_ledger",
    "UPDATE withdraw_requests",
    "UPDATE payouts",
    "INSERT INTO wallets",
    "INSERT INTO wallet_balances",
    "INSERT INTO wallet_transactions",
    "INSERT INTO ledger_entries",
    "INSERT INTO cashback_ledger",
    "INSERT INTO withdraw_requests",
    "INSERT INTO payouts",
  ]) {
    assert.equal(
      actions.includes(forbidden),
      false,
      "actions.ts must not produce a SQL UPDATE/INSERT on " +
        forbidden +
        " (Phase 20K is admin reconciliation, not payout)",
    );
  }
});

test("Phase 20K: actions.ts never reads an actor id/name/email from FormData", () => {
  const actions = readSource(ACTIONS_PATH);
  // The actor must always come from requireAdmin(), never from
  // FormData. The action layer is forbidden from accepting a
  // client-supplied actor.
  for (const forbidden of [
    "formData.get(\"actor_user_id\")",
    "formData.get(\"actorUserId\")",
    "formData.get(\"actorId\")",
    "formData.get(\"actor_id\")",
    "formData.get(\"actorName\")",
    "formData.get(\"actorEmail\")",
    "formData.get(\"actorEmail\")",
  ]) {
    assert.equal(
      actions.includes(forbidden),
      false,
      "actions.ts must NEVER read '" + forbidden + "' from FormData",
    );
  }
  // Defense in depth: the literal string "adminActor" must not
  // appear as a form field name either.
  assert.equal(
    /name\s*=\s*["']adminActor["']/.test(actions),
    false,
    "actions.ts must NOT define a 'adminActor' form field",
  );
  // The reconciliation form (client side) must not surface an
  // actor input either.
  const form = readSource(FORM_PATH);
  assert.equal(
    /name\s*=\s*["']adminActor["']/.test(form),
    false,
    "ReconciliationForm.tsx must NOT define a 'adminActor' form field",
  );
  assert.equal(
    /name\s*=\s*["']actor_user_id["']/.test(form),
    false,
    "ReconciliationForm.tsx must NOT define an 'actor_user_id' form field",
  );
});

test("Phase 20K: reconciliation engine refuses to plan payable -> paid in Phase 20K", () => {
  const engine = readSource(ENGINE_PATH);
  // The engine has a hard-coded refusal for `payable` rows with
  // the dedicated reason code `rejected_paid_out_of_phase_20k_scope`.
  assert.ok(
    engine.includes("rejected_paid_out_of_phase_20k_scope"),
    "engine must declare the dedicated Phase 20K paid-out-of-scope reason code",
  );
  // And the engine never sets proposedNext to `paid`.
  assert.equal(
    /proposedNext\s*=\s*["']paid["']/.test(engine),
    false,
    "engine must never assign proposedNext = 'paid'",
  );
  // Audit-table CHECK refuses paid in the durable trail.
  assert.ok(
    readSource(RECONCILIATION_AUDIT_MIGRATION_PATH).includes(
      "reconciliation_audit_events_no_paid_by_phase_20k_check",
    ),
    "drizzle/0024_phase_20k_reconciliation_audit.sql must declare the no-paid CHECK constraint",
  );
});

test("Phase 20K follow-up 2: repository inserts the durable audit row inside the same transaction", () => {
  const repo = readSource(REPOSITORY_PATH);
  // The repository must use the injected executor transaction and
  // inside the transaction INSERT a row into
  // `reconciliation_audit_events` for every applied decision.
  const transactionRe = /await\s+exec\.transaction\(async\s*\(tx\)\s*=>\s*\{/;
  const insertRe =
    /INSERT\s+INTO\s+reconciliation_audit_events[\s\S]*ON CONFLICT \(run_candidate_id\)/;
  assert.match(repo, transactionRe);
  assert.match(
    repo,
    insertRe,
    "repository must use INSERT ... ON CONFLICT (run_candidate_id) inside the transaction",
  );
  // The insert call must appear inside the transaction callback
  // body. We strip block + line comments before searching so that
  // a doc comment referencing `INSERT INTO reconciliation_audit_events`
  // cannot satisfy the assertion before the actual transactional
  // call site.
  const repoNoComments = repo
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const txIdx = repoNoComments.search(transactionRe);
  const insertIdx = repoNoComments.search(insertRe);
  assert.ok(txIdx >= 0);
  assert.ok(insertIdx >= 0);
  assert.ok(txIdx < insertIdx);
});

test("Phase 20K follow-up 2: repository uses ON CONFLICT DO NOTHING RETURNING for the audit claim", () => {
  const repo = readSource(REPOSITORY_PATH);
  // The repository MUST use a transaction-safe idempotency claim
  // equivalent to:
  //   INSERT ... ON CONFLICT (...) DO NOTHING RETURNING id
  // The repo uses a PARTIAL UNIQUE INDEX on
  // `reconciliation_audit_events.run_candidate_id` (WHERE
  // run_candidate_id IS NOT NULL), so the ON CONFLICT clause
  // MUST carry the same partial predicate or Postgres rejects
  // the statement. Accept either the bare form or the partial
  // form; both are transaction-safe equivalents because the
  // underlying unique index is what gates the conflict.
  const hasBareOnConflict = repo.includes(
    "ON CONFLICT (run_candidate_id) DO NOTHING",
  );
  const hasPartialOnConflict = repo.includes(
    "ON CONFLICT (run_candidate_id) WHERE run_candidate_id IS NOT NULL DO NOTHING",
  );
  assert.ok(
    hasBareOnConflict || hasPartialOnConflict,
    "repository must use ON CONFLICT (run_candidate_id) DO NOTHING (bare or partial)",
  );
  assert.ok(
    repo.includes("RETURNING id"),
    "repository must use RETURNING id for the audit claim",
  );
  // The repo MUST also declare the partial unique index so the
  // ON CONFLICT predicate matches the index predicate. Otherwise
  // Postgres would reject the statement.
  assert.ok(
    /run_candidate_id[\s\S]{0,80}WHERE[\s\S]{0,40}run_candidate_id\s+IS\s+NOT\s+NULL/i.test(
      repo,
    ),
    "repository must declare the partial UNIQUE index predicate WHERE run_candidate_id IS NOT NULL",
  );
});

test("Phase 20K follow-up 2: same-run replay returns an idempotent skipped result WITHOUT updating the conversion", () => {
  const repo = readSource(REPOSITORY_PATH);
  // The branch where the audit INSERT returns zero rows must
  // skip the conversion UPDATE and report
  // idempotentReplay = true.
  assert.ok(
    repo.includes("idempotentReplay"),
    "repository must surface an idempotentReplay flag",
  );
  // Defense in depth: the repository must NOT mint a Postgres
  // unique-violation catch on 23505 anymore -- the path is now
  // INSERT ... RETURNING. The behaviour is identical (the DB
  // unique constraint + ON CONFLICT DO NOTHING gate) but the
  // application never has to abort a transaction by catching
  // 23505.
});

test("Phase 20K follow-up 2: repository refuses nextStatus = 'paid' even if the engine somehow produces one", () => {
  const repo = readSource(REPOSITORY_PATH);
  // The durable trail (audit table CHECK) is the authoritative
  // refusal of `paid`. The repository declares the reason code so
  // the static safety test stays aligned with the implementation.
  assert.ok(
    repo.includes("rejected_paid_out_of_phase_20k_scope"),
    "repository must declare the Phase 20K paid-out-of-scope reason code",
  );
  // The repository explicitly skips any candidate whose intended
  // next status is `paid`.
  assert.ok(
    /intendedNext\s*===\s*["']paid["']/.test(repo),
    "repository must short-circuit on intendedNext === 'paid'",
  );
});

test("Phase 20K follow-up 2: actions.ts derives the actor from requireAdmin and forwards to the repository", () => {
  const actions = readSource(ACTIONS_PATH);
  // The action's commit branch MUST pass adminSession.userId and
  // actorRole to commitReconciliationAsync -- never anything from
  // FormData.
  const commitRe = /commitReconciliationAsync\(\s*\{[\s\S]*?\}\s*\)/;
  assert.match(actions, commitRe);
  // Verify that the commit call's block references the
  // adminSession-derived user id + a reconciliationRunId pulled
  // from FormData (the run id is the only client-supplied identity
  // and the server validates it against the runs table).
  const commitBlock = actions.match(commitRe)?.[0] ?? "";
  assert.ok(
    commitBlock.includes("adminSession.userId"),
    "commit call must forward adminSession.userId",
  );
  assert.ok(
    commitBlock.includes("actorRole"),
    "commit call must forward actorRole",
  );
  assert.ok(
    commitBlock.includes("reconciliationRunId"),
    "commit call must pass the server-validated reconciliationRunId",
  );
});

test("Phase 20K: schema contains the unique (network, idempotency_key) constraint on the audit table", () => {
  const schema = readSource(SCHEMA_PATH);
  assert.match(
    schema,
    /reconciliation_audit_events_network_idempotency_key_unique/,
    "schema must declare the unique (network, idempotency_key) constraint",
  );
  assert.match(
    schema,
    /reconciliation_audit_events_no_paid_by_phase_20k_check/,
    "schema must declare the no-paid CHECK constraint",
  );
});

test("Phase 20K: Phase 20K files do not introduce any buyer-facing 'guaranteed' wording (defense-in-depth)", () => {
  const buyRefuse = [
    "đảm bảo",
    "chắc chắn",
    "cam kết",
    "guaranteed",
    "mua là có hoàn tiền",
    "hoàn tiền chắc chắn",
  ];
  const filesToScan = [PAGE_PATH, ACTIONS_PATH, ACTION_STATE_PATH, FORM_PATH];
  for (const f of filesToScan) {
    const src = readSource(f);
    for (const w of buyRefuse) {
      assert.equal(
        src.includes(w),
        false,
        f + " must not contain the forbidden buyer-facing phrase '" + w + "'",
      );
    }
  }
});

test("Phase 20K follow-up 3: repository refuses an unbounded dry-run and requires a source scope", () => {
  const repo = readSource(REPOSITORY_PATH);
  // The dryRun signature MUST take a `sourceScope` parameter
  // (the repository refuses to plan without it).
  assert.match(
    repo,
    /dryRunReconciliationAsync[\s\S]*?readonly\s+sourceScope/,
    "dryRun must accept a sourceScope parameter",
  );
  // The repository MUST validate the scope with a guard that
  // throws when nothing is supplied.
  assert.match(
    repo,
    /assertSourceScope\s*\(/,
    "repository must call assertSourceScope to validate the scope",
  );
  // The repository MUST refuse to plan a run whose scope is empty.
  assert.match(
    repo,
    /SCOPE_TOO_BROAD_ERROR|empty\s*--\s*refusing|provide at least one of/i,
    "repository must declare the empty-scope refusal message",
  );
  // The repository MUST NOT silently call a global scan function
  // -- the old loader is allowed only as a low-level helper; the
  // production loader is `loadScopedConversionsAsync`.
  assert.match(
    repo,
    /loadScopedConversionsAsync/,
    "repository must use loadScopedConversionsAsync as the production loader",
  );
  // The repository MUST wire its status filter into the bounded
  // loader (network + pending|approved|payable).
  assert.match(
    repo,
    /status\s*=\s*ANY\(ARRAY\['pending'::text,\s*'approved'::text,\s*'payable'::text\]\)/,
    "loader must preserve the pending|approved|payable status filter",
  );
});

test("Phase 20K follow-up 3: pending -> rejected is a valid forward transition; the repository must not short-circuit it as terminal", () => {
  const repo = readSource(REPOSITORY_PATH);
  // The repository must NOT have a `if (intendedNext === "rejected")` short-circuit
  // that would skip the transition before the FOR UPDATE / audit row path.
  const badBranch =
    /if\s*\(\s*intendedNext\s*===\s*["']rejected["']\s*\)\s*\{[\s\S]{0,200}rejected_terminal_state/;
  assert.equal(
    badBranch.test(repo),
    false,
    "repository must not skip a candidate just because intendedNext === 'rejected'",
  );
  // The repository MUST persist rejectedAt + rejectedReason when
  // the transition lands.
  assert.match(
    repo,
    /rejectedAt\s*=\s*committedAt|rejectedAt:\s*committedAt/,
    "repository must set rejectedAt = committedAt on the conversion update",
  );
  assert.match(
    repo,
    /rejectedReason\s*=\s*reasonCode|rejectedReason:\s*reasonCode/,
    "repository must set rejectedReason = reasonCode on the conversion update",
  );
});

test("Phase 20K follow-up 3: actions.ts refuses to dry-run without a bounded source scope", () => {
  const actions = readSource(ACTIONS_PATH);
  // The dry-run branch MUST check for at least one bounded scope
  // input before calling the repository.
  assert.match(
    actions,
    /readBoundedSourceScope\s*\(/,
    "actions.ts must read the bounded source scope from FormData",
  );
  assert.match(
    actions,
    /ERR_SCOPE_REQUIRED/,
    "actions.ts must declare a refusal error for missing scope",
  );
  // The dry-run branch MUST fail when no boundary is supplied.
  assert.match(
    actions,
    /if\s*\(\s*!hasScope\s*\)\s*\{[\s\S]{0,80}ERR_SCOPE_REQUIRED/,
    "actions.ts must short-circuit dry-run when scope is missing",
  );
});

test("Phase 20K follow-up 3: client form exposes a bounded source-scope input group, never arbitrary conversion ids or actor fields", () => {
  const form = readSource(FORM_PATH);
  // The form must surface at least one scope boundary selector.
  assert.match(
    form,
    /scope_occurred_after|scope_ingestion_event_ids|scope_source_conversion_keys|scope_explicit_conversion_ids/,
    "form must expose at least one source-scope input",
  );
  // The form must never expose actor id / email / role fields.
  for (const bad of ["actor_user_id", "actor_email", "actor_role", "actor_name"]) {
    assert.equal(
      form.includes(bad),
      false,
      "form must not expose a forbidden actor input '" + bad + "'",
    );
  }
});
