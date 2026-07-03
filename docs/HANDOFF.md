# Vaffiliate Handoff

## 1. Purpose and Read Order

This document provides the operational handoff for the Vaffiliate repository
after Pull Request #25.

Before continuing implementation work, read these documents in order:

1. `docs/PROJECT_STATE.md`
2. `docs/ARCHITECTURE.md`
3. `docs/PHASE_20G0_ARCHITECTURE_DATA_CONTRACT.md`
4. `docs/HANDOFF.md`

Git history, source code, migrations, and verified command output take
precedence when stale documentation conflicts with the repository.

---

## 2. Current Repository State

Project: Vaffiliate

Current phase: Phase 20H.5 - Shopee Cashback Preview UI

Phase status: Complete and merged through Pull Request #25 at `84a6b4e`.
This branch synchronizes authoritative documentation after Pull Request #25.

Current branch:

`docs/sync-phase-20h5-after-merge`

Current baseline commit:

`84a6b4e` - Phase 20H.5 implementation merge commit and baseline for this post-merge documentation synchronization

Latest implementation merge:

`84a6b4e` - Merge Pull Request #25, Phase 20H.5 Shopee Cashback Preview UI

Integration branch:

`main`

Latest reachable stable tag:

`phase-19.5-complete`

The stable tag is historical. No Phase 20 completion tag has been created.

### Post-merge Documentation Worktree

This documentation branch updates only:

- `docs/PROJECT_STATE.md`
- `docs/HANDOFF.md`

No source code, test, package.json, schema, migration, configuration, or
runtime behavior change belongs in this branch. Phase 20H.5 is already
merged through Pull Request #25 and must not be reimplemented on this
branch or on any branch created from this one.

### Delivery Baseline

The repository baseline requires Node.js 24 and npm 11.

The CI delivery path is:

```text
npm ci
bootstrap Supabase-compatible PostgreSQL roles and auth helpers
npx drizzle-kit migrate
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run db:check
npm run build
```

The PostgreSQL integration test runs with:

```text
NODE_OPTIONS=--conditions=react-server
```

Pull Request #17 passed its delivery pipeline before merge. Pull
Request #25 (Phase 20H.5) passed the verified H.5 quality gates listed
in `### Phase 20H.5 - Shopee Cashback Preview UI` and the CI / Quality
check before its own merge. This documentation branch is
documentation-only and must not re-run the implementation quality
gates; its own merge-readiness bar is the documentation verification
commands listed in `## 11`.

Route classifications and generated-page counts must be derived from the
current successful Next.js build output. Do not copy historical Phase 19.5
counts.

---

## 3. Source of Truth

`docs/PROJECT_STATE.md` is authoritative for:

- current roadmap phase;
- current repository baseline;
- delivered milestones;
- planned phase boundaries;
- delivery status.

`docs/ARCHITECTURE.md` is authoritative for:

- the current application architecture;
- persisted and mock data boundaries;
- current domain ownership;
- security boundaries;
- supported platforms;
- the Shopee attribution and ingestion foundation delivered through Pull
  Request #17.

`docs/PHASE_20G0_ARCHITECTURE_DATA_CONTRACT.md` is authoritative for:

- conversion granularity;
- identifiers and idempotency;
- attribution evidence;
- ingestion and reconciliation;
- validation and settlement lifecycles;
- financial invariants;
- migration and rollback safety.

Updates annotated after Pull Request #17 reflect the partial Phase 20G.1
delivery without rewriting the historical contract.

`docs/HANDOFF.md` is authoritative for:

- operational continuation;
- verification requirements;
- implementation guardrails;
- merge-readiness instructions for the current documentation branch.

---

## 4. Operating Architecture Rules

Vaffiliate is a full-stack Next.js application deployed as one application
boundary.

Current platform decisions:

- Next.js App Router for UI and server execution;
- Vercel for application deployment;
- Supabase Auth for authentication;
- Supabase PostgreSQL for persisted application data;
- Drizzle ORM and Drizzle Kit for schema definitions and migrations;
- no separate Render backend in the current phase;
- Render may be introduced later only for long-running workers or heavy
  scheduled synchronization jobs.

### Read-Only Mock Domains

Domains that have not migrated to PostgreSQL may use:

```text
Page
-> Async Loader
-> Service
-> Repository
-> apiClient
-> mock-backend
```

Mock records are temporary application infrastructure. They are not a
financial or attribution source of truth.

### Persisted Server-Side Domains

Persisted flows use:

