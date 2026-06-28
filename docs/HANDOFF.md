# Vaffiliate Handoff

## 1. Purpose and Read Order

This document provides the operational handoff for the Vaffiliate repository.

Before continuing implementation work, read these documents in order:

1. `docs/PROJECT_STATE.md`
2. `docs/ARCHITECTURE.md`
3. `docs/PHASE_20G0_ARCHITECTURE_DATA_CONTRACT.md`
4. `docs/HANDOFF.md`

Phase 20G.0 is documentation-only.

Do not introduce production schema, migration, repository, service, route,
authentication, attribution, conversion, payout, or wallet behavior changes
inside this phase.

Git history, source code, migrations, and verified command output take
precedence when stale documentation conflicts with the repository.

---

## 2. Current Repository State

Project: Vaffiliate

Current phase: Phase 20G.0 - Architecture and Data Contract Documentation

Phase status: In progress

Current branch:

`docs/phase-20g0-architecture-data-contract`

Current baseline commit:

`2baa327` - merge of Pull Request #13, pre-Phase 20G delivery baseline

Latest implementation merge:

`389ef9c` - merge of Pull Request #12, Phase 20F consumer cashback flow

Integration branch:

`main`

Latest reachable stable tag:

`phase-19.5-complete`

The stable tag is historical. No Phase 20 completion tag has been created.

### Expected Phase 20G.0 Worktree

Only the following documentation files belong in this phase:

- `docs/ARCHITECTURE.md`
- `docs/PHASE_20G0_ARCHITECTURE_DATA_CONTRACT.md`
- `docs/PROJECT_STATE.md`
- `docs/HANDOFF.md`

No implementation file should be modified.

### Delivery Baseline

The repository baseline requires Node.js 24 and npm 11.

The CI delivery path is:

```text
npm ci
npm run lint
npm run typecheck
npm run db:check
npm run build
```

Route classifications and generated-page counts must come from current
verified Next.js build output. Do not copy historical Phase 19.5 counts.

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
- supported platforms.

`docs/PHASE_20G0_ARCHITECTURE_DATA_CONTRACT.md` is authoritative for:

- conversion granularity;
- identifiers and idempotency;
- attribution evidence;
- ingestion and reconciliation;
- validation and settlement lifecycles;
- financial invariants;
- migration and rollback safety.

`docs/HANDOFF.md` is authoritative for:

- operational continuation;
- verification requirements;
- implementation guardrails;
- merge-readiness instructions.

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

---

## 5. Current Data Boundaries

### Persisted in Supabase PostgreSQL

The current persisted foundation includes:

- Supabase authentication users;
- publisher profiles;
- payout accounts;
- tracking-link creation;
- cashback click recording;
- conversion reads associated with the authenticated publisher.

These persisted flows must not silently fall back to mock records.

### Mock or Partial

The following domains remain mock-backed or only partially persisted:

- dashboard summaries;
- consumer Orders;
- Finance and wallet balances;
- withdrawal history;
- cashback history views;
- advertiser, campaign, and offer catalog data;
- tracking-link list and analytics data;
- notifications.

Pages that combine multiple sources must keep source boundaries explicit.

### Identifier Boundary

Persisted tracking-link identifiers are UUID values.

Legacy mock identifiers such as `trk-001`, `trk-002`, and `trk-003` are not
valid persisted tracking-link identifiers.

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

Historical mock profile-editing documentation is no longer authoritative.

Avatar upload, membership management, referral workflows, and the settings
center remain deferred.

### Catalog

Advertisers, campaigns, offers, Campaign Detail, and Offer Detail remain
mock-backed unless a persisted boundary is explicitly documented.

Their text identifiers are temporary and must not be treated as persisted
database identifiers.

### Tracking Links

Tracking-link creation is persisted.

```text
Authenticated publisher action
-> Domain validation
-> Server-side repository or RPC
-> PostgreSQL tracking_links record
```

Tracking-link list and analytics surfaces may still contain mock data.

They must not silently combine UUID records with legacy `trk-*` records.

### Cashback Clicks

The cashback redirect flow persists a click before redirecting to the
merchant.

```text
Publisher tracking link
-> Server route
-> Validate ownership and destination
-> Create click and internal network_sub_id
-> Construct verified partner outbound URL
-> Redirect to merchant
```

The stored `network_sub_id` is internal attribution evidence only.

It does not prove that the merchant received or returned the token.

A verified partner adapter must apply the partner-specific parameter and
encoding contract.

Do not append guessed affiliate query parameters.

### Conversions

Conversions are persisted and readable for the authenticated publisher.

The current application does not yet contain a complete production
conversion-ingestion pipeline.

Browser clients must not insert, update, approve, reject, settle, or reverse
conversions.

### Consumer Orders

The consumer Orders UI remains mock-backed.

The target Order is a read projection grouped over canonical conversion
records.

Orders must not become a second financial source of truth.

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

Scope:

- architecture documentation;
- data-contract documentation;
- current-state reconciliation;
- persisted and mock boundary documentation;
- future implementation guardrails.

Phase 20G.0 must not change:

- production database schema;
- migrations;
- application implementation files;
- authentication behavior;
- tracking behavior;
- conversion behavior;
- financial behavior.

