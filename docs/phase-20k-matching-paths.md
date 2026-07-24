# Phase 20K — Money-safety blocker documentation

This document records the runtime paths that produce a
`conversions` row ready for Phase 20K reconciliation. Phase 20K
itself only **reads** `conversions`; the matching work is
performed upstream by Phase 20H.6 (Shopee CSV reconciliation
ingestion) and the Addlivetag adapter (Phase 20H.8).

The boundary between upstream ingestion and Phase 20K
reconciliation is an explicit precondition: a conversion row that
lacks `source_conversion_key`, `tracking_link_id`, or a valid
`publisher_id` is treated as unmatched and Phase 20K skips it
with `rejected_missing_user` / `rejected_missing_click` /
`rejected_duplicate_source_key`.

---

## Shopee CSV path (Phase 20H.6 — `reconcileShopeeCsvRowWithPurchaseIntentAsync`)

1. **Source row**
   - Table: `shopee_csv_rows` (Phase 20G.2 staging table).
   - Required columns: `source_sub_id1`, `external_order_id`,
     `total_product_commission`, `row_fingerprint_sha256`.
2. **Token-shape pre-check (DB-free, in the repository)**
   - `source_sub_id1` must match the `vaflnk + 24 lowercase hex`
     regex.
   - Blank / null / malformed tokens are short-circuited to
     `attribution_invalid` with a `missing_attribution_field` /
     `invalid_attribution_format` reason code. NO purchase-intent
     lookup is attempted for invalid tokens.
3. **Purchase-intent match**
   - Repository: `src/repositories/shopee-reconciliation-ingestion.repository.ts`.
   - Match key: `network_sub_id` against
     `shopee_purchase_intents.network_sub_id`.
   - The lookup selects a single intent in `status = 'redirect_prepared'`.
   - Ambiguous results (multiple intents with the same
     `network_sub_id`) are treated as `purchase_intent_ambiguous`
     and the row is NOT promoted.
   - No-match returns `purchase_intent_not_found` and the row is
     NOT promoted.
4. **Catalog snapshot**
   - The repository locks the `tracking_links` row by id +
     publisher_id, returning `campaign_id`, `offer_id`,
     `publisher_id`.
   - Unclassified tracking links (campaign_id IS NULL AND offer_id
     IS NULL) are short-circuited to `catalog_snapshot_not_found`.
5. **Conversion creation**
   - Repository inserts a row in `conversions` with:
     - `network = 'shopee'`,
     - `external_order_id` from the staged row,
     - `source_conversion_key` = sha256 hex of the staged row
       (`row_fingerprint_sha256`),
     - `tracking_link_id`, `publisher_id`, `advertiser_id`,
       `campaign_id`, `offer_id` from the catalog snapshot,
     - `network_commission` = parsed `total_product_commission`
       (integer VND),
     - `user_cashback` and `platform_profit` are NOT computed by
       Phase 20H.6. Phase 20K applies the 60/40 split via
       `splitCommissionFloor()` and the conversion invariants
       require `network_commission = user_cashback +
       platform_profit` at every audit point.
   - Status: `'pending'` on insert.
6. **Ingestion-event row**
   - Repository inserts an immutable row in
     `shopee_ingestion_events` with `processing_status =
     'succeeded'`. The row is referenced from the conversion via
     `conversions.ingestion_event_id` (FK ON DELETE RESTRICT).
7. **Idempotency**
   - `conversions_network_external_order_unique` on `(network,
     external_order_id)` is the network-level idempotency key.
   - `conversions_network_source_conversion_key_unique` partial
     index on `(network, source_conversion_key)` is the line-level
     idempotency key.
   - Replays of the same staged row return
     `attribution_invalid / duplicate` from
     `reconcileShopeeCsvRowWithPurchaseIntentAsync`.

Phase 20K reads only `conversions.status` plus the immutable
columns above. The engine treats every Phase 20K input as
`linkKind = 'unique'` because the matching decision was already
made upstream.

---

## Addlivetag path (Phase 20H.8)

The Addlivetag adapter (`src/reporting/addlivetag-normalizer.ts`
and the `addlivetag-staging.service` test fixture) normalises an
Addlivetag `orders` row into a `shopee_csv_rows` row with
`source = 'addlivetag_api'` and the SAME column shape as a manual
CSV row. Once the row lands in `shopee_csv_rows`, the path from
that point on is identical to the Shopee CSV path above.

1. **Source**
   - `addlivetag_api` HTTP export (Addlivetag `orders` endpoint).
   - The `addlivetagClient` (Phase 20G.2) fetches the orders and
     the normalizer (`normalizeAddlivetagRowToStaging`) maps them
     to a staged row.
2. **Staging**
   - Staged row lands in `shopee_csv_rows` with
     `source = 'addlivetag_api'`.
   - The remaining lifecycle (purchase-intent match, catalog
     snapshot, conversion promotion) is shared with Shopee CSV.
3. **Integration coverage**
   - `scripts/addlivetag-import-postgres.integration.test.ts`
     exercises the full happy path against a real Postgres
     instance: stage the row, run the shared ingestion pipeline,
     assert the conversion is promoted, then replay and assert
     the replay returns `duplicate`.

### Addlivetag phase 20K blocker status

The Addlivetag data contract is **sufficient for Phase 20K
reconciliation**. The Addlivetag adapter writes the same
`source_conversion_key` shape as a manual CSV row, and the
ingestion pipeline produces a canonical `conversions` row that
Phase 20K can audit. Phase 20K treats any `source = 'addlivetag_api'`
conversion identically to any other Shopee CSV conversion.

If a future change adds a NEW Addlivetag field that is NOT
captured by `shopee_csv_rows`, the team must:

- update `addlivetag-normalizer.ts` to capture the field,
- update `shopee_csv_rows` schema + migration,
- update the integration test fixtures.

Without that, Addlivetag continues to work as it does today and
Phase 20K does not need to change.

---

## Phase 20K precondition contract

For a `conversions` row to be eligible for Phase 20K, the row
MUST satisfy all of:

- `network IN ('shopee', 'manual')`,
- `source_conversion_key IS NOT NULL` (SHA-256 hex),
- `status IN ('pending', 'approved', 'payable')`,
- `network_commission` is a non-negative integer VND amount,
- `user_cashback` and `platform_profit` already satisfy the
  commission allocation invariant (Phase 20H.6 stores them but
  Phase 20K recomputes via `splitCommissionFloor()` as a
  defense-in-depth check).

Rows that fail any of the above are skipped by the engine with
the matching `rejected_*` reason code. Phase 20K does not attempt
to fix upstream data; it only audits what is already in
`conversions`.

---

## Addlivetag preconditions and the only remaining open blocker

No open Addlivetag blocker exists for Phase 20K. The only
precondition is that the row produced by
`reconcileShopeeCsvRowWithPurchaseIntentAsync` carries:

- `source_conversion_key` (line-level idempotency key),
- `ingestion_event_id` (FK to the immutable ingestion event),
- `network = 'shopee'`.

These are verified by the existing Phase 20H.6 / 20H.8 integration
tests and by the static-source safety test
`scripts/shopee-reconciliation-ingestion-postgres.integration.test.ts`.

Phase 20K's required integration coverage is documented in
`21-integration-test-results.txt` of the final audit zip.
