# Vaffiliate Project State

## Current Status

Project: Vaffiliate

Current phase: Phase 20H.5 - Shopee Cashback Preview UI

Phase status: Complete and merged through Pull Request #25. This branch
synchronizes authoritative documentation after Pull Request #25.

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

Pull Request #25 delivered the Shopee Cashback Preview UI polish on top
of the existing Phase 20H.4 Unikorn -> HTML provider chain, Phase 20H.3
purchase handoff, and Phase 20H.2 metadata pipeline. It did not modify
schema, migrations, ingestion, wallet, payout, or any backend behavior.

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

Consumer-facing Shopee cashback surfacing pipeline. Phase 20H.1
normalized Shopee URLs and resolved identifiers; Phase 20H.2 added the
URL/product preview and the secured HTML metadata provider foundation;
Phase 20H.3 added the buyer purchase handoff and tracking-link
persistence; Phase 20H.4 enriched product metadata through the Unikorn
API; Phase 20H.5 polished the existing preview UI with a typed render
model and pending-first state presentation.

Phase 20H.5 is complete and merged through Pull Request #25 at `84a6b4e`
(implementation commit `f9b0fa5`). Phase 20H.5 is UI/UX-only and does not
rewrite Phase 20H.2, Phase 20H.3, or Phase 20H.4 behavior.

Wallet and withdrawal implementation belongs to a later wallet phase
and must not begin inside Phase 20G or Phase 20H.

### Phase 20H.2

Implementation merged on branch
`feat/phase-20h2-shopee-product-preview`. Phase 20H.2 merge commit and
Phase 20H.3 baseline: `6386a13`.

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
  -> available; `OutOfStock`/`SoldOut`/`Discontinued` -> unavailable;
  missing/unknown -> unknown. Open Graph pages fall back to `unknown`
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
  - HTTP 404 / 410 -> `product_not_found`.
  - Other non-2xx -> `non_2xx_response`.
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
  (1) no active offer -> `no_active_offer`; (2) active offer exists but
  has no cashback policy -> `eligibility_unknown` with reason
  `cashback_policy_unavailable`; (3) active offer with policy matches
  the product -> `eligible`. Until a product/shop/category -> offer
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
  introduce a product/shop/category -> offer mapping in the catalog
  before meaningful quotes can be computed for most products.
- Affiliate attribution (click write, tracking link, conversion
  ingestion) was added in Phase 20H.3, not Phase 20H.2.
- TikTok Shop remains deferred.

### Phase 20H.3

Phase 20H.3 started from `6386a13`.

Phase 20H.3 merge commit and Phase 20H.4 baseline: `98731a3`.

Delivered scope:

- buyer purchase handoff (`initiateShopeePurchaseAction` and the
  `ShopeePurchaseTrigger` UI);
- deterministic affiliate URL through the Shopee verifier;
- tracking-link create / reuse and persistence decisions on
  `tracking_links.network_sub_id`;
- `/go/<shortCode>` redirect route;
- click recording (`clicks.click_token` row) before the merchant redirect;
- direct-URL and resolved-short-link neutral fallback in the cashback
  preview.

Phase 20H.3 did not change the HTML metadata provider. The secured
HTML provider remains the HTML metadata provider used here.

### Phase 20H.4

Phase 20H.4 is complete and merged through Pull Request #23.
Implementation commit: `c281509`.
Merge commit: `bd98cb2`.

Before merge, the Phase 20H.4 implementation commit `c281509` passed
the full local quality gates:

- 529 tests passed, 0 failed;
- lint passed;
- typecheck passed;
- production build passed;
- DB check passed.

The CI / Quality check for Pull Request #23 also passed before merge.

Local and remote feature branches for Phase 20H.4 were deleted after merge.

Delivered scope:

- Unikorn metadata enrichment only. Phase 20H.4 does NOT change the
  purchase handoff, click attribution, tracking-link persistence, or
  `/go/<shortCode>` redirect.
- Third-party Unikorn Product Data API
  (`https://data.addlivetag.com/product-data/product-data.php`) is used as
  the primary metadata provider.
- Vaffiliate resolves direct and short Shopee URLs to a `ShopeeProductIdentity`
  before calling the API. Only the resolved `itemId` is sent upstream. No raw
  user URLs, short links, cookies, or internal identifiers are transmitted.
- The Unikorn API returns title, image, price, and optional shop metadata.
  Third-party commission fields from the API response are ignored.
- Cashback is calculated by Vaffiliate policy and catalog, not by the
  third-party API response.
