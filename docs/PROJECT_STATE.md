# Vaffiliate Project State

## Current Status

Project: Vaffiliate

Current phase: Phase 20H.2 - Shopee Product Preview & Cashback Quote

Phase status: Implementation pending review; uncommitted changes on branch

Current branch:

`feat/phase-20h2-shopee-product-preview`

Current baseline commit:

`56e79b31` - Phase 20H.1 merge commit used as the clean starting point

Latest implementation merge:

`11c24dd` - Pull Request #17

Integration branch:

`main`

Latest reachable stable tag:

`phase-19.5-complete`

The stable tag is historical. No Phase 20 completion tag has been created.

Pull Request #17 delivered a verified Shopee ingestion and attribution
foundation, but it does not yet complete normalized conversion ingestion,
reconciliation, consumer Orders persistence, wallet infrastructure, or a
production CSV administration workflow.

Git history, source code, migrations, and verified command output take
precedence when stale documentation conflicts with the repository.

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

The Phase 20G architecture and data contract is authoritative for conversion
granularity, attribution, ingestion, reconciliation, identifiers, status
transitions, money invariants, security boundaries, and migration safety.

---

## Current Data Boundaries

### Persisted in Supabase PostgreSQL

The current persisted foundation includes:

- Supabase authentication users;
- publisher profiles;
- payout accounts;
- tracking links;
- cashback clicks;
- Shopee CSV import batches;
- Shopee CSV source rows;
- conversions;
- advertisers;
- campaigns;
- offers;
- cashback policies.

Persisted flows must not silently fall back to mock records.

### Delivered Shopee ingestion and attribution foundation

Pull Request #17 delivered the following:

- a stable `tracking_links.network_sub_id` token, formatted `vaflnk` followed by
  24 lowercase hexadecimal characters;
- verified Shopee affiliate URL provisioning using the tracking-link token in
  `Sub_id1`;
- file-level CSV idempotency using the SHA-256 of the source file;
- row-level CSV idempotency using a SHA-256 row fingerprint;
- persisted Shopee CSV staging (`shopee_csv_import_batches` and
  `shopee_csv_rows`);
- exact `shopee_csv_rows.source_sub_id1` to `tracking_links.network_sub_id`
  attribution;
- persisted Shopee advertiser, campaign, offer, and cashback-policy foundation;
- transactionally protected tracking-link classification through
  `classifyShopeeTrackingLinkAsync`, which acquires sequential
  `SELECT FOR UPDATE` row locks on `offers`, `campaigns`, `advertisers`,
  and `cashback_policies`, validates the locked eligibility snapshot
  against the full catalog contract, then acquires a `SELECT FOR UPDATE`
  row lock on the single owned `tracking_links` row and performs a
  conditional update of the `(campaign_id, offer_id)` pair only when
  both columns are currently `NULL`. The result is a consistent
  transactional database state;
- a PostgreSQL concurrency integration test covering the classification path.

`provisionShopeeAffiliateUrlAsync` is wired into the cashback Server Action
so that the verified affiliate URL is persisted on the tracking link.

### Repository and test foundations that currently exist

The following capabilities exist in repositories or test tooling on
`11c24dd`:

- Shopee CSV file import (`parseShopeeCsvFile`,
  `importShopeeCsvFileAsync` against
  `shopee_csv_import_batches` and `shopee_csv_rows`);
- CSV batch attribution that exact-matches
  `shopee_csv_rows.source_sub_id1` against
  `tracking_links.network_sub_id` through
  `attributeShopeeCsvBatchAsync`;
- Shopee catalog classification through
  `classifyShopeeTrackingLinkAsync` (sequential `SELECT FOR UPDATE`
  row locks on `offers`, `campaigns`, `advertisers`, and
  `cashback_policies`, then a `SELECT FOR UPDATE` row lock on the
  single owned `tracking_links` row with a conditional update of the
  `(campaign_id, offer_id)` pair only when both columns are currently
  `NULL`);
- the `scripts/classify-shopee-tracking-link-worker.ts` test worker
  that exercises the classification repository;
- a PostgreSQL concurrency integration test covering the
  classification path.

### Production or implementation capabilities that remain absent

The following production or implementation capabilities are not in
the current repository:

- production orchestration for CSV import and batch attribution;
- idempotent normalized conversion creation from staged
  `shopee_csv_rows`;
