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
safety. Updates annotated after Pull Request #17 reflect the partial
Phase 20G.1 delivery without rewriting the historical contract.

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
- TikTok Shop remains deferred; no TikTok-specific implementation may be
  mixed into the current Shopee phase.

---

## Current Data-Source Boundaries

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

These flows are real persisted flows and must not fall back silently to mock
records.

### Repository foundation versus production workflow

Pull Request #17 introduced the following capabilities at the repository,
schema, and test level. They are not yet a complete production operational
workflow:

- Shopee CSV file parsing and persisted staging
  (`shopee_csv_import_batches` and `shopee_csv_rows`);
- CSV batch attribution that exact-matches
  `shopee_csv_rows.source_sub_id1` against `tracking_links.network_sub_id`;
- Shopee catalog classification through
  `classifyShopeeTrackingLinkAsync`, which acquires sequential
  `SELECT FOR UPDATE` row locks on `offers`, `campaigns`, `advertisers`, and
  `cashback_policies`, validates the locked eligibility snapshot against the
  full catalog contract, then acquires a `SELECT FOR UPDATE` row lock on the
  single owned `tracking_links` row and performs a conditional update of the
  `(campaign_id, offer_id)` pair only when both are currently `NULL`;
- the `scripts/classify-shopee-tracking-link-worker.ts` test worker that
  exercises the classification repository;
- the PostgreSQL concurrency integration test covering the classification
  path.

There is no production administration UI, route, scheduled worker, or
end-to-end operational command for the complete CSV ingestion pipeline.

### Mock or partial

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

A page using data from multiple sources must keep the source boundary
explicit.

### Identifier boundary

Persisted tracking-link IDs are UUID values.

Legacy mock identifiers such as `trk-001`, `trk-002`, and `trk-003` are not
valid persisted tracking-link IDs.

Code must not join mock and persisted records only because both identifiers
are represented as TypeScript strings.

Existing text values must not be blindly cast to UUID during migrations.

`tracking_links.network_sub_id` is the stable per-tracking-link attribution
token. It is formatted `vaflnk` followed by 24 lowercase hexadecimal
characters and is the Shopee `Sub_id1` value carried in the verified
affiliate URL.

`clicks.click_token` is the per-click token. It is distinct from
`tracking_links.network_sub_id` and is not currently transmitted to Shopee.

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

The persisted Shopee catalog foundation is delivered through Pull Request
#17. Persisted catalog tables include:

- `advertisers`;
- `campaigns`;
- `offers`;
- `cashback_policies`.

The catalog is intentionally read-only from the client. It is
server-managed, and client writes against the catalog tables are
not part of the current application flow.

Classification acquires sequential `SELECT FOR UPDATE` row locks on
`offers`, `campaigns`, `advertisers`, and `cashback_policies` to read the
catalog tuple for the requested offer, then validates that locked snapshot
against the full eligibility contract. After the catalog lock chain succeeds,
it acquires a `SELECT FOR UPDATE` row lock on the single publisher-owned
`tracking_links` row and performs a conditional update of the
`(campaign_id, offer_id)` pair only when both columns are currently `NULL`.
The result is a consistent transactional database state where the persisted
eligibility snapshot and the persisted tracking-link classification reflect
the same locked catalog tuple.

Public catalog-facing UI, Campaign Detail, and Offer Detail pages are not
yet migrated from mock data. The catalog text identifiers used by the
mock UI are temporary and must not be joined with persisted UUID tracking
records.

### Tracking Links

Tracking-link creation is persisted.

```text
Authenticated publisher action
-> Domain validation
-> Server-side repository or RPC
-> PostgreSQL tracking_links record
```

`tracking_links.network_sub_id` is the stable per-tracking-link attribution
token. It is unique, immutable, non-blank, and carried into the Shopee
affiliate URL through `Sub_id1`.

Tracking-link list and analytics surfaces may still contain mock-backed data
during migration. They must not silently combine UUID records with legacy
`trk-*` records.

### Cashback Clicks

The cashback redirect flow records a click before redirecting to the
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
click. Storing the token does not prove that Shopee received or returned it.
A verified Shopee partner adapter must apply the Shopee parameter and
encoding contract. The current Shopee pipeline transmits the stable
`tracking_links.network_sub_id` in `Sub_id1`; the per-click `click_token` is
not currently transmitted to Shopee.

Exact `Sub_id1` matching between returned CSV evidence and
`tracking_links.network_sub_id` proves tracking-link and publisher
attribution. It does not prove which individual click produced the order.
A matched click identifier must not be persisted or claimed as the click
that produced an order unless a verified click-specific token is returned
through `Sub_id2` (or equivalent trusted partner evidence). The current
CSV ingestion path does not persist or claim click-level attribution.

### Shopee Affiliate URL Provisioning

`provisionShopeeAffiliateUrlAsync` is wired into the cashback Server Action
and:

- reads the authenticated publisher's `tracking_links` row;
- rejects calls for non-Shopee platforms with a typed platform error;
- verifies that the supplied URL belongs to the configured Shopee
  affiliate account through `utm_source` or `mmp_pid`;
- verifies that the URL carries the tracking-link `network_sub_id` in
  `Sub_id1` (`utm_content`);
- persists the verified affiliate URL on the tracking link.

