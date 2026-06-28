# Vaffiliate Architecture

## Architecture Baseline

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

The detailed Phase 20G data contract is defined in:

`docs/PHASE_20G0_ARCHITECTURE_DATA_CONTRACT.md`

That contract is authoritative for conversion granularity, attribution,
ingestion, reconciliation, identifiers, status transitions, and migration
safety.

---

## Core Data Flows

Vaffiliate currently contains both mock-backed and persisted domains.

### Read-only mock domains

Domains that have not yet migrated to PostgreSQL may use:

```text
Page
-> Async Loader
-> Service
-> Repository
-> apiClient
-> mock-backend
```

Mock data is temporary application infrastructure. It must not be treated as a
financial or attribution source of truth.

### Persisted server-side domains

Persisted application flows use:

```text
Page or Server Action or Route Handler
-> Domain Service or Repository
-> Supabase client or PostgreSQL transaction
-> RLS policy or controlled SECURITY DEFINER RPC
```

Client Components must not directly create or mutate financial, attribution,
conversion, payout, or wallet data.

---

## Global Rules

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
- No React Query, Redux, Zustand, or Context-based data-loading layer is
currently required.
- Shopee and TikTok Shop are the only supported commerce platforms.
- Do not add guessed affiliate parameters to merchant URLs.
- Partner attribution must use a verified partner-specific adapter.
- Do not build a speculative universal affiliate-network implementation.

---

## Current Data-Source Boundaries

### Persisted in Supabase PostgreSQL

The current persisted foundation includes:

- Supabase authentication users;
- publisher profiles;
- payout accounts;
- tracking-link creation;
- cashback click recording;
- conversion reads associated with the authenticated publisher.

These flows are real persisted flows and must not fall back silently to mock
records.

### Mock or partial

The following domains remain mock-backed or only partially persisted:

- dashboard summaries;
- consumer Orders;
- Finance and wallet balances;
- withdrawal history;
- cashback history views;
- advertiser, campaign, and offer catalog data;
- tracking-link list and analytics data;
- notifications.

A page using data from multiple sources must keep the source boundary explicit.

### Identifier boundary

Persisted tracking-link IDs are UUID values.

Legacy mock identifiers such as `trk-001`, `trk-002`, and `trk-003` are not
valid persisted tracking-link IDs.

Code must not join mock and persisted records only because both identifiers are
represented as TypeScript strings.

Existing text values must not be blindly cast to UUID during migrations.

---

## Current Domains

### Authentication

Authentication uses Supabase Auth.

```text
Login or Registration Form
-> Server Action
-> Supabase Auth
-> Auth callback
-> Authenticated application route
```

Authentication redirects must derive their origin from trusted request headers
or the configured site URL.

### Profile and Payout Accounts

Profile and payout-account reads and writes use authenticated server-side
Supabase access.

Ownership is derived from the authenticated user ID.

### Catalog

Advertisers, campaigns, and offers currently remain mock-backed.

Their text identifiers remain temporary until the catalog receives an approved
persistence and migration design.

### Tracking Links

Tracking-link creation is persisted.

```text
Authenticated publisher action
-> Domain validation
-> Server-side repository or RPC
-> PostgreSQL tracking_links record
```

Tracking-link list and analytics surfaces may still contain mock-backed data
during migration. They must not silently combine UUID records with legacy
`trk-*` records.

### Cashback Clicks

The cashback redirect flow records a click before redirecting to the merchant.

```text
Publisher tracking link
-> Server route
-> Validate ownership and destination
-> Create click and internal `network_sub_id`
-> Construct verified partner outbound URL
-> Redirect to merchant
```

The stored `network_sub_id` is an internal attribution token.

Storing the token does not prove that the merchant received it. A partner
adapter must apply the verified partner parameter and encoding contract.

### Conversions

Conversions are persisted and readable for the authenticated publisher.

A conversion is the canonical commission-bearing record. It is not guaranteed
to represent a complete consumer order.

The current application does not yet contain a complete production conversion
ingestion pipeline.

Future ingestion must be:

- server-only;
- idempotent;
- transactionally safe;
- replayable;
- auditable;
- linked to immutable ingestion evidence.

### Consumer Orders

The current Orders UI remains mock-backed.

The target consumer Order is a read projection derived by grouping conversions
using:

```text
network + external_order_id + publisher_id
```

Orders must not become a second financial source of truth.

A physical `orders` table may be introduced later only when justified by
provider metadata, reconciliation performance, or stable order-level
attributes.

### Dashboard

Dashboard summaries currently use mock or mixed data.

Future persisted summaries must derive from canonical persisted records rather
than duplicate page-level calculations.

### Finance and Wallet

Finance, wallet balances, wallet transactions, and withdrawals are not yet
implemented as persisted financial infrastructure.

They remain outside Phase 20G.

Phase 20H will define:

- immutable wallet ledger entries;
- balance projections;
- withdrawals;
- payout processing;
- adjustments and clawbacks.

### Notifications

Notifications remain mock-backed.

Their future persistence model must not be coupled to financial state mutation.

---

## Conversion and Financial Contracts

### Conversion identity

`external_order_id` is an order grouping key, not the permanent conversion
idempotency key.

The current uniqueness boundary:

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

### Status dimensions

Conversion validation and settlement are separate dimensions.

Validation statuses:

```text
recorded
reconciling
approved
rejected
reversed
```

Settlement statuses:

```text
not_payable
payable
paid
```

A status transition must preserve immutable audit history.

A reversal must create an adjustment or reversal record. It must not erase
historical approval or payment facts.

### Money invariant

Persisted monetary values use integer VND amounts.

Required invariant:

```text
network_commission =
user_cashback + platform_profit
```

Commission calculations must use a persisted rule snapshot sufficient to
reproduce the original calculation.

---

## Security Boundaries

Publisher-facing access:

- publishers may read only their owned tracking links, clicks, and conversions;
- publishers may not directly insert or mutate conversions;
- publishers may not assign attribution;
- publishers may not change validation or settlement state.

Trusted server access:

- ingestion and reconciliation use server-only credentials;
- privileged database functions use a fixed safe `search_path`;
- execute privileges are explicitly revoked and granted;
- attribution ownership comes from trusted evidence rather than browser input.

---

## Phase Boundaries

### Phase 20G.0

Architecture and data-contract documentation only.

No production schema change belongs in this phase.

### Phase 20G.1

Expected foundation:

- partner attribution adapters;
- ingestion-event persistence;
- exact sub-ID attribution;
- idempotent normalized conversion writes;
- attribution evidence;
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

## Route Inventory

Route count must be derived from the current Next.js build output.

Do not maintain a hard-coded route count in this document because routes change
as features are added or migrated.

---

## Supported Platforms

- Shopee
- TikTok Shop

---

## Not Supported

The following platforms and networks are outside the current product scope:

- Lazada
- Tiki
- Sendo
- Amazon
- unverified affiliate networks