- a deterministic `source_conversion_key`;
- production administration UI, route, scheduled worker, or
  end-to-end operational command for the complete CSV pipeline.

The current CSV ingestion pipeline stops at the
`ready_for_conversion` processing status on `shopee_csv_rows`. There
is no code path that inserts a normalized conversion from a staged
row.

### Mock or partial

The following domains remain mock-backed, mixed, or incomplete:

- dashboard summaries;
- consumer Orders;
- Finance and wallet balances;
- wallet transactions;
- withdrawal history;
- cashback history views;
- tracking-link list and analytics data;
- notifications;
- some catalog-facing UI and detail surfaces.

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

### Shopee attribution evidence

Shopee attribution uses exact matching between
`shopee_csv_rows.source_sub_id1` and the stable `tracking_links.network_sub_id`
carried in the verified affiliate URL through Shopee `Sub_id1`.

Affiliate URL verification proves that the generated URL contains the expected
token. Returned CSV evidence confirms partner-side attribution only for source
rows that actually contain the matching `Sub_id1`.

The per-click `clicks.click_token` is separate from
`tracking_links.network_sub_id` and is not currently transmitted to Shopee.

Silent fuzzy or time-window attribution fallback is not authorized. Any
fallback attribution path must be explicitly named, deterministic, and
reviewable before it can drive financial settlement.

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

Phase 20G.0 remains the canonical historical architecture and data
contract for Phase 20G.1 and beyond. The exact Phase 20G.0 merge commit
and Pull Request number are not separately verified in the current
documentation branch and must not be invented here.

### Phase 20G.1

Partially delivered foundation, merged through Pull Request #17.

Delivered scope:

- verified Shopee affiliate URL provisioning with stable `Sub_id1` attribution;
- persisted Shopee CSV import batches and source rows;
- file-level and row-level CSV idempotency;
- exact returned `Sub_id1` attribution;
- persisted Shopee advertiser, campaign, offer, and cashback-policy
  foundation;
- transactionally protected tracking-link classification through
  `classifyShopeeTrackingLinkAsync` (sequential `SELECT FOR UPDATE` row
  locks on `offers`, `campaigns`, `advertisers`, and `cashback_policies`,
  then a `SELECT FOR UPDATE` row lock on the owned `tracking_links` row
  with a conditional update of the `(campaign_id, offer_id)` pair);
- PostgreSQL concurrency coverage for the classification path.

Remaining scope:

- production orchestration for CSV import and batch attribution;
- deterministic `source_conversion_key` from immutable source fields;
- idempotent normalized conversion writes that link back to the staged CSV row
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
- reversal and adjustment handling;
- reconciliation workflows;
- persisted consumer Orders projection derived from canonical conversions;
- parity verification against current Orders behavior;
- removal of corresponding Orders mock data only after parity is proven.

The consumer Orders projection must remain derived from canonical conversion
records. Orders must not become a second financial source of truth.

### Phase 20H

Expected wallet and withdrawal scope:

- immutable wallet ledger entries;
- balance projections;
- withdrawal requests;
- payout processing;
- financial adjustments and clawbacks.

Wallet and withdrawal implementation must not begin inside Phase 20G.

### Phase 20H

Consumer-facing Shopee cashback surfacing pipeline. Phase 20H.1
normalized Shopee URLs and resolved identifiers; subsequent phases build
the preview/quote experience on top of it.

### Phase 20H.2

Implementation pending review on branch
`feat/phase-20h2-shopee-product-preview` (HEAD
`56e79b31745c72d4892a860d975bd8dc84ca1327` + uncommitted
changes). This is uncommitted work; it has not been staged,
committed, or pushed.

Delivered scope:

- Shopee URL resolution continues to flow through `resolveShopeeProductUrl`
  from `src/lib/shopee/product-url.ts` (Phase 20H.1). No duplicate parser
  was added.
- Shopee product metadata domain:
  `src/lib/shopee/product-metadata/types.ts` re-exports
  `ShopeeProductIdentity` from `src/lib/shopee/product-identity.ts`.
  Exactly one `ShopeeProductIdentity` interface exists (Issue 7).
  `ShopeeProductMetadata` carries `shopId`, `itemId`, `canonicalUrl`,
  `title`, `imageUrl`, `price: Money`, optional `shopName`, and the
  `availability` enum. The `ShopeeProductMetadataProvider` contract
  defines the provider interface.