```text
Page or Server Action or Route Handler
-> Domain Service or Repository
-> Supabase client or PostgreSQL transaction
-> RLS policy or controlled SECURITY DEFINER RPC
```

### Global Rules

- Prefer Server Components for data loading.
- Client Components receive prepared data through props.
- Pages and presentational components must not access Supabase directly.
- Pages and components must not import mock domain data directly.
- Domain joins, financial calculations, and integrity checks belong in the
  service, repository, or database layer.
- Browser clients must not insert or update conversions.
- Publisher-scoped reads must enforce ownership through RLS or a controlled
  server boundary.
- Privileged writes must use server-only credentials.
- Server credentials must never use a `NEXT_PUBLIC_*` environment variable.
- Persisted and mock identifiers must not be treated as interchangeable.
- Financial values use integer VND amounts.
- Formatted currency strings are presentation-only.
- No React Query, Redux, Zustand, or Context-based domain data layer is
  currently required.
- Shopee and TikTok Shop are the only supported commerce platforms.
- Do not add guessed affiliate parameters to merchant URLs.
- Partner attribution must use a verified partner-specific adapter.
- Do not build a speculative universal affiliate-network implementation.
- TikTok Shop remains deferred; no TikTok-specific implementation may be mixed
  into the current Shopee phase.

---

## 5. Current Data Boundaries

### Persisted in Supabase PostgreSQL

The current persisted foundation includes:

- Supabase authentication users;
- publisher profiles;
- payout accounts;
- tracking links with stable `network_sub_id`;
- cashback click records with click-specific `click_token`;
- Shopee CSV import batches with file-level SHA-256 idempotency;
- Shopee CSV source rows with row-level SHA-256 fingerprint idempotency;
- persisted conversions readable for the authenticated publisher;
- persisted Shopee advertisers, campaigns, offers, and cashback policies.

These persisted flows must not silently fall back to mock records.

### Repository foundation versus production workflow

Pull Request #17 introduced the following capabilities as repositories or
test tooling. They are not yet a complete production operational workflow:

- Shopee CSV file parsing and persisted staging;
- CSV batch attribution that exact-matches `shopee_csv_rows.source_sub_id1`
  against `tracking_links.network_sub_id`;
- Shopee catalog classification through `classifyShopeeTrackingLinkAsync`,
  which acquires sequential `SELECT FOR UPDATE` row locks on `offers`,
  `campaigns`, `advertisers`, and `cashback_policies`, validates the
  locked eligibility snapshot against the full catalog contract, then
  acquires a `SELECT FOR UPDATE` row lock on the single owned
  `tracking_links` row and performs a conditional update of the
  `(campaign_id, offer_id)` pair only when both columns are currently
  `NULL`. The result is a consistent transactional database state;
- the PostgreSQL concurrency integration test covering the classification
  path;
- the `scripts/classify-shopee-tracking-link-worker.ts` test worker that
  exercises the classification repository.

The CSV ingestion pipeline stops at the `ready_for_conversion` processing
status. There is no production administration UI, route, scheduled worker,
or end-to-end operational command for the complete CSV pipeline.

### Mock or Partial

The following domains remain mock-backed or only partially persisted:

- dashboard summaries;
- consumer Orders;
- Finance and wallet balances;
- wallet transactions;
- withdrawal history;
- cashback history views;
- tracking-link list and analytics data;
- notifications;
- some catalog-facing UI and detail surfaces.

Pages that combine multiple sources must keep source boundaries explicit.

### Identifier Boundary

Persisted tracking-link identifiers are UUID values.

Legacy mock identifiers such as `trk-001`, `trk-002`, and `trk-003` are not
valid persisted tracking-link identifiers.

`tracking_links.network_sub_id` is a stable per-tracking-link attribution
token formatted `vaflnk` followed by 24 lowercase hexadecimal characters.
It is the field Shopee attribution matches against in CSV source rows.

`clicks.click_token` is a click-specific token. It is not currently
transmitted to Shopee and must not be described as the stable attribution
boundary.

Existing text identifiers must not be blindly cast to UUID during migrations.

---

## 6. Current Domain Status

### Authentication

Authentication uses Supabase Auth.

```text
Login or Registration Form
-> Server Action
-> Supabase Auth
-> Auth callback
-> Authenticated application route
```

Authentication redirects must derive their origin from trusted request
headers or the configured site URL.

### Profile and Payout Accounts

Profile and payout-account reads and writes are persisted.

They use authenticated server-side Supabase access, and ownership is derived
from the authenticated user ID.