- The third-party API is non-official, untrusted, and used for metadata
  enrichment only. It is not a source of commission settlement truth.
- `dataSource` from the Unikorn response must be `api` or `db`. The
  previous `"fallback"` literal is rejected. The HTML provider remains
  the fallback when the Unikorn primary fails (timeout, rate-limit,
  HTTP error, invalid JSON, invalid schema, oversized body, redirect).
- Validation is strict and delegates productLink validation to the
  canonical Shopee product URL parser (`parseShopeeProductUrl`) so the
  Unikorn boundary inherits the same HTTPS / allowlisted-host /
  no-credentials / no-port / valid-path / no-short-link / no-shope.ee /
  no-shopee.com protections used for user input. Numeric IDs are only
  accepted when they are safe integers (`Number.isSafeInteger`) or
  non-empty ASCII digit strings.
- Neutral fallback: when both providers fail, the existing typed error behavior
  is preserved.
- No database migration or persistent metadata cache introduced by this phase.
- Pure client core (`unikorn-client.ts`): no `server-only`, no React/Next.js
  imports. Exports only `createUnikornProductDataClient` which accepts a
  resolved `ShopeeProductIdentity` and injectable fetch. The internal endpoint
  and URL construction are not exported.
- Server wrapper (`unikorn-client.server.ts`): contains `import "server-only"`,
  creates the client with global `fetch`, performs response validation via
  `parseUnikornProductDataResponse`, and exposes the validated primary
  provider.
- Provider chain (`provider-chain.ts`): pure dependency-injected chain factory.
  Does not import `server-only`, `./unikorn-client`, or `./unikorn-client.server`.
  Accepts `primaryProvider` and `fallbackProvider` as injected dependencies.
  Handles fallback eligibility for both typed errors and raw `AbortError`.
  Non-fallback-eligible errors (`product_not_found`, `product_unavailable`,
  ordinary `Error`) are rethrown without calling the HTML provider.
- Production composition: `provider.server.ts` wires `fetchUnikornProductMetadata`
  (from `./unikorn-client.server`) as `primaryProvider` and the existing
  HTML provider as `fallbackProvider` into the chain. The baseline public
  exports (`shopeeProductMetadataProvider`, `fetchMetadataForIdentity`,
  `ShopeeProductMetadataFetchLike`, `fetchShopeeProductMetadataFromUrl`)
  are preserved. `fetchShopeeProductMetadataFromUrl` resolves the URL via
  the secured server resolver (`resolveShopeeProductUrl` from
  `@/lib/shopee/product-url`) so both direct canonical Shopee product
  URLs and short links (`s.shopee.vn`) are supported through the
  resolver's redirect handling. Hostile redirect targets are rejected by
  the resolver. When an explicit fetchImpl is provided, the call is
  restricted to the HTML provider with that injected fetch instead of
  issuing an uncontrolled live Unikorn request. When fetchImpl is
  omitted, the new Unikorn -> HTML production chain is used.
- The `shopeeProductMetadataProvider` export with `getProduct` method
  conforms to the existing interface expected by the quote service.
- AbortController with explicit timer cleanup (setTimeout + clearTimeout in
  try/finally) replaces `AbortSignal.timeout`.

Production dependency path:

```
shopee-cashback-quote.service.server.ts
  -> provider.server.ts
  -> unikorn-client.server.ts (server-only)
  -> unikorn-client.ts (pure core)
```

Remaining scope:

- Order history is deferred until after Phase 20H.5.
- TikTok Shop remains deferred.

### Phase 20H.5

Phase 20H.5 is complete and merged through Pull Request #25.
Implementation commit: `f9b0fa5`. Merge commit: `84a6b4e`.

Phase 20H.5 ships a UI/UX-only polish of the buyer-facing Shopee Cashback
Preview UI on the existing `/app/cashback` route. It does not rewrite the
Phase 20H.2 metadata pipeline, the Phase 20H.3 purchase handoff, click
recording, or `/go/<shortCode>` redirect, and it does not rewrite the
Phase 20H.4 Unikorn -> HTML provider chain.

Delivered scope:

- typed payload-carrying preview render model that distinguishes pending,
  product-card, purchase-allowed fallback, resolution error, and empty
  presentation;
- pending state takes precedence over stale card, fallback, error, and
  empty states; a new pending request hides a previous product card
  immediately;
- dedicated pending panel with reduced-motion support;
- removed the static `Hoàn 60% hoa hồng` presentation; cashback percentage
  is derived only from `quote.cashbackShareBps`;
