# Phase 20G.0 - Architecture and Data Contract

## 1. Purpose

This document defines the architecture and data contracts that must be agreed
before implementing affiliate conversion ingestion, attribution,
reconciliation, consumer orders, wallet balances, or withdrawals.

Verified repository baseline:

* Integration commit: `2baa327`
* Phase 20F merge: Pull Request #12
* Pre-Phase 20G delivery baseline: Pull Request #13
* Supported commerce platforms: Shopee and TikTok Shop

Phase 20G.0 is documentation and architecture alignment only.

It must not:

* apply database migrations;
* create ingestion endpoints;
* modify production data;
* introduce wallet or withdrawal persistence;
* append unverified partner parameters to outbound URLs.

---

## 2. Verified Current State

### 2.1 Persisted in Supabase PostgreSQL

The current database contains:

* `profiles`
* `payout_accounts`
* `tracking_links`
* `clicks`
* `conversions`

### 2.2 Real persisted application flows

The following flows use Supabase-backed data:

* authentication;
* publisher profile;
* payout account settings;
* cashback tracking-link creation;
* cashback click recording;
* publisher conversion reads.

### 2.3 Mock or partial flows

The following areas still depend wholly or partly on the mock backend:

* dashboard;
* consumer Orders;
* Finance and wallet UI;
* cashback history;
* advertiser catalog;
* campaign catalog;
* offer catalog;
* tracking-link analytics lists;
* notifications.

### 2.4 Current mixed-source composition

`loadPublisherAffiliateAsync()` currently combines:

* mock advertiser, campaign, offer, and tracking-link data;
* real publisher conversions from Supabase.

This composition does not guarantee referential integrity between real
conversion identifiers and mock entity identifiers.

---

## 3. Architecture Source-of-Truth Rules

The old universal data path ending in `mock-backend` is no longer canonical.

Read-only mock domains may continue to use:

```text
Page
-> Async Loader
-> Service
-> Repository
-> apiClient
-> mock-backend
```

Persisted server-side domains use:

```text
Page or Server Action or Route Handler
-> Domain Service or Repository
-> Supabase client or PostgreSQL transaction
-> RLS policy or controlled SECURITY DEFINER RPC
```

Mandatory rules:

1. Pages and presentational components must not access Supabase directly.
2. Client Components must not write financial or attribution data directly.
3. Authenticated publishers may read only their own publisher-scoped data.
4. Ingestion and reconciliation writes must use trusted server credentials.
5. Financial calculations must not be owned by page components.
6. Cross-entity integrity must be enforced in the domain/database layer.
7. Mock and persisted identifiers must never be treated as interchangeable
   merely because both are TypeScript `string` values.

---

## 4. Canonical Entity Granularity

### 4.1 Conversion is the canonical commission-bearing unit

A conversion represents one commission-bearing event or line supplied by an
affiliate partner.

A conversion is not guaranteed to represent an entire consumer order.

One external order may contain:

- one conversion;
- multiple item-level conversions;
- multiple commission events;
- later adjustments or reversals.

### 4.2 External order identifier is a grouping key

`external_order_id` groups conversion records belonging to the same partner
order.

It must not remain the sole conversion idempotency key.

The current unique constraint:

```text
network + external_order_id
```

is temporary architecture debt because it assumes one conversion per order.

The future ingestion contract must identify each source conversion by either:

- a partner-provided external conversion identifier; or
- a deterministic source-line key generated from immutable source fields.

The future idempotency boundary is:

```text
network + source_conversion_key
```

### 4.3 Consumer Order is a projection

The consumer-facing Order is a read model derived by grouping one or more
conversions by:

```text
network + external_order_id + publisher_id
```

The Orders UI must not become a second financial source of truth.

A physical `orders` table may be introduced later only when required for
provider metadata, reconciliation performance, or stable order-level
attributes.

Financial amounts must remain traceable to conversion records.

---

## 5. Identifier Contract

### 5.1 Persisted identifiers

Persisted identifiers use UUID where ownership and foreign-key integrity are
required, including:

- profile user ID;
- payout account ID;
- tracking-link ID;
- click ID;
- conversion ID;
- future ingestion-event ID;
- future status-history ID.

### 5.2 Catalog identifiers

Advertiser, campaign, and offer identifiers remain text until the catalog is
persisted and a migration plan is approved.