- Provider contract implementation:
  `src/lib/shopee/product-metadata/provider.server.ts` re-exports the
  fetch + safety controls from the unguarded implementation module
  (`provider-impl.ts`) so the production entry point is guarded by
  `import "server-only"` while unit tests still cover the same code.
- Pure HTML extractor:
  `extractShopeeProductMetadataFromHtml` in
  `src/lib/shopee/product-metadata/extractor.ts` pulls title, image,
  VND price, and shop name from Open Graph tags and JSON-LD Product
  blocks. It enforces integer VND via a strict parser that validates
  format before stripping thousands separators; rejects malformed prices,
  negative values, scientific notation, unsafe integers. It validates
  image URLs for HTTPS, no credentials, and non-empty hostname. JSON-LD
  `offers.availability` drives availability: `InStock`/`LimitedAvailability`
  → available; `OutOfStock`/`SoldOut`/`Discontinued` → unavailable;
  missing/unknown → unknown. Open Graph pages fall back to `unknown`
  when JSON-LD has no availability field.
- Network safety controls in `fetchMetadataForIdentity`:
  - HTTPS only.
  - Exact hostname allowlist (`shopee.vn` and `www.shopee.vn`).
  - No credentials in URL, no unexpected port.
  - Manual redirect following; each redirect target is re-validated
    against the allowlist.
  - Per-request timeout.
  - Response size cap with body cancellation when exceeded.
  - Content-type must look like HTML; otherwise
    `unexpected_content_type`.
  - HTTP 404 / 410 → `product_not_found`.
  - Other non-2xx → `non_2xx_response`.
  - All provider responses are normalized before reaching callers;
    raw HTML and stack traces never cross the boundary.
- Offer selector contract (`src/services/shopee-offer-selector.ts`):
  The selector interface accepts a product identity and returns a typed
  `ShopeeOfferSelectionOutcome` discriminated union: `eligible`,
  `no_active_offer`, `not_eligible`, `eligibility_unknown` (with an
  optional `reason?: "cashback_policy_unavailable"` field).
  The production selector is created by `createShopeeOfferSelector` in
  `src/services/shopee-offer-selector.factory.ts` and wired through
  `src/services/shopee-offer-selector.server.ts`. It queries the
  canonical Drizzle-backed catalog via `listActiveShopeeOffersWithPolicyStatusAsync`
  (which uses a LEFT JOIN on `cashback_policies` so offers without a
  policy are still returned). The selector distinguishes three cases:
  (1) no active offer → `no_active_offer`; (2) active offer exists but
  has no cashback policy → `eligibility_unknown` with reason
  `cashback_policy_unavailable`; (3) active offer with policy matches
  the product → `eligible`. Until a product/shop/category → offer
  mapping is introduced in the schema, unmatched products get
  `eligibility_unknown`. No hardcoded `off-shopee-fashion` or any
  other offer ID exists in production code. Tests can inject a fake
  repository to exercise any outcome.
- Cashback quote application service:
  `resolveShopeeCashbackQuote` in
  `src/services/shopee-cashback-quote.service.ts` orchestrates
  URL resolution, metadata enrichment, offer selection, policy validation,
  and allocation. It reuses `calculateCashbackAllocation` from
  `src/lib/cashback/cashback-policy.ts` and preserves the canonical
  invariant `estimatedUserCashback + estimatedPlatformProfit ===
  estimatedNetworkCommission`.
  It returns a typed `ShopeeCashbackQuoteResult` discriminated union;
  no trusted data (price/cashback/offer/campaign id) is accepted from
  the client.
  Commission rate, cashback share, and product price are validated
  before use: commission rate must be an integer in [0, 10000]; cashback
  share must be an integer in [0, 10000]; product price must be a
  non-negative safe integer. `product_not_found` maps from HTTP 404/410
  in the provider. Catalog exceptions from `validateShopeeCatalogOffer`
  are mapped to typed outcomes. It NEVER fabricates a commission rate.
  Quote success requires the selector to return `kind = "eligible"`.
- Server boundary: `previewShopeeCashbackQuoteAction` in
  `src/app/app/cashback/actions.ts` wraps the service in a Server Action
  boundary that reads the URL from `FormData`, never accepts hidden
  fields, and maps every typed reason to a sanitized UI message.