Avatar upload, membership management, referral workflows, and the settings
center remain deferred.

### Catalog

The persisted Shopee catalog foundation is delivered as repositories, schema,
and a PostgreSQL concurrency integration test.

Persisted catalog tables currently include:

- `advertisers`;
- `campaigns`;
- `offers`;
- `cashback_policies`.

The catalog is intentionally read-only from the client. It is
server-managed, and client writes against the catalog tables are
not part of the current application flow.

Public catalog-facing UI, Campaign Detail, and Offer Detail pages are not yet
migrated from mock data and must not silently combine mock and persisted
identifiers.

### Tracking Links

Tracking-link creation is persisted.

```text
Authenticated publisher action
-> Domain validation
-> Server-side repository or RPC
-> PostgreSQL tracking_links record
```

`tracking_links.network_sub_id` is generated as a stable token per tracking
link and is the long-lived attribution anchor for Shopee ingestion.

Tracking-link list and analytics surfaces may still contain mock data.
They must not silently combine UUID records with legacy `trk-*` records.

### Cashback Clicks

The cashback redirect flow persists a click before redirecting to the
merchant.

```text
Publisher tracking link
-> Server route
-> Validate ownership and destination
-> Create click record with click_token
-> Construct verified partner outbound URL
-> Redirect to merchant
```

`clicks.click_token` is unique, immutable, non-blank, and traceable to one
click. Storing the token does not prove that the partner received it. A
verified partner adapter must apply the partner-specific parameter and
encoding contract, and `click_token` is not currently transmitted to Shopee.

Exact `Sub_id1` matching between returned CSV evidence and
`tracking_links.network_sub_id` proves tracking-link and publisher
attribution only. It does not prove which individual click produced the
order. A matched click identifier must not be persisted or claimed as the
click that produced an order unless a verified click-specific token is
returned through `Sub_id2` (or equivalent trusted partner evidence). The
current CSV ingestion path does not persist or claim click-level
attribution.

### Shopee Affiliate URL Provisioning

`provisionShopeeAffiliateUrlAsync` is wired into the cashback Server Action
and verifies that the supplied URL satisfies the Shopee contract:

- `utm_source` or `mmp_pid` equals the configured affiliate account id;
- `utm_content` carries the tracking-link `network_sub_id` in `Sub_id1`.

The verified URL is then persisted on the tracking link.

### Conversions

Conversions are persisted and readable for the authenticated publisher.

The current application does not yet contain a complete production
conversion-ingestion pipeline.

The pipeline currently stops at the `ready_for_conversion` processing
status on `shopee_csv_rows`. There is no code that inserts normalized
conversions from staged Shopee CSV rows.

Browser clients must not insert, update, approve, reject, settle, or reverse
conversions.

The current uniqueness boundary:

```text
network + external_order_id
```

is temporary architecture debt.

The future identity boundary is:

```text
network + source_conversion_key
```

Validation and settlement are not yet split in the persisted model.

### Consumer Orders

The consumer Orders UI remains mock-backed.

The target Order is a read projection grouped over canonical conversion
records using:

```text
network + external_order_id + publisher_id
```

Orders must not become a second financial source of truth. Removing the
Orders mock data is gated on a future parity verification.

### Dashboard

Dashboard summaries remain mock-backed or mixed.

Future persisted summaries must derive from canonical persisted records
rather than duplicate financial calculations in page components.

### Finance and Wallet

Finance summaries, wallet balances, wallet transactions, withdrawals, and
payout processing are not yet persisted financial infrastructure.

Wallet and withdrawal implementation belongs to Phase 20H.

Do not begin wallet implementation inside Phase 20G.

### Notifications

Notifications remain mock-backed.

Future notification persistence must not mutate financial state implicitly.

---

## 7. Conversion, Attribution, and Money Contract

### Canonical Granularity

A conversion is the canonical commission-bearing record.

A conversion is not guaranteed to represent an entire consumer order.

The consumer Order projection groups conversions using:

```text
network + external_order_id + publisher_id
```

### Conversion Identity

`external_order_id` is an order grouping key, not the permanent conversion
idempotency key.

The current uniqueness boundary:

```text
network + external_order_id
```

is temporary architecture debt.

The future identity boundary is:

```text
network + source_conversion_key
```

The source conversion key must be supplied by the partner or derived
deterministically from immutable source fields.

### Ingestion Requirements

Future conversion ingestion must be:

- server-only;
- idempotent;
- transactionally safe;
- replayable;
- auditable;
- linked to immutable ingestion evidence.