### 5.3 Tracking-link identifiers

The database `tracking_links.id` is UUID.

Legacy mock identifiers such as:

```text
trk-001
trk-002
trk-003
```

are not valid persisted tracking-link IDs.

No migration may blindly cast existing
`conversions.tracking_link_id` values from text to UUID.

Required migration sequence:

1. inventory existing values;
2. classify UUID and legacy or mock values;
3. define a mapping or quarantine strategy;
4. backfill validated UUID relationships;
5. verify orphan counts;
6. add the foreign key only after validation.
---

## 6. Attribution Contract

### 6.1 Internal click token

`clicks.network_sub_id` is the internal attribution token generated for a
recorded cashback click.

It must be:

- unique;
- immutable;
- non-blank;
- traceable to exactly one click;
- stored before the merchant redirect occurs.

### 6.2 Partner-specific outbound URL construction

The application must not generically append `sub_id`, `utm_*`, or any guessed
parameter to merchant URLs.

Each partner requires an explicit outbound attribution adapter:

```text
PartnerAttributionAdapter
-> validate destination
-> apply verified partner attribution contract
-> return attributed outbound URL
```

Each adapter must define:

- accepted destination domains;
- required tracking or affiliate URL format;
- partner parameter name;
- encoding rules;
- maximum value length;
- redirect behavior;
- failure behavior.

Until a partner contract is verified, the system may record clicks but must
not claim that downstream orders can be attributed automatically.

### 6.3 Inbound attribution matching

Inbound partner data must first attempt exact matching using the normalized
partner sub-ID.

Successful attribution must persist evidence including:

- matched click ID;
- matched tracking-link ID;
- publisher ID;
- partner sub-ID;
- attribution method;
- attribution timestamp;
- source ingestion-event ID.

No fuzzy or time-window fallback may run silently.

Any fallback attribution must be:

- explicitly named;
- deterministic;
- auditable;
- assigned a confidence level;
- reviewable before financial settlement.

---

## 7. Conversion Lifecycle Contract

Validation and settlement are separate state dimensions.

### 7.1 Validation status

Canonical validation statuses:

```text
recorded
reconciling
approved
rejected
reversed
```

Meaning:

- `recorded`: source conversion accepted and normalized;
- `reconciling`: awaiting or processing partner validation;
- `approved`: partner validation succeeded;
- `rejected`: partner validation failed;
- `reversed`: previously approved value was later reversed.

### 7.2 Settlement status

Canonical settlement statuses:

```text
not_payable
payable
paid
```

Meaning:

- `not_payable`: no withdrawable publisher balance exists yet;
- `payable`: approved cashback is eligible for wallet credit or withdrawal;
- `paid`: the corresponding value has been settled.

A post-payment reversal must create an explicit adjustment record in the
future wallet ledger.

It must not erase or rewrite historical payment facts.

### 7.3 Current status migration

The current combined statuses:

```text
pending
approved
rejected
payable
paid
```

must not be mechanically renamed without reviewing existing rows.

At minimum:

- `approved` maps to validation `approved`;
- `rejected` maps to validation `rejected`;
- `payable` maps to validation `approved` plus settlement `payable`;
- `paid` maps to validation `approved` plus settlement `paid`;
- `pending` requires contextual classification as `recorded` or
  `reconciling`.

---

## 8. Money and Commission Contract

All persisted monetary values use integer VND amounts.

Required invariant:

```text
network_commission =
user_cashback + platform_profit
```

All ordinary conversion monetary values must be:

- safe non-negative integers;
- derived from a persisted commission-rule snapshot;
- reproducible from the source payload and snapshot;
- immutable after approval except through an explicit adjustment event.

The future commission snapshot must record sufficient information to
reproduce the calculation, including:

- commission model;
- network rate or amount;
- publisher cashback rate or amount;
- platform share;
- currency;
- rule or version identifier;
- calculation timestamp.

Formatted currency strings are presentation-only and must not be persisted as
financial values.

---

## 9. Ingestion Contract

Partner ingestion must be server-only.

Authenticated browser clients must never insert or update conversions.

Each received partner payload must first create or match an immutable
ingestion record containing at least:

- ingestion-event ID;
- network;
- source event or batch identifier;
- payload hash;
- received timestamp;
- processing status;
- processing-attempt count;
- processed timestamp;
- failure code and message when applicable;
- raw source reference or retained payload reference.