- UI: `/app/cashback` (updated `src/app/app/cashback/page.tsx`) and the
  `ShopeeCashbackPreviewForm` (`src/features/cashback/ShopeeCashbackPreviewForm.tsx`)
  render the new preview card (`ShopeeProductPreviewCard`) with product
  image, title, shop name, price, estimated cashback, and an explicit
  "estimate" disclaimer. The CTA stays informational: no affiliate
  redirect, no click write, no purchase intent.
- Next.js image config updated to include `down-vn.img.susercontent.com`
  as a trusted CDN host for Shopee product images.

Open status:

- Phase 20H.2 does not declare a complete Shopee integration.
  The metadata adapter is best-effort and depends on Shopee keeping
  canonical product pages readable; the cashback quote is an estimate
  computed against the catalog offer returned by the selector.
  The production selector returns `eligibility_unknown` for products
  with no shop/item mapping and `cashback_policy_unavailable` for
  products whose offer lacks a cashback policy; a future phase must
  introduce a product/shop/category → offer mapping in the catalog
  before meaningful quotes can be computed for most products.
- Affiliate attribution (click write, tracking link, conversion
  ingestion) is out of scope for Phase 20H.2 and will be added in a
  later phase. The preview CTA explicitly tells the buyer.
- TikTok Shop remains deferred.

---

## Recent Delivered Milestones

- Phase 20C: persisted publisher profile editing;
- Phase 20D: persisted payout-account settings;
- Phase 20E: persisted publisher conversion reads and reporting;
- Phase 20F: consumer cashback tracking-link creation and click redirect flow;
- pre-Phase 20G delivery baseline: CI and delivery checks established;
- Phase 20G.0 architecture and data-contract documentation;
- Phase 20G.1 foundation: Shopee affiliate URL provisioning, CSV staging,
  exact `Sub_id1` attribution, persisted Shopee catalog and cashback-policy
  foundation, and PostgreSQL concurrency coverage;
- Phase 20H.1: Shopee URL normalization, identifier resolution, redirect
  loop, and pure parser contracts;
- Phase 20H.2: Shopee product preview + cashback quote pipeline (read-only).

Relevant merge commits:

- `cdf213e` - Pull Request #9, Phase 20C;
- `04e8aa8` - Pull Request #10, Phase 20D;
- `39bba45` - Pull Request #11, Phase 20E;
- `389ef9c` - Pull Request #12, Phase 20F;
- `2baa327` - Pull Request #13, pre-Phase 20G delivery baseline;
- `11c24dd` - Pull Request #17, Phase 20G.1 Shopee attribution and CSV
  ingestion foundation.

The exact Phase 20G.0 documentation merge commit and Pull Request number
are not separately verified in the current documentation branch and must
not be invented here.

---

## Delivery Baseline

The CI workflow uses Node.js 24, npm 11.13.0, and a PostgreSQL 16 service.

The current delivery path is:

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

`npx drizzle-kit migrate` and `npm run test:integration` both
require a reachable PostgreSQL database. Migration runtime
validation also requires the Supabase compatibility bootstrap
defined in `scripts/ci-bootstrap-supabase.sql`, which provisions
the `anon` and `authenticated` roles, the `auth` schema, and the
`auth.uid()` helper that the migrations and RLS policies depend
on. The CI pipeline starts the PostgreSQL 16 service, installs
the PostgreSQL client, and runs the same bootstrap before
applying migrations.

When suitable local PostgreSQL is unavailable, both runtime
migration validation (bootstrap + `npx drizzle-kit migrate`) and
integration testing (`npm run test:integration`) may be validated
by a green GitHub Actions run for the exact same commit. Do not
claim a local PASS for a command that was not run locally.

Pull Request #17 passed this delivery pipeline before merge. The current
documentation synchronization branch must run the same quality gates before
it is considered merge-ready.

Route classifications and generated-page counts must come from the current
verified Next.js build output. They must not be copied from the historical
Phase 19.5 documentation.

---

## Current Documentation Scope

The current documentation synchronization branch updates only:

- `docs/ARCHITECTURE.md`;
- `docs/PHASE_20G0_ARCHITECTURE_DATA_CONTRACT.md`;
- `docs/PROJECT_STATE.md`;
- `docs/HANDOFF.md`.