Raw ingestion evidence must be retained independently from normalized
conversion records.

### Validation and Settlement

Validation and settlement are separate dimensions.

Validation lifecycle:

```text
recorded
reconciling
approved
rejected
reversed
```

Settlement lifecycle:

```text
not_payable
payable
paid
```

A transition must preserve immutable history.

A reversal must create an adjustment or reversal record. It must not erase
historical approval or payment facts.

Historical UI logic that groups `paid` into an approved analytics bucket is
presentation behavior only. It does not merge validation and settlement in
the persisted domain model.

### Money Invariant

Persisted monetary values use integer VND amounts.

The required invariant is:

```text
network_commission =
user_cashback + platform_profit
```

Commission calculations must retain a persisted rule snapshot sufficient to
reproduce the original calculation.

Formatted currency strings are presentation-only.

---

## 8. Security and Migration Guardrails

### Publisher Access

Publisher-facing reads must enforce ownership through RLS or a controlled
server boundary.

Publishers may read only their owned tracking links, clicks, conversions,
profile data, and payout accounts.

Publishers may not:

- directly insert or mutate conversions;
- assign attribution;
- change validation state;
- change settlement state;
- execute privileged reconciliation operations.

Browser-submitted publisher identifiers must not override authenticated
ownership.

### Trusted Server Access

Trusted ingestion and reconciliation operations must:

- execute only on server boundaries;
- use server-only credentials;
- never expose credentials through `NEXT_PUBLIC_*` variables;
- use controlled PostgreSQL transactions or privileged functions;
- use a fixed safe `search_path` for privileged functions;
- explicitly revoke and grant function execution privileges;
- derive attribution ownership from trusted evidence.

A client-provided tracking-link ID or publisher ID is not sufficient
attribution evidence.

### Migration Safety

Every production migration must define:

- the exact existing state being changed;
- forward migration behavior;
- rollback or compensating behavior;
- data backfill strategy;
- validation queries;
- behavior for invalid legacy records;
- deployment ordering.

Existing text identifiers must not be blindly cast to UUID.

A migration must classify each legacy value before conversion, preservation,
quarantine, or rejection.

Do not remove mock data until persisted behavior reaches verified parity.

Do not combine schema migration, data backfill, and destructive cleanup into
one irreversible step.

### Reconciliation and Audit History

Reconciliation must preserve:

- immutable ingestion evidence;
- attribution evidence;
- previous validation state;
- previous settlement state;
- transition timestamps;
- actor or source metadata;
- reversal and adjustment records.

Historical approval, rejection, settlement, or payment facts must not be
overwritten or deleted to represent a later state.

---

## 9. Phase Boundaries

### Phase 20G.0

Phase 20G.0 is the Phase 20G architecture and data-contract documentation
milestone. It remains the canonical contract reference for Phase 20G.1 and
later phases. The exact Phase 20G.0 merge commit and Pull Request number
are not separately verified in the current documentation branch and must
not be invented here.

Deliverables:

- architecture documentation;
- data-contract documentation;
- current-state reconciliation;
- persisted and mock boundary documentation;
- future implementation guardrails.

Phase 20G.0 must not include production schema, migration, repository,
service, route, or financial behavior changes.

### Phase 20G.1

Phase 20G.1 is the Shopee ingestion and attribution foundation, partially
delivered through Pull Request #17.

Delivered scope:

- stable `tracking_links.network_sub_id` tokens;
- verified Shopee affiliate URL provisioning with `Sub_id1`;
- persisted Shopee CSV import batches and source rows;
- file-level CSV idempotency by SHA-256 of the source file;
- row-level CSV idempotency by SHA-256 row fingerprint;
- exact `source_sub_id1` to `network_sub_id` attribution;
- persisted Shopee advertiser, campaign, offer, and cashback-policy
  foundation;
- transactionally protected tracking-link classification through
  `classifyShopeeTrackingLinkAsync`, which acquires sequential
  `SELECT FOR UPDATE` row locks on `offers`, `campaigns`, `advertisers`,
  and `cashback_policies`, validates the locked eligibility snapshot
  against the full catalog contract, then acquires a `SELECT FOR UPDATE`
  row lock on the single owned `tracking_links` row and performs a
  conditional update of the `(campaign_id, offer_id)` pair only when
  both columns are currently `NULL`. The result is a consistent
  transactional database state;
- a PostgreSQL concurrency integration test covering the classification
  path.

Remaining scope:

- production orchestration for CSV import and batch processing;
- deterministic `source_conversion_key` from immutable source fields;
- idempotent normalized conversion writes that link back to the staged CSV
  row and import batch;