Required processing properties:

- idempotent;
- transactionally safe;
- replayable;
- auditable;
- capable of partial batch failure;
- isolated from publisher-facing RLS writes.

Normalized conversion writes must link back to the ingestion event that
created or changed them.

The current uniqueness boundary:

```text
network + external_order_id
```

must not be expanded or replaced until live conversion data has been
inventoried and a source-conversion key strategy has been approved.

---

## 10. Reconciliation and Audit History

A conversion status change must create immutable history.

Future status-history records must include:

* conversion ID;
* previous validation status;
* new validation status;
* previous settlement status;
* new settlement status;
* effective timestamp;
* source network;
* source ingestion-event ID;
* actor type;
* reason code;
* human-readable note when applicable.

Updating only the current conversion row is insufficient for financial audit.

Reconciliation must support:

* approval;
* rejection;
* delayed approval;
* duplicate source delivery;
* amount correction;
* cancellation;
* reversal;
* reprocessing after recoverable failure.

---

## 11. Security Contract

Publisher-facing access:

* publishers may select only their owned tracking links, clicks, and
  conversions;
* publishers may not directly insert or mutate conversions;
* publishers may not directly assign attribution;
* publishers may not directly change validation or settlement state.

Trusted server access:

* ingestion and reconciliation use server-only credentials;
* credentials must never be exposed through `NEXT_PUBLIC_*`;
* privileged functions must use a fixed safe `search_path`;
* execute privileges must be explicitly revoked and granted;
* publisher ownership must be derived from trusted attribution evidence.

---

## 12. Mock-to-Real Migration Boundary

During migration, every page must clearly identify its data source.

The application must not silently join:

* real UUID tracking-link IDs;
* mock `trk-*` tracking-link IDs;
* real conversions;
* mock catalog records;

unless the relationship is explicitly validated.

Migration order:

1. define contracts;
2. establish partner attribution adapters;
3. persist ingestion evidence;
4. normalize and attribute conversions;
5. expose real tracking-link reads;
6. build reconciliation;
7. derive consumer Orders from persisted conversions;
8. remove corresponding mock data only after parity verification.

---

## 13. Phase Boundaries

### Phase 20G.0 - Architecture and Data Contract

Deliverables:

* this contract;
* current-state documentation reconciliation;
* approved migration sequence;
* no production schema change.

### Phase 20G.1 - Ingestion and Attribution Foundation

Expected scope:

* partner adapter interfaces;
* ingestion-event persistence;
* exact sub-ID attribution;
* idempotent normalized conversion writes;
* attribution evidence;
* server-only security boundary.

### Phase 20G.2 - Reconciliation and Consumer Orders

Expected scope:

* validation and settlement status separation;
* immutable status history;
* reversal handling;
* persisted consumer Orders projection;
* replacement of mock Orders data.

### Phase 20H - Wallet and Withdrawal

Expected scope:

* immutable wallet ledger;
* wallet balance projection;
* withdrawal requests;
* payout processing;
* adjustment and clawback accounting.

Wallet implementation must not begin inside Phase 20G.

---

## 14. Migration Safety Rules

Before changing an existing production column or constraint:

1. inspect live data distribution;
2. identify null, malformed, mock, and orphan values;
3. create a reversible migration plan;
4. backfill in a separate step;
5. validate counts and invariants;
6. add constraints only after validation;
7. retain rollback instructions;
8. run `npm run db:check`;
9. run the full CI quality gate;
10. require human review before applying production migrations.

Forbidden shortcuts:

* blind text-to-UUID casts;
* destructive table rewrites without inventory;
* replacing financial history in place;
* using page-level calculations as the financial source of truth;
* adding partner URL parameters without a verified contract.

---

## 15. Phase 20G.0 Acceptance Criteria

Phase 20G.0 is complete only when:

* canonical conversion granularity is documented;
* consumer Order is defined as a projection;
* validation and settlement states are separated;
* attribution evidence is defined;
* partner-specific URL construction is required;
* ingestion idempotency is defined;
* commission-rule snapshots are required;
* status history and reversal behavior are defined;
* mock and persisted ID boundaries are documented;
* database migration safety rules are documented;
* `ARCHITECTURE.md`, `PROJECT_STATE.md`, and `HANDOFF.md` are reconciled;
* lint, typecheck, database check, build, and diff checks pass.