### Phase 20G.1

Expected ingestion and attribution foundation:

- verified partner-specific attribution adapters;
- immutable ingestion-event persistence;
- exact sub-ID transmission and return mapping;
- idempotent normalized conversion writes;
- partner source-conversion identity;
- persisted attribution evidence;
- server-only ingestion security;
- replay-safe processing.

Phase 20G.1 must not introduce speculative query parameters or a universal
affiliate-network abstraction without verified partner contracts.

### Phase 20G.2

Expected reconciliation and consumer-order scope:

- validation and settlement separation;
- immutable transition history;
- reversal and adjustment handling;
- reconciliation workflows;
- persisted consumer Orders projection;
- parity verification against current Orders behavior;
- removal of corresponding Orders mock data only after parity is proven.

The consumer Orders projection must remain derived from canonical conversion
records.

### Phase 20H

Expected wallet and withdrawal scope:

- immutable wallet ledger entries;
- balance projections;
- withdrawal requests;
- payout processing;
- financial adjustments;
- clawbacks and reversals.

Wallet and withdrawal implementation must not begin inside Phase 20G.

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

Phase 20F added:

- persisted consumer cashback tracking-link creation;
- authenticated redirect preservation;
- click recording before merchant redirect;
- internal `network_sub_id` generation.

Relevant merge:

`389ef9c` - Pull Request #12

The internal attribution token is not proof of partner-side transmission or
return attribution.

### Pre-Phase 20G Delivery Baseline

The delivery baseline added CI checks and package/runtime constraints before
Phase 20G.

Relevant merge:

`2baa327` - Pull Request #13

The Phase 20G.0 branch starts from this baseline.

### Stable Tag Status

The latest reachable stable tag remains:

`phase-19.5-complete`

This tag is historical and predates the Phase 20 persisted implementation.

Do not invent or create a Phase 20 completion tag without explicit approval.

---

## 11. Current Verification Status

Phase 20G.0 final verification is pending until all four documentation files
are complete.

Required delivery commands:

```text
npm run lint
npm run typecheck
npm run db:check
npm run build
```

Documentation verification must also include:

```text
git diff --check
git status --short
git diff --name-status origin/main
git diff --stat origin/main
```

Route classifications and generated-page counts must be copied only from the
current successful production build output.

Do not reuse historical values such as 21 route patterns or 30 generated page
instances unless the current build independently produces those values.

The LF-to-CRLF warning may appear because `core.autocrlf=true` and the
repository has no `.gitattributes` file.

That warning is not a `git diff --check` failure.

---

## 12. Continuation Workflow

Before beginning Phase 20G.1 implementation:

1. Read all four authoritative documentation files.
2. Confirm Phase 20G.0 has been merged into `main`.
3. Create a new implementation branch from the updated `main`.
4. Verify the branch and baseline commit.
5. Re-audit the current schema, migrations, RLS policies, RPCs, repositories,
   routes, and partner requirements.
6. Confirm the exact supported partner attribution contract.
7. Define migration, backfill, rollback, and validation procedures.
8. Produce an implementation plan.
9. Wait for explicit approval before modifying production implementation.

Do not continue Phase 20G.1 implementation directly on the Phase 20G.0
documentation branch.

### Operational Rules

- Never start coding immediately.
- Never skip architecture analysis.
- Never create production migrations before the data contract is approved.
- Never use browser-provided ownership as trusted attribution evidence.
- Never expose server credentials through public environment variables.
- Never remove mock data before verified persisted parity.
- Never use destructive Git recovery commands without explicit approval.
- Never force-push or rewrite shared branch history without explicit approval.

---

## 13. Phase 20G.0 Merge Readiness

Before committing this documentation branch, verify:

- [ ] only the four approved documentation files are changed;
- [ ] `docs/ARCHITECTURE.md` passes structural review;
- [ ] the Phase 20G.0 contract passes structural review;
- [ ] `docs/PROJECT_STATE.md` reflects the current baseline;
- [ ] `docs/HANDOFF.md` reflects the current persisted and mock boundaries;
- [ ] Phase 20G.0 is documented as documentation-only;
- [ ] Phase 20G.1, Phase 20G.2, and Phase 20H boundaries agree across files;
- [ ] conversion identity uses `network + source_conversion_key`;
- [ ] Orders are documented as a projection over conversions;
- [ ] validation and settlement are separate dimensions;
- [ ] the money invariant agrees across all documents;
- [ ] no guessed partner query parameters are authorized;
- [ ] no blind text-to-UUID migration is authorized;
- [ ] stale Phase 19.5 route and build counts are removed;
- [ ] lint passes;
- [ ] typecheck passes;
- [ ] database checks pass;
- [ ] production build passes;
- [ ] `git diff --check` passes;
- [ ] the complete branch diff against `origin/main` is reviewed;
- [ ] commit and push occur only after explicit approval.

Expected Phase 20G.0 document set:

```text
docs/ARCHITECTURE.md
docs/PHASE_20G0_ARCHITECTURE_DATA_CONTRACT.md
docs/PROJECT_STATE.md
docs/HANDOFF.md
```

No application implementation file belongs in the final branch diff.