- immutable conversion linkage to source rows and import evidence;
- replay handling, partial-batch failure handling, and operational failure
  recovery.

Phase 20G.1 must not introduce speculative query parameters or a universal
affiliate-network abstraction without verified partner contracts.

### Phase 20G.2

Expected reconciliation and consumer-order scope:

- validation and settlement separation;
- immutable status history;
- reversal and adjustment handling;
- reconciliation workflows;
- persisted consumer Orders projection derived from canonical conversions;
- parity verification against current Orders behavior;
- removal of corresponding Orders mock data only after parity is proven.

The consumer Orders projection must remain derived from canonical conversion
records.

### Phase 20H

Phase 20H covers consumer-facing Shopee cashback surfacing. Phase 20H.1
normalized Shopee URLs; Phase 20H.2 added the URL/product preview and
the secured HTML metadata provider foundation; Phase 20H.3 added the
buyer purchase handoff, deterministic affiliate URL, tracking-link
create/reuse and persistence, `/go/<shortCode>`, click recording, and
the direct-URL and resolved-short-link neutral fallback; Phase 20H.4
added the Unikorn third-party metadata API as primary enrichment with
the HTML provider remaining as fallback (merged through Pull Request #23
at `bd98cb2`); Phase 20H.5 polished the existing preview UI on top of
the existing infrastructure (merged through Pull Request #25 at
`84a6b4e`).

Phase 20H.3 is complete and merged. Phase 20H.4 is complete and merged
through Pull Request #23 at `bd98cb2` (implementation commit `c281509`).
Phase 20H.5 is complete and merged through Pull Request #25 at `84a6b4e`
(implementation commit `f9b0fa5`). The purchase handoff, click recording,
tracking-link persistence, and `/go/<shortCode>` redirect established by
Phase 20H.3, the Unikorn metadata enrichment / HTML fallback provider
chain established by Phase 20H.4, and the metadata pipeline established
by Phase 20H.2 must be preserved by any future phase and must not be
rewritten. Phase 20H.5 is a UI/UX-only polish and does not change
Phase 20H.2, Phase 20H.3, or Phase 20H.4 behavior.

Expected wallet and withdrawal scope (later wallet phase):

- immutable wallet ledger entries;
- balance projections;
- withdrawal requests;
- payout processing;
- financial adjustments;
- clawbacks and reversals.

Wallet and withdrawal implementation must not begin inside Phase 20G or
Phase 20H.

---

## 10. Recent Delivered Milestones

### Phase 20C - Persisted Profile Editing

Phase 20C moved authenticated publisher profile editing from mock persistence
to Supabase PostgreSQL.

Relevant merge:

`cdf213e` - Pull Request #9

### Phase 20D - Persisted Payout Accounts

Phase 20D added authenticated payout-account reads and writes.

Relevant merge:

`04e8aa8` - Pull Request #10

### Phase 20E - Persisted Conversions

Phase 20E added persisted publisher conversion reads and reporting.

Relevant merge:

`39bba45` - Pull Request #11

Phase 20E did not add a complete production conversion-ingestion pipeline.

### Phase 20F - Consumer Cashback Flow

Phase 20F added the persisted consumer cashback tracking-link
creation flow, the authenticated redirect preservation, and the
cashback click recording that runs before the merchant redirect.