- recomposed the available-quote presentation into a single
  cashback-emphasis panel that preserves the estimate and the
  Shopee-approved commission disclaimer;
- persistent screen-reader status messaging and `aria-busy` on the preview
  and purchase buttons;
- preserved purchase handoff and `/go/<shortCode>` redirect behavior;
- exactly three UI component files were changed;
- no backend, provider, database, action, tracking, click, route, package,
  global-style, or schema changes.

Automated quality gates (passed before merge):

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

Phase 20H.5 does not change Phase 20H.2, Phase 20H.3, or Phase 20H.4
behavior. The H.2 metadata pipeline, H.3 purchase handoff, H.4
Unikorn -> HTML provider chain, and H.5 UI/UX polish remain four
distinct, non-rewriting deliverables.

Local and remote feature branches for Phase 20H.5 were deleted after
merge.

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
- Phase 20H.2: Shopee URL/product preview and secured HTML metadata provider
  foundation;
- Phase 20H.3: buyer purchase handoff, deterministic affiliate URL,
  tracking-link create/reuse and persistence decisions, `/go/<shortCode>`,
  click recording, and direct-URL and resolved-short-link neutral fallback;
- Phase 20H.4: Unikorn metadata enrichment only. Unikorn metadata
  enrichment as the primary provider with the secured HTML provider as
  fallback; only the resolved `itemId` is sent upstream; strict
  untrusted-response validation; third-party commission fields ignored;
  no migration or persistent metadata cache introduced;
- Phase 20H.5: Shopee Cashback Preview UI polish. Typed render-state model;
  pending-first stale-state protection; improved available/unavailable
  presentation; accessibility and reduced-motion support; responsive and
  manual validation; no backend or persistence changes.

Relevant merge commits:

- `cdf213e` - Pull Request #9, Phase 20C;
- `04e8aa8` - Pull Request #10, Phase 20D;
- `39bba45` - Pull Request #11, Phase 20E;
- `389ef9c` - Pull Request #12, Phase 20F;
- `2baa327` - Pull Request #13, pre-Phase 20G delivery baseline;
- `11c24dd` - Pull Request #17, Phase 20G.1 Shopee attribution and CSV
  ingestion foundation;
- `6386a13` - Pull Request #21, Phase 20H.2 product preview and
  secured HTML metadata provider;
- `98731a3` - Pull Request #22, Phase 20H.3 buyer purchase handoff,
  deterministic affiliate URL, and tracking-link persistence;
- `bd98cb2` - Pull Request #23, Phase 20H.4 Unikorn product metadata
  provider;
- `84a6b4e` - Pull Request #25, Phase 20H.5 Shopee Cashback Preview UI
  polish.

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

- `docs/PROJECT_STATE.md`;
- `docs/HANDOFF.md`.

The purpose of this branch is to synchronize authoritative documentation
with repository state after Pull Request #25 (Phase 20H.5 Shopee Cashback
Preview UI merge).

This branch is documentation-only. It must not introduce source code,
test, package, schema, migration, configuration, or runtime behavior
changes.

---

## Next Required Work

### Current documentation branch work

1. Finish synchronization of `docs/PROJECT_STATE.md` and
   `docs/HANDOFF.md` to reflect the Phase 20H.5 implementation merged
   through Pull Request #25 at `84a6b4e`.
2. Verify cross-document consistency for the Phase 20H.5 delivered
   scope, the preserved Phase 20H.2 / 20H.3 / 20H.4 boundaries, and the
   quality-gate and manual-validation facts.
3. Run `git diff --check`.
4. Run the documentation verification commands listed below.
5. Review the complete diff for contradictions and unsupported history.
6. Commit, push, and merge only after explicit approval.

This documentation branch is documentation-only. It must not run the
full application test suite, must not run migrations, and must not run a
production build. The Phase 20H.5 implementation already passed every
required quality gate before its merge commit `84a6b4e`; reproducing
those gates on the documentation branch is not required and is out of
scope for this branch.

### Next implementation phase

Next implementation phase: not yet selected.

The Phase 20G.2 reconciliation and consumer-Orders work and the later
Phase 20H wallet phase remain described in the Phase Boundaries section
above as future scope, but no Phase 20H.6 (or any other next
implementation phase) has been explicitly selected, named, scoped, or
given a baseline in the authoritative documents on this branch.

Do not begin any future implementation on the current documentation
branch.

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