### Shopee CSV Ingestion Foundation

The CSV ingestion foundation is delivered as repositories, schema, and a
PostgreSQL concurrency test.

```text
Shopee CSV file
-> parseShopeeCsvFile (parserVersion-bound, official headers preserved)
-> importShopeeCsvFileAsync (file-level SHA-256, batch-level status)
-> shopee_csv_rows (row-level SHA-256 fingerprint, raw payload retained)
-> attributeShopeeCsvBatchAsync (exact source_sub_id1 to network_sub_id match)
-> row processing_status moves to:
   unattributed | awaiting_classification | ready_for_conversion
```

The pipeline currently stops at `ready_for_conversion`. No code in the
current repository inserts normalized conversions from the staged rows.

The shopee affiliate URL provisioning flow and the CSV batch attribution
flow share the same `tracking_links.network_sub_id` anchor.

### Conversions

Conversions are persisted and readable for the authenticated publisher.

A conversion is the canonical commission-bearing record. It is not guaranteed
to represent a complete consumer order.

The current application does not yet contain a complete production conversion
ingestion pipeline. The CSV foundation stops at the `ready_for_conversion`
processing status; there is no service, worker, route, or Server Action that
inserts a normalized conversion from a staged Shopee CSV row. There is no
`source_conversion_key`.

Future ingestion must be:

- server-only;
- idempotent;
- transactionally safe;
- replayable;
- auditable;
- linked to immutable ingestion evidence.

The current conversion uniqueness boundary is temporary:

```text
network + external_order_id
```

The future target is:

```text
network + source_conversion_key
```

Validation and settlement are not yet split in the persisted conversion
model.

### Consumer Orders

The current Orders UI remains mock-backed.

The target consumer Order is a read projection derived by grouping
conversions using:

```text
network + external_order_id + publisher_id
```

Orders must not become a second financial source of truth.

A physical `orders` table may be introduced later only when justified by
provider metadata, reconciliation performance, or stable order-level
attributes.

Removing the Orders mock data is gated on a future parity verification
performed during Phase 20G.2.

### Dashboard

Dashboard summaries currently use mock or mixed data.

Future persisted summaries must derive from canonical persisted records
rather than duplicate page-level calculations.

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

Their future persistence model must not be coupled to financial state
mutation.

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

where the source conversion key is supplied by the partner or
deterministically derived from immutable source fields.

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

- publishers may read only their owned tracking links, clicks, and
  conversions;
- publishers may not directly insert or mutate conversions;
- publishers may not assign attribution;
- publishers may not change validation or settlement state.

Trusted server access:

- ingestion and reconciliation use server-only credentials;
- privileged database functions use a fixed safe `search_path`;
- execute privileges are explicitly revoked and granted;
- attribution ownership comes from trusted evidence rather than browser input;
- Shopee affiliate URL provisioning uses `server-only` modules and a
  typed error model so that `Sub_id1` mismatches cannot silently fall back to
  a default;
- catalog classification through `classifyShopeeTrackingLinkAsync` acquires
  sequential `SELECT FOR UPDATE` row locks on `offers`, `campaigns`,
  `advertisers`, and `cashback_policies` and validates the locked eligibility
  snapshot against the full catalog contract, then acquires a
  `SELECT FOR UPDATE` row lock on the single owned `tracking_links` row and
  performs a conditional update of the `(campaign_id, offer_id)` pair only
  when both columns are currently `NULL`. The result is a consistent
  transactional database state where the persisted eligibility snapshot
  and the persisted tracking-link classification reflect the same locked
  catalog tuple.

---

## Phase Boundaries

### Phase 20G.0

Architecture and data-contract documentation only.

Phase 20G.0 remains the canonical historical architecture and data
contract for Phase 20G.1 and beyond. The exact Phase 20G.0 merge commit
and Pull Request number are not separately verified in the current
documentation branch and must not be invented here.

### Phase 20G.1

Partially delivered foundation, merged through Pull Request #17.

Delivered scope:

- stable `tracking_links.network_sub_id` tokens;
- verified Shopee affiliate URL provisioning with `Sub_id1`;
- persisted Shopee CSV import batches and source rows;
- file-level CSV idempotency;
- row-level CSV fingerprint idempotency;
- exact `source_sub_id1` attribution;
- persisted Shopee advertiser, campaign, offer, and cashback-policy
  foundation;
- transactionally protected tracking-link classification through
  `classifyShopeeTrackingLinkAsync` (sequential `SELECT FOR UPDATE` row
  locks on `offers`, `campaigns`, `advertisers`, and `cashback_policies`,
  then a `SELECT FOR UPDATE` row lock on the owned `tracking_links` row
  with a conditional update of the `(campaign_id, offer_id)` pair);
- a PostgreSQL concurrency integration test for the classification path.

Remaining scope:

- production orchestration for CSV import and batch processing;
- deterministic `source_conversion_key` from immutable source fields;
- idempotent normalized conversion writes linking back to the staged CSV row
  and import batch;
- immutable conversion linkage to source rows and import evidence;
- replay handling, partial-batch failure handling, and operational failure
  recovery.

Phase 20G.1 must not introduce speculative query parameters or a universal
affiliate-network abstraction without verified partner contracts.

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

Do not maintain a hard-coded route count in this document because routes
change as features are added or migrated.

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