The purpose of this branch is to synchronize documentation with repository
state after Pull Request #17.

No production schema, migration, repository, service, route, authentication,
attribution, conversion, or financial behavior change belongs in this branch.

---

## Next Required Work

### Current documentation branch work

1. Finish synchronization of all four documents
   (`docs/ARCHITECTURE.md`, `docs/PHASE_20G0_ARCHITECTURE_DATA_CONTRACT.md`,
   `docs/PROJECT_STATE.md`, `docs/HANDOFF.md`).
2. Verify cross-document consistency for the partial Phase 20G.1
   delivery, identifier boundary, attribution evidence, conversion
   identity, validation/settlement split, money invariant, and
   security boundaries.
3. Run `git diff --check`.
4. Run the full quality gates in the order used by CI:
   - bootstrap Supabase-compatible PostgreSQL roles and auth helpers
     (`scripts/ci-bootstrap-supabase.sql`);
   - `npx drizzle-kit migrate`;
   - `npm run lint`;
   - `npm run typecheck`;
   - `npm test`;
   - `npm run test:integration`;
   - `npm run db:check`;
   - `npm run build`.

   `npx drizzle-kit migrate` and `npm run test:integration` both
   require a reachable PostgreSQL database, and migration
   validation also requires the Supabase compatibility bootstrap
   used by CI. When suitable local PostgreSQL is unavailable,
   both runtime migration validation and integration testing may
   be validated by a green GitHub Actions run for the exact same
   commit. Do not claim a local PASS for a command that was not
   run locally.
5. Review the complete diff for contradictions and unsupported history.
6. Commit, push, and merge only after explicit approval.

### Implementation work after this documentation branch is merged

1. Complete the documented partial Phase 20G.1 foundation by adding
   production orchestration for CSV import and batch attribution.
2. Introduce a deterministic `source_conversion_key` so that the conversion
   uniqueness boundary can move from
   `network + external_order_id` to `network + source_conversion_key`.
3. Implement idempotent normalized conversion ingestion that links each
   normalized conversion back to the staged `shopee_csv_rows` row and the
   `shopee_csv_import_batches` evidence.
4. Add replay, partial-batch failure, and operational failure handling for
   CSV ingestion.
5. Split persisted `conversions` validation and settlement into separate
   state columns and add immutable status history.
6. Implement reversal and adjustment records without erasing historical
   approval or payment facts.
7. Persist a consumer Orders projection derived from canonical conversion
   records and verify parity before removing the corresponding mock data.
8. Begin Phase 20H work only after Phase 20G.2 has produced verified parity
   for reconciliation and consumer Orders.

Do not begin any of the items above on the current documentation branch.

Do not invent a Phase 20 completion tag.

Do not mix TikTok Shop implementation into the current Shopee phase.

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
contract, with updates annotated to reflect Pull Request #17.

`docs/HANDOFF.md` is authoritative for operational continuation, verification
steps, and repository handoff instructions.

Git history, source code, migrations, and verified command output take
precedence when stale documentation conflicts with the repository.

---

## Mandatory Workflow Before Implementation

1. Read all four authoritative documents.
2. Verify the current branch and baseline commit.
3. Verify the affected persisted and mock boundaries.
4. Run the full quality gates in the order used by CI:
   - bootstrap Supabase-compatible PostgreSQL roles and auth helpers
     (`scripts/ci-bootstrap-supabase.sql`);
   - `npx drizzle-kit migrate`;
   - `npm run lint`;
   - `npm run typecheck`;
   - `npm test`;
   - `npm run test:integration`;
   - `npm run db:check`;
   - `npm run build`.

   `npx drizzle-kit migrate` and `npm run test:integration` both
   require a reachable PostgreSQL database, and migration
   validation also requires the Supabase compatibility bootstrap
   used by CI. When suitable local PostgreSQL is unavailable,
   both runtime migration validation and integration testing may
   be validated by a green GitHub Actions run for the exact same
   commit. Do not claim a local PASS for a command that was not
   run locally.
5. Audit migration and rollback safety.
6. Produce an implementation plan.
7. Wait for explicit approval before changing production implementation files.

Never invent a completion tag.

Never bypass architecture analysis.

Never use destructive Git recovery commands without explicit approval.