The Phase 20F merge (`389ef9c`, Pull Request #12) introduced the
`clicks` table with a per-click text token column named
`clicks.network_sub_id` (not `clicks.click_token`). The
`tracking_links` table introduced in Phase 20F did not yet have a
`network_sub_id` column. The exact Phase 20F token model is
documented in `git show 389ef9c:src/db/schema.ts`.

Relevant merge:

`389ef9c` - Pull Request #12

The internal token stored on `clicks` at this stage was a
per-click identifier. The current model that distinguishes a
stable `tracking_links.network_sub_id` from a per-click
`clicks.click_token` was introduced later and is documented under
Phase 20G.1 below.

### Pre-Phase 20G Delivery Baseline

The delivery baseline added CI checks and package/runtime constraints before
Phase 20G.

Relevant merge:

`2baa327` - Pull Request #13

### Phase 20G.0 - Architecture and Data Contract Documentation

Phase 20G.0 produced the canonical conversion, attribution, ingestion,
reconciliation, and migration contract for Phase 20G.

The exact Phase 20G.0 merge commit and Pull Request number are not
separately verified in the current documentation branch and must not be
invented here.

### Phase 20G.1 - Shopee Ingestion and Attribution Foundation

Phase 20G.1 partial delivery through Pull Request #17 added:

- stable `tracking_links.network_sub_id` token, formatted `vaflnk` followed by
  24 lowercase hexadecimal characters;
- verified Shopee affiliate URL provisioning with `Sub_id1` via the cashback
  Server Action;
- file-level and row-level CSV idempotency;
- persisted Shopee CSV staging with deterministic exact `Sub_id1`
  attribution;
- persisted Shopee advertiser, campaign, offer, and cashback-policy
  foundation;
- transactionally protected tracking-link classification through
  `classifyShopeeTrackingLinkAsync` (sequential `SELECT FOR UPDATE` row
  locks on `offers`, `campaigns`, `advertisers`, and `cashback_policies`,
  then a `SELECT FOR UPDATE` row lock on the owned `tracking_links` row
  with a conditional update of the `(campaign_id, offer_id)` pair);
- a PostgreSQL concurrency integration test.

Relevant merge:

`11c24dd` - Pull Request #17

The CSV ingestion pipeline currently stops at the `ready_for_conversion`
processing status. Normalized conversion ingestion, reconciliation, wallet,
and a production CSV administration workflow are explicitly out of scope for
the Phase 20G.1 partial delivery.

### Phase 20H.2 - Product Preview and Secured HTML Metadata Provider

Phase 20H.2 delivered the Shopee URL/product preview and the secured HTML
metadata provider foundation.

Relevant merge:

`6386a13` - Pull Request #21

### Phase 20H.3 - Buyer Purchase Handoff and Tracking-Link Persistence

Phase 20H.3 added the buyer purchase handoff, deterministic affiliate
URL, tracking-link create/reuse and persistence, `/go/<shortCode>`,
click recording, and the direct-URL and resolved-short-link neutral
fallback. Phase 20H.3 did not modify the HTML metadata provider.

Relevant merge:

`98731a3` - Pull Request #22

### Phase 20H.4 - Unikorn Product Metadata Provider

Phase 20H.4 delivered Unikorn metadata enrichment as the primary
metadata provider with the secured HTML provider as fallback. Only the
resolved `itemId` is sent upstream; strict untrusted-response validation
is applied; third-party commission fields are ignored; no migration or
persistent metadata cache was introduced. The Phase 20H.4
implementation commit is `c281509`.

Before merge, the Phase 20H.4 implementation commit `c281509` passed
the full local quality gates:

- 529 tests passed, 0 failed;
- lint passed;
- typecheck passed;
- production build passed;
- DB check passed.

The CI / Quality check for Pull Request #23 also passed before merge.

Local and remote feature branches for Phase 20H.4 were deleted after
merge.

Relevant merge:

`bd98cb2` - Pull Request #23

### Phase 20H.5 - Shopee Cashback Preview UI

Phase 20H.5 polished the buyer-facing Shopee Cashback Preview UI on
top of the existing Phase 20H.4 Unikorn -> HTML provider chain, the
Phase 20H.3 purchase handoff, and the Phase 20H.2 metadata pipeline.
The implementation commit is `f9b0fa5`.

Delivered scope:

- typed payload-carrying preview render model that distinguishes
  pending, product-card, purchase-allowed fallback, resolution error,
  and empty presentation;
- pending state takes precedence over stale card, fallback, error, and
  empty states; a new pending request hides a previous product card
  immediately;
- dedicated pending panel with reduced-motion support;
- removed the static `Hoàn 60% hoa hồng` presentation; cashback
  percentage is derived only from `quote.cashbackShareBps`;
- recomposed the available-quote presentation into a single
  cashback-emphasis panel that preserves the estimate and the
  Shopee-approved commission disclaimer;
- persistent screen-reader status messaging and `aria-busy` on the
  preview and purchase buttons;
- preserved purchase handoff and `/go/<shortCode>` redirect behavior;
- exactly three UI component files were changed;
- no backend, provider, database, action, tracking, click, route,
  package, global-style, or schema changes.

Before merge, the Phase 20H.5 implementation commit `f9b0fa5` passed
the verified H.5 quality gates:

- lint passed;
- typecheck passed;
- the complete current npm test script passed: 529 passed, 0 failed;
- DB check passed;
- production build passed: 28/28 pages generated;
- diff check passed.

Pull Request #25 CI / Quality also passed before merge.

This documentation branch must not re-run the implementation quality
gates. Its merge-readiness bar is limited to the documentation
verification commands.

Manual browser validation (passed before merge):

- initial state at 375px, 768px, and desktop widths passed;
- invalid URL / resolution-error state passed;
- pending state passed;
- previous product card was hidden immediately during a new pending
  request;
- quote-unavailable state passed on desktop and mobile;
- keyboard order and visible focus passed;
- reduced-motion behavior passed;
- no horizontal overflow or mojibake was observed.

Manual-state limitations (recorded honestly):

- the current catalog data did not naturally produce a quote-available
  result during manual validation;
- the current tested URLs did not naturally produce the metadata
  purchase-allowed fallback during manual validation;
- backend data and source code were not modified to fabricate those
  states.

Local and remote feature branches for Phase 20H.5 were deleted after
merge.

Relevant merge:

`84a6b4e` - Pull Request #25

### Stable Tag Status

The latest reachable stable tag remains:

`phase-19.5-complete`

This tag is historical and predates the Phase 20 persisted implementation.

Do not invent or create a Phase 20 completion tag without explicit approval.

---

## 11. Current Verification Status

Pull Request #17 passed the full delivery quality gate.

Pull Request #25 (Phase 20H.5) also passed the verified H.5 quality
gates before its own merge at `84a6b4e`:

- the complete current npm test script passed: 529 passed, 0 failed;
- lint passed;
- typecheck passed;
- DB check passed;
- production build passed (28/28 pages generated);
- diff check passed;
- CI / Quality check passed.

This documentation branch must not re-run the implementation quality
gates.

The CI pipeline defined in `.github/workflows/ci.yml` runs against
Node.js 24, npm 11.13.0, and a PostgreSQL 16 service, in this order:

```text
npm ci
install postgresql-client
bootstrap Supabase-compatible PostgreSQL roles and auth helpers
npx drizzle-kit migrate
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run db:check
npm run build
```

The PostgreSQL integration test runs with:

```text
NODE_OPTIONS=--conditions=react-server
```

The current documentation synchronization branch must pass the
documentation verification commands listed in `## 13`. This documentation
branch must not re-run the implementation quality gates. Before merge,
the Phase 20H.5 implementation commit `f9b0fa5` passed the verified H.5
quality gates listed above, and Pull Request #25 CI / Quality also
passed before merge.

`npx drizzle-kit migrate` and `npm run test:integration` both
require a reachable PostgreSQL database. The CI pipeline starts a
PostgreSQL 16 service, installs the PostgreSQL client, and runs the
Supabase compatibility bootstrap in
`scripts/ci-bootstrap-supabase.sql` before applying migrations.
Migration runtime validation must use the same Supabase
compatibility bootstrap so that the `auth` schema, `auth.uid()`,
`anon`, and `authenticated` roles exist when migrations run.

When suitable local PostgreSQL is unavailable, both runtime
migration validation (`npx drizzle-kit migrate` plus the Supabase
compatibility bootstrap) and PostgreSQL integration testing
(`npm run test:integration`) may be validated by a green GitHub
Actions run for the exact same commit; a missing local run on a
machine without PostgreSQL is not a merge blocker, provided the CI
run for the same commit is green. A claimed local PASS for a
command that was not run locally is forbidden.

Documentation verification must include:

```text
git --no-pager diff --check HEAD
git diff --name-status
git diff --cached --name-only
git status --branch --short
git rev-parse HEAD
```

The branch diff against `origin/main` must touch exactly the two
approved documentation files (`docs/PROJECT_STATE.md` and
`docs/HANDOFF.md`).

Route classifications and generated-page counts must be copied only from the
current successful production build output.

Do not reuse historical values such as 21 route patterns or 30 generated page
instances unless the current build independently produces those values.

The LF-to-CRLF warning may appear because `core.autocrlf=true` and the
repository has no `.gitattributes` file.

That warning is not a `git diff --check` failure.

---

## 12. Continuation Workflow

After Pull Request #25, the Phase 20H.5 Shopee Cashback Preview UI
implementation is complete and merged into `main`. Phases 20H.2, 20H.3,
20H.4, and 20H.5 must not be reimplemented.

To continue implementation:

1. Read all four authoritative documentation files.
2. Confirm Pull Request #25 has been merged into `main`.
3. Start only from a clean, up-to-date `main` after this post-merge
   documentation synchronization has been merged. The Phase 20H.5
   implementation merge commit `84a6b4e` must be an ancestor of the
   new branch. Do not branch from any deleted Phase 20H.x feature branch.
4. Verify the branch and baseline commit before implementation begins;
   do not assume a final baseline commit before work starts.
5. The Shopee-only active commerce scope is preserved. TikTok Shop
   remains deferred unless a later explicit phase starts it. Do not
   expand into wallet, payout, ingestion redesign, or order-history
   work without a separately approved phase.
6. Select and document the next phase before creating any
   implementation branch. No Phase 20H.6 (or any other next
   implementation phase) has been explicitly selected, named, scoped,
   or given a baseline on this branch; the authoritative documents on
   this branch state only "Next implementation phase: not yet
   selected."
7. Once a next phase is selected, follow the same documentation
   workflow: keep authoritative documentation as the single source of
   truth, update it before implementation starts, and run the full
   delivery pipeline before merge.

Do not continue any implementation work directly on the current
documentation branch.

### Operational Rules

- Never start coding immediately.
- Never skip architecture analysis.
- Never create production migrations before the data contract is approved.
- Never use browser-provided ownership as trusted attribution evidence.
- Never expose server credentials through public environment variables.
- Never remove mock data before verified persisted parity.
- Never use destructive Git recovery commands without explicit approval.
- Never force-push or rewrite shared branch history without explicit
  approval.
- Never create a Phase 20 completion tag without explicit approval.
- Never mix TikTok Shop implementation into the current Shopee phase.
- Never describe `clicks.network_sub_id` as a current field. The
  Phase 20F merge (`389ef9c`, Pull Request #12) introduced
  `clicks.network_sub_id`; Pull Request #17 (`11c24dd`) renamed it
  to `clicks.click_token`. The stable per-tracking-link attribution
  anchor belongs to `tracking_links.network_sub_id`.
- Never reimplement Phase 20H.2, Phase 20H.3, Phase 20H.4, or
  Phase 20H.5. The metadata pipeline, the buyer purchase handoff, the
  Unikorn -> HTML provider chain, and the Shopee Cashback Preview UI
  polish are already merged.

---

## 13. Documentation Branch Merge Readiness

This branch (`docs/sync-phase-20h5-after-merge`) is a documentation-only
post-merge synchronization for Pull Request #25. Its merge-readiness bar
is limited to the documentation verification commands below; the full
CI delivery pipeline is not required on this branch.

Before committing this documentation branch, verify:

- [ ] only the two approved documentation files are changed
      (`docs/PROJECT_STATE.md`, `docs/HANDOFF.md`);
- [ ] `docs/PROJECT_STATE.md` reflects the Phase 20H.5 implementation
      merged through Pull Request #25 at `84a6b4e` and the
      Phase 20H.5 implementation commit `f9b0fa5`;
- [ ] `docs/HANDOFF.md` reflects the operational continuation after
      Pull Request #25 and treats Phase 20H.5 as complete and merged;
- [ ] Phase 20H.2, Phase 20H.3, Phase 20H.4, and Phase 20H.5 boundaries
      agree across files and distinguish metadata pipeline (H.2),
      purchase handoff (H.3), Unikorn -> HTML provider chain (H.4), and
      UI/UX polish (H.5);
- [ ] no future implementation phase (including any Phase 20H.6) is
      invented; "Next implementation phase: not yet selected." is
      preserved unless a next phase is explicitly defined elsewhere;
- [ ] conversion identity still uses `network + source_conversion_key`
      as the target;
- [ ] Orders are still documented as a projection over conversions;
- [ ] validation and settlement are still separate dimensions;
- [ ] the money invariant still agrees across all documents;
- [ ] no guessed partner query parameters are authorized;
- [ ] no blind text-to-UUID migration is authorized;
- [ ] stale Phase 19.5 route and build counts are removed;
- [ ] no application implementation file is changed;
- [ ] `git diff --check` passes;
- [ ] `git status --short` shows only the two documentation files;
- [ ] the complete branch diff against `origin/main` is reviewed;
- [ ] commit and push occur only after explicit approval.

Documentation verification commands (must pass before merge):

```text
git --no-pager diff --check HEAD
git diff --name-status
git diff --cached --name-only
git status --branch --short
git rev-parse HEAD
```

The implementation quality gates (lint, typecheck, the complete current
npm test script, DB check, production build, CI / Quality check) are not
part of this branch's merge-readiness bar. Pull Request #25 already
passed the verified H.5 quality gates and the CI / Quality check before
its own merge at `84a6b4e`; this branch must not re-run those commands.

Expected Phase 20H.5 documentation set:

```text
docs/PROJECT_STATE.md
docs/HANDOFF.md
```

No application implementation file belongs in the final branch diff.
