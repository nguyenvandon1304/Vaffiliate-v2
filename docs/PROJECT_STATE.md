# Vaffiliate Project State

## Current Status

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

Phase 20G.0 is documentation-only. It must not introduce production schema,
migration, repository, service, route, authentication, or financial behavior
changes.

---

## Current Platform Architecture

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

The current architecture is documented in:

- `docs/ARCHITECTURE.md`
- `docs/PHASE_20G0_ARCHITECTURE_DATA_CONTRACT.md`

The Phase 20G.0 contract is authoritative for conversion granularity,
attribution, ingestion, reconciliation, identifiers, status transitions,
money invariants, security boundaries, and migration safety.

---

## Current Data Boundaries

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

Pages that combine multiple data sources must keep the source boundaries
explicit.

Persisted UUID identifiers and legacy mock identifiers such as `trk-001` must
not be treated as interchangeable.

---

## Conversion and Attribution Contract

A conversion is the canonical commission-bearing record.

A consumer Order is a read projection derived by grouping conversions using:

```text
network + external_order_id + publisher_id
```

Orders must not become a second financial source of truth.

The current conversion uniqueness boundary based on:

```text
network + external_order_id
```

is temporary architecture debt.

The future conversion identity boundary will use:

```text
network + source_conversion_key
```

where the source conversion key is supplied by the partner or deterministically
derived from immutable source fields.

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

Persisted financial values use integer VND amounts and must satisfy:

```text
network_commission =
user_cashback + platform_profit
```

Attribution must come from trusted partner evidence. Storing an internal
`network_sub_id` does not prove that the merchant received it.

---

## Security Boundaries

Publisher-facing access must enforce ownership through RLS or a controlled
server boundary.

Publishers may not:

- directly insert or mutate conversions;
- assign attribution;
- change conversion validation state;
- change conversion settlement state.

Privileged ingestion and reconciliation writes must:

- execute only on trusted server boundaries;
- use server-only credentials;
- never expose credentials through `NEXT_PUBLIC_*`;
- use controlled database functions where required;
- use a fixed safe `search_path`;
- explicitly control function execution privileges.

---

## Phase Boundaries

### Phase 20G.0

Architecture and data-contract documentation only.

No production schema or implementation change belongs in this phase.

### Phase 20G.1

Expected foundation:

- verified partner attribution adapters;
- ingestion-event persistence;
- exact sub-ID attribution;
- idempotent normalized conversion writes;
- immutable attribution evidence;
- server-only ingestion security.

### Phase 20G.2

Expected reconciliation and consumer-order scope:

- validation and settlement separation;
- immutable status history;
- reversal handling;
- persisted consumer Orders projection;
- removal of corresponding Orders mock data after parity verification.

### Phase 20H

Wallet and withdrawal infrastructure.

Wallet implementation must not begin inside Phase 20G.

---

## Recent Delivered Milestones

- Phase 20C: persisted publisher profile editing;
- Phase 20D: persisted payout-account settings;
- Phase 20E: persisted publisher conversions and reporting;
- Phase 20F: consumer cashback tracking-link creation and click redirect flow;
- pre-Phase 20G baseline: CI and delivery checks established in Pull Request #13.

Relevant merge commits:

- `cdf213e` - Pull Request #9, Phase 20C;
- `04e8aa8` - Pull Request #10, Phase 20D;
- `39bba45` - Pull Request #11, Phase 20E;
- `389ef9c` - Pull Request #12, Phase 20F;
- `2baa327` - Pull Request #13, pre-Phase 20G baseline.

---

## Delivery Baseline

The baseline CI workflow uses:

```text
npm ci
npm run lint
npm run typecheck
npm run db:check
npm run build
```

The project baseline requires Node.js 24 and npm 11.

Route and generated-page counts must be taken from current verified Next.js
build output. They must not be copied from the historical Phase 19.5
documentation.

Final quality gates for the Phase 20G.0 branch remain pending until all four
documentation files are complete.

---

## Current Documentation Scope

Phase 20G.0 updates only:

- `docs/ARCHITECTURE.md`
- `docs/PHASE_20G0_ARCHITECTURE_DATA_CONTRACT.md`
- `docs/PROJECT_STATE.md`
- `docs/HANDOFF.md`

No implementation file should be modified during this phase.

---

## Next Required Work

1. Complete `docs/PROJECT_STATE.md`.
2. Replace stale operational content in `docs/HANDOFF.md`.
3. Verify documentation structure and cross-document consistency.
4. Run `git diff --check`.
5. Run the delivery quality gates.
6. Review the complete branch diff against `origin/main`.
7. Commit and push only after review and explicit approval.

Do not begin Phase 20G.1 implementation from this branch.

---

## Source of Truth

`docs/PROJECT_STATE.md` is authoritative for:

- current roadmap phase;
- current baseline;
- completed and planned phase boundaries;
- delivery status.

`docs/ARCHITECTURE.md` is authoritative for the current application
architecture and persisted/mock boundaries.

`docs/PHASE_20G0_ARCHITECTURE_DATA_CONTRACT.md` is authoritative for the
Phase 20G conversion, attribution, ingestion, reconciliation, and migration
contract.

`docs/HANDOFF.md` is authoritative for operational continuation, verification
steps, and repository handoff instructions.

Git history, source code, migrations, and verified command output take
precedence when stale documentation conflicts with the repository.

---

## Mandatory Workflow Before Implementation

1. Read all four authoritative documents.
2. Verify the current branch and baseline commit.
3. Verify the affected persisted and mock boundaries.
4. Run lint, typecheck, database checks, and production build.
5. Audit migration and rollback safety.
6. Produce an implementation plan.
7. Wait for explicit approval before changing production implementation files.

Never invent a completion tag.

Never bypass architecture analysis.

Never use destructive Git recovery commands without explicit approval.