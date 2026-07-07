/**
 * Phase 20H.6 -- PostgreSQL integration test for the reconciliation
 * ingestion entry point reconcileShopeeCsvRowWithPurchaseIntentAsync.
 *
 * Pattern: mirrors scripts/shopee-conversion-promoter-postgres.integration.test.ts.
 * Requires DATABASE_URL pointing at a Supabase / Postgres instance where
 * every migration through the latest drizzle/*.sql has been applied.
 * The CI runner applies the migrations in order; this test only inserts
 * and asserts, never mutates the schema.
 *
 * Covered invariants:
 *
 *   A. Pre-DB attribution validation:
 *      - null source_sub_id1 returns attribution_invalid /
 *        missing_attribution_field BEFORE purchase-intent lookup
 *      - blank / whitespace source_sub_id1 returns attribution_invalid /
 *        missing_attribution_field BEFORE purchase-intent lookup
 *      - malformed source_sub_id1 returns attribution_invalid /
 *        invalid_attribution_format BEFORE purchase-intent lookup
 *
 *   B. Purchase-intent matching:
 *      - valid token but no matching intent returns
 *        skip / purchase_intent_not_found WITHOUT leaking the token
 *      - intent in non-redirect_prepared status returns
 *        attribution_invalid / intent_not_redirect_prepared
 *
 *   C. Happy path with the Phase 20H.6 NEW attribution path:
 *      - staged row has tracking_link_id = NULL and publisher_id = NULL
 *      - source_sub_id1 is a valid vaflnk token
 *      - matched purchase intent supplies the (tracking_link_id,
 *        publisher_id) pair via the locked catalog snapshot
 *      - the repository promotes to a canonical conversion via the
 *        Phase 20H.6 path -- NOT the legacy pre-attributed CSV path.
 *
 *   D. Idempotency:
 *      - replaying the same staged row returns duplicate
 *
 *   E. Money invariant:
 *      - promoted row carries network_commission =
 *        user_cashback + platform_profit
 *
 *   F. Catalog snapshot integrity:
 *      - a schema-valid Shopee tracking link whose campaign_id or
 *        offer_id is NULL (unclassified) makes the repository's
 *        lockAndLoadShopeeCatalogForReconcile return null and the
 *        post-lock check returns catalog_snapshot_not_found without
 *        promoting a conversion.
 *      - Note: an outright catalog.publisherId != intent.publisherId
 *        mismatch is not representable as a DB fixture because the
 *        shopee_purchase_intents_tracking_link_publisher_fk composite
 *        FK enforces that (tracking_link_id, publisher_id) must match
 *        a real tracking_links row, and tracking_links_id_publisher_unique
 *        forbids the same id from being owned by two publishers.
 *
 *   G. Safety (expanded):
 *      - failure details never contain any of: vaflnk, an_redir, /go/,
 *        clickId, trackingPath, networkSubId, sourceSubId1,
 *        source_sub_id1, purchaseIntentId, trackingLinkId,
 *        publisherId, shortCode
 */
import assert from "node:assert/strict";
import test, { after } from "node:test";

import postgres from "postgres";

// Fixture identifiers. Distinct from any other integration test's
// fixtures so the suite is idempotent across reruns.
const PUBLISHER_ID =
  "00000000-0000-4000-8000-0000000006a1";
const ADVERTISER_ID = "ci-20h6-advertiser";
const CAMPAIGN_ID = "ci-20h6-campaign";
const OFFER_ID = "ci-20h6-offer";

const TRACKING_LINK_ID =
  "00000000-0000-4000-8000-0000000006b1";
// Valid vaflnk + 24 hex chars, distinct from the 20G.2a suite.
const NETWORK_SUB_ID =
  "vaflnk20b200c0ffeedeadbeef6666";
const SHORT_CODE = "ci20h6abcdabcdabcdabcdabcd";

// Second tracking link used by the unclassified-tracking-link catalog test.
// Must have a distinct network_sub_id (tracking_links_network_sub_id_unique)
// and a distinct tracking_link_id. platform = 'shopee' (only 'shopee' and
// 'tiktok' are permitted by tracking_links_platform_check), but
// campaign_id = NULL AND offer_id = NULL. That makes the row schema-valid
// (the classification_pair_check explicitly allows the both-NULL pair)
// and FK-valid (the (id, publisher_id) composite matches the
// shopee_purchase_intents_tracking_link_publisher_fk), while the
// repository's lockAndLoadShopeeCatalogForReconcile returns null on
// either NULL (see src/repositories/shopee-reconciliation-ingestion.repository.ts
// lines 244-248), exercising the exact catalog_snapshot_not_found path
// without violating any platform or FK check.
const TRACKING_LINK_ID_UNCLASSIFIED =
  "00000000-0000-4000-8000-0000000006b2";
// Separate valid vaflnk + 24 lowercase hex, distinct from NETWORK_SUB_ID.
const NETWORK_SUB_ID_UNCLASSIFIED =
  "vaflnk20b200c0ffeedeadbeef7777";
const SHORT_CODE_UNCLASSIFIED = "ci20h6efghijklmnopqrstuvwx";

const BATCH_ID = "00000000-0000-4000-8000-0000000006a3";
const SOURCE_FILE_SHA256 =
  "6666666666666666666666666666666666666666666666666666666666666666";

// Per-test staged-row UUIDs. Each test owns its own staged-row id so
// tests can run independently and in any order without colliding.
const STAGED_ROW_HAPPY_PATH = "00000000-0000-4000-8000-0000000006a4";
const STAGED_ROW_NULL_SUB_ID = "00000000-0000-4000-8000-0000000006a5";
const STAGED_ROW_BLANK_SUB_ID = "00000000-0000-4000-8000-0000000006a6";
const STAGED_ROW_MALFORMED_SUB_ID = "00000000-0000-4000-8000-0000000006a7";
const STAGED_ROW_NO_INTENT = "00000000-0000-4000-8000-0000000006a8";
const STAGED_ROW_BAD_STATUS = "00000000-0000-4000-8000-0000000006a9";
const STAGED_ROW_NOT_READY = "00000000-0000-4000-8000-0000000006aa";
const STAGED_ROW_PUBLISHER_MISMATCH = "00000000-0000-4000-8000-0000000006ab";

const INTENT_ID = "00000000-0000-4000-8000-0000000006c1";
const INTENT_ID_BAD_STATUS = "00000000-0000-4000-8000-0000000006c2";
const INTENT_ID_PUBLISHER_MISMATCH = "00000000-0000-4000-8000-0000000006c3";

// The catalog-failure scenario intentionally uses an unclassified Shopee
// tracking link (campaign_id=NULL, offer_id=NULL) rather than a second
// publisher. See TRACKING_LINK_ID_UNCLASSIFIED above.

// Per-test row_fingerprint_sha256 values. Each is a 64-char lowercase
// hex string, satisfying shopee_csv_rows_fingerprint_check
// (~ ^[a-f0-9]{64}$). Mapped 1:1 with the staged-row UUIDs above so
// trivially preserved when tests run in any order.
const ROW_FINGERPRINTS: Record<string, string> = {
  [STAGED_ROW_HAPPY_PATH]:
    "6666666666666666666666666666666666666666666666666666666666666666",
  [STAGED_ROW_NULL_SUB_ID]:
    "6111111111111111111111111111111111111111111111111111111111111111",
  [STAGED_ROW_BLANK_SUB_ID]:
    "6222222222222222222222222222222222222222222222222222222222222222",
  [STAGED_ROW_MALFORMED_SUB_ID]:
    "6333333333333333333333333333333333333333333333333333333333333333",
  [STAGED_ROW_NO_INTENT]:
    "6444444444444444444444444444444444444444444444444444444444444444",
  [STAGED_ROW_BAD_STATUS]:
    "6555555555555555555555555555555555555555555555555555555555555555",
  [STAGED_ROW_NOT_READY]:
    "6777777777777777777777777777777777777777777777777777777777777777",
  [STAGED_ROW_PUBLISHER_MISMATCH]:
    "6888888888888888888888888888888888888888888888888888888888888888",
};

const EXTERNAL_ORDER_ID_HAPPY = "ci-20h6-order-001";
const EXTERNAL_ORDER_ID_MISMATCH = "ci-20h6-order-002";

// Expanded forbidden-token list. Mirrors
// src/repositories/shopee-reconciliation-attribution-mapper.ts.
const KNOWN_FORBIDDEN_DETAIL_TOKENS = Object.freeze([
  "vaflnk",
  "an_redir",
  "/go/",
  "clickId",
  "trackingPath",
  "networkSubId",
  "sourceSubId1",
  "source_sub_id1",
  "purchaseIntentId",
  "trackingLinkId",
  "publisherId",
  "shortCode",
]);

// Closed-enum technical labels that MUST NOT leak into details.
const FORBIDDEN_LABELS_IN_DETAILS = Object.freeze([
  "missing_attribution_field",
  "invalid_attribution_format",
  "sub_id_mismatch",
  "intent_not_redirect_prepared",
  "intent_missing_required_field",
  "source_sub_id1_null",
  "source_sub_id1_blank",
  "publisher_id_blank",
  "tracking_link_id_blank",
  "intent_status_pending",
  "intent_status_expired",
  "intent_status_consumed",
  "intent_status_unknown",
]);

function requireDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required for Phase 20H.6 PostgreSQL integration tests",
    );
  }
  return databaseUrl;
}

function assertNoForbiddenTokens(value: string, label: string): void {
  for (const t of KNOWN_FORBIDDEN_DETAIL_TOKENS) {
    assert.ok(
      !value.includes(t),
      `${label} leaked forbidden token ${t}: ${value}`,
    );
  }
  for (const l of FORBIDDEN_LABELS_IN_DETAILS) {
    assert.ok(
      !value.includes(l),
      `${label} leaked closed-enum label ${l}: ${value}`,
    );
  }
  // Also assert no part of any fixture id sneaks into details.
  for (const id of [
    PUBLISHER_ID,
    ADVERTISER_ID,
    CAMPAIGN_ID,
    OFFER_ID,
    TRACKING_LINK_ID,
    TRACKING_LINK_ID_UNCLASSIFIED,
    NETWORK_SUB_ID,
    NETWORK_SUB_ID_UNCLASSIFIED,
    INTENT_ID,
    INTENT_ID_BAD_STATUS,
    INTENT_ID_PUBLISHER_MISMATCH,
  ]) {
    assert.ok(
      !value.includes(id),
      `${label} leaked fixture id ${id}: ${value}`,
    );
  }
}

async function cleanup(admin: postgres.Sql): Promise<void> {
  // Order: dependents first.
  await admin`
    DELETE FROM conversions
    WHERE network = 'shopee'
      AND external_order_id IN (
        ${EXTERNAL_ORDER_ID_HAPPY}, ${EXTERNAL_ORDER_ID_MISMATCH}
      )
  `;
  for (const fp of Object.values(ROW_FINGERPRINTS)) {
    await admin`
      DELETE FROM shopee_ingestion_events
      WHERE network = 'shopee'
        AND source_event_id = ${fp}::text
    `;
  }
  await admin`
    DELETE FROM shopee_purchase_intents
    WHERE id IN (
      ${INTENT_ID}::uuid,
      ${INTENT_ID_BAD_STATUS}::uuid,
      ${INTENT_ID_PUBLISHER_MISMATCH}::uuid
    )
  `;
  await admin`
    DELETE FROM shopee_csv_rows
    WHERE id IN (
      ${STAGED_ROW_HAPPY_PATH}::uuid,
      ${STAGED_ROW_NULL_SUB_ID}::uuid,
      ${STAGED_ROW_BLANK_SUB_ID}::uuid,
      ${STAGED_ROW_MALFORMED_SUB_ID}::uuid,
      ${STAGED_ROW_NO_INTENT}::uuid,
      ${STAGED_ROW_BAD_STATUS}::uuid,
      ${STAGED_ROW_NOT_READY}::uuid,
      ${STAGED_ROW_PUBLISHER_MISMATCH}::uuid
    )
  `;
  await admin`
    DELETE FROM shopee_csv_import_batches
    WHERE id = ${BATCH_ID}::uuid
  `;
  await admin`
    DELETE FROM tracking_links
    WHERE id IN (
      ${TRACKING_LINK_ID}::uuid,
      ${TRACKING_LINK_ID_UNCLASSIFIED}::uuid
    )
  `;
  await admin`
    DELETE FROM cashback_policies
    WHERE offer_id = ${OFFER_ID}
  `;
  await admin`
    DELETE FROM offers
    WHERE id = ${OFFER_ID}
  `;
  await admin`
    DELETE FROM campaigns
    WHERE id = ${CAMPAIGN_ID}
  `;
  await admin`
    DELETE FROM advertisers
    WHERE id = ${ADVERTISER_ID}
  `;
  await admin`
    DELETE FROM profiles
    WHERE user_id = ${PUBLISHER_ID}::uuid
  `;
  await admin`
    DELETE FROM auth.users
    WHERE id = ${PUBLISHER_ID}::uuid
  `;
}

async function bootstrap(admin: postgres.Sql): Promise<void> {
  // Publishers + auth.users. Mirrors the fixture pattern used by
  // scripts/affiliate-catalog-postgres.integration.test.ts and
  // scripts/shopee-conversion-promoter-postgres.integration.test.ts:
  // auth.users carries raw_user_meta_data; profiles only needs user_id
  // (the project's profiles table has user_id, full_name, phone,
  // avatar_url, member_tier, preferred_platforms, created_at, updated_at
  // -- no display_name / role columns).
  await admin`
    INSERT INTO auth.users (id, raw_user_meta_data)
    VALUES
      (${PUBLISHER_ID}::uuid, '{}'::jsonb)
    ON CONFLICT (id) DO NOTHING
  `;
  await admin`
    INSERT INTO profiles (user_id, full_name)
    VALUES
      (${PUBLISHER_ID}::uuid, 'CI 20H.6 Publisher')
    ON CONFLICT (user_id) DO NOTHING
  `;
  // Advertiser + campaign + offer + policy.
  await admin`
    INSERT INTO advertisers (id, name, platform, status)
    VALUES (${ADVERTISER_ID}, 'CI 20H.6 Advertiser', 'shopee', 'active')
    ON CONFLICT (id) DO NOTHING
  `;
  await admin`
    INSERT INTO campaigns (id, advertiser_id, name, status)
    VALUES (${CAMPAIGN_ID}, ${ADVERTISER_ID}, 'CI 20H.6 Campaign', 'active')
    ON CONFLICT (id) DO NOTHING
  `;
  await admin`
    INSERT INTO offers (id, campaign_id, name, status)
    VALUES (${OFFER_ID}, ${CAMPAIGN_ID}, 'CI 20H.6 Offer', 'active')
    ON CONFLICT (id) DO NOTHING
  `;
  await admin`
    INSERT INTO cashback_policies (offer_id, cashback_share_bps)
    VALUES (${OFFER_ID}, 6000)
    ON CONFLICT (offer_id) DO NOTHING
  `;
  // Tracking link owned by PUBLISHER_ID (canonical happy-path).
  await admin`
    INSERT INTO tracking_links (
      id, publisher_id, platform, destination_url, affiliate_url,
      campaign_id, offer_id, network_sub_id, short_code, status
    )
    VALUES (
      ${TRACKING_LINK_ID}::uuid,
      ${PUBLISHER_ID}::uuid,
      'shopee',
      'https://shopee.vn/ci-20h6-product',
      NULL,
      ${CAMPAIGN_ID}::text,
      ${OFFER_ID}::text,
      ${NETWORK_SUB_ID}::text,
      ${SHORT_CODE}::text,
      'active'
    )
    ON CONFLICT (id) DO NOTHING
  `;
  // Second tracking link for the unclassified-tracking-link catalog test.
  // Schema-valid Shopee tracking link with platform='shopee' (only 'shopee'
  // and 'tiktok' are permitted by tracking_links_platform_check), but with
  // campaign_id = NULL AND offer_id = NULL. The classification_pair_check
  // explicitly permits the both-NULL pair, and the (id, publisher_id)
  // composite FK on shopee_purchase_intents is satisfied because the row
  // is owned by PUBLISHER_ID. The repository's
  // lockAndLoadShopeeCatalogForReconcile returns null as soon as either
  // campaign_id or offer_id is null, so the post-lock check maps the
  // outcome to catalog_snapshot_not_found -- the safe-skip path being
  // tested, without violating any check or FK.
  await admin`
    INSERT INTO tracking_links (
      id, publisher_id, platform, destination_url, affiliate_url,
      campaign_id, offer_id, network_sub_id, short_code, status
    )
    VALUES (
      ${TRACKING_LINK_ID_UNCLASSIFIED}::uuid,
      ${PUBLISHER_ID}::uuid,
      'shopee',
      'https://shopee.vn/ci-20h6-unclassified',
      NULL,
      NULL,
      NULL,
      ${NETWORK_SUB_ID_UNCLASSIFIED}::text,
      ${SHORT_CODE_UNCLASSIFIED}::text,
      'active'
    )
    ON CONFLICT (id) DO NOTHING
  `;
  // Batch.
  await admin`
    INSERT INTO shopee_csv_import_batches (
      id, source_file_name, source_file_sha256, source_file_size_bytes,
      source_headers, parser_version, status, completed_at, total_rows,
      inserted_rows, duplicate_rows, attributed_rows,
      unattributed_rows, awaiting_classification_rows, rejected_rows
    )
    VALUES (
      ${BATCH_ID}::uuid,
      'ci-20h6-batch.csv',
      ${SOURCE_FILE_SHA256}::text,
      1024,
      jsonb_build_array('No.', 'Order ID', 'Sub_id1'),
      'v1',
      'completed',
      now(),
      1,
      1,
      0,
      0,
      0,
      0,
      0
    )
    ON CONFLICT (id) DO NOTHING
  `;
}

// Inserts a staged row with the Phase 20H.6 happy-path shape:
//   tracking_link_id  = NULL
//   publisher_id      = NULL
//   processing_status = 'unattributed' (the only status that allows both
//                       ownership columns to be NULL per
//                       shopee_csv_rows_status_attribution_check).
// source_sub_id1 is the only CSV attribution field. The reconciliation
// entry point lifts tracking_link_id and publisher_id from the matched
// purchase intent + locked catalog snapshot, and forwards a derived
// ShopeeStagedRow whose processingStatus is forced to ready_for_conversion
// before the reducer pre-check.
async function insertHappyPathStagedRow(
  admin: postgres.Sql,
  args: {
    id: string;
    sourceSubId1: string;
    externalOrderId?: string;
    processingStatus?: string;
    /**
     * `source_row_number` for this staged row inside the shared
     * `BATCH_ID`. Must be distinct per test to satisfy
     * `shopee_csv_rows_batch_row_unique (batch_id, source_row_number)`
     * and must be `>= 2` per
     * `shopee_csv_rows_source_row_check`. The audit-preferred
     * mapping is null=2, blank=3, malformed=4, no_intent=5,
     * bad_status=6, happy=7, unclassified=8, not_ready=9. The
     * `cleanup()` always runs first, so per-test re-runs are safe.
     */
    sourceRowNumber: number;
    /**
     * 64-char lowercase hex satisfying
     * `shopee_csv_rows_fingerprint_check (~ ^[a-f0-9]{64}$)`. Mapped
     * 1:1 with the staged-row id via `ROW_FINGERPRINTS` so both the
     * `shopee_csv_rows_fingerprint_unique` index and the
     * `shopee_ingestion_events_network_source_event_unique` index
     * stay collision-free even if `cleanup()` skipped a row.
     */
    rowFingerprintSha256: string;
  },
): Promise<void> {
  // Staged-row shape for the Phase 20H.6 purchase-intent attribution
  // path:
  //   - source_row_number = args.sourceRowNumber (>= 2 per
  //                          shopee_csv_rows_source_row_check;
  //                          distinct per test per
  //                          shopee_csv_rows_batch_row_unique)
  //   - row_fingerprint_sha256 = args.rowFingerprintSha256
  //                               (64 lowercase hex per
  //                                shopee_csv_rows_fingerprint_check)
  //   - processing_status  = 'unattributed' (the only status that allows
  //                            tracking_link_id = NULL AND publisher_id = NULL
  //                            per shopee_csv_rows_status_attribution_check;
  //                            the schema-valid input for Phase 20H.6 where
  //                            the CSV row carries source_sub_id1 but no
  //                            legacy ownership columns. The reconciliation
  //                            entry point derives ownership from the
  //                            matched purchase intent + locked catalog.)
  //   - tracking_link_id   = NULL, publisher_id = NULL
  //   - source_sub_id1     = the only CSV attribution field
  //
  // linked_product_status uses 'linked' to match the promoter integration
  // test's canonical shape (the column is free text but the reducer treats
  // non-'linked' as a status gate).
  await admin`
    INSERT INTO shopee_csv_rows (
      id, batch_id, source_row_number, row_fingerprint_sha256, raw_row,
      external_order_id, checkout_id, item_id, model_id, quantity,
      order_value, total_product_commission, refunded_amount,
      linked_product_status, source_sub_id1, processing_status,
      tracking_link_id, publisher_id
    )
    VALUES (
      ${args.id}::uuid,
      ${BATCH_ID}::uuid,
      ${args.sourceRowNumber}::integer,
      ${args.rowFingerprintSha256}::text,
      jsonb_build_object(
        'Order ID', ${args.externalOrderId ?? EXTERNAL_ORDER_ID_HAPPY}::text,
        'Sub_id1', ${args.sourceSubId1}::text
      ),
      ${args.externalOrderId ?? EXTERNAL_ORDER_ID_HAPPY}::text,
      'ci-20h6-checkout-001'::text,
      '123456789'::text,
      '987654321'::text,
      1::integer,
      250000::numeric,
      5000::numeric,
      0::numeric,
      'linked',
      ${args.sourceSubId1}::text,
      ${args.processingStatus ?? "unattributed"}::text,
      NULL::uuid,
      NULL::uuid
    )
    ON CONFLICT (id) DO NOTHING
  `;
}

async function insertRedirectPreparedIntent(
  admin: postgres.Sql,
  args: {
    id: string;
    networkSubId: string;
    status: string;
    publisherId?: string;
    trackingLinkId?: string;
  },
): Promise<void> {
  await admin`
    INSERT INTO shopee_purchase_intents (
      id, publisher_id, tracking_link_id, network_sub_id, short_code,
      original_product_url, canonical_product_url, shop_id, item_id,
      campaign_id, offer_id, affiliate_url, status, redirect_prepared_at
    )
    VALUES (
      ${args.id}::uuid,
      ${args.publisherId ?? PUBLISHER_ID}::uuid,
      ${args.trackingLinkId ?? TRACKING_LINK_ID}::uuid,
      ${args.networkSubId}::text,
      ${SHORT_CODE}::text,
      'https://shopee.vn/product/123456789/987654321',
      'https://shopee.vn/product/123456789/987654321',
      '123456',
      '987654',
      ${CAMPAIGN_ID}::text,
      ${OFFER_ID}::text,
      'https://affiliate.shopee.vn/redirect',
      ${args.status}::text,
      CASE WHEN ${args.status}::text = 'redirect_prepared' THEN now() ELSE NULL END
    )
    ON CONFLICT (id) DO NOTHING
  `;
}

test(
  "Phase 20H.6: null source_sub_id1 returns attribution_invalid before intent lookup",
  { timeout: 60_000 },
  async () => {
    const databaseUrl = requireDatabaseUrl();
    const { reconcileShopeeCsvRowWithPurchaseIntentAsync } = await import(
      "@/repositories/shopee-reconciliation-ingestion.repository"
    );
    const admin = postgres(databaseUrl, { max: 4, prepare: false });
    try {
      await cleanup(admin);
      await bootstrap(admin);
      await insertHappyPathStagedRow(admin, {
        id: STAGED_ROW_NULL_SUB_ID,
        sourceSubId1: "null",
        sourceRowNumber: 2,
        rowFingerprintSha256: ROW_FINGERPRINTS[STAGED_ROW_NULL_SUB_ID],
      });
      // Overwrite source_sub_id1 with NULL for this specific test.
      await admin`
        UPDATE shopee_csv_rows
        SET source_sub_id1 = NULL
        WHERE id = ${STAGED_ROW_NULL_SUB_ID}::uuid
      `;

      const result =
        await reconcileShopeeCsvRowWithPurchaseIntentAsync({
          stagedRowId: STAGED_ROW_NULL_SUB_ID,
        });

      assert.equal(result.kind, "attribution_invalid");
      if (result.kind !== "attribution_invalid") return;
      assert.equal(result.reason, "missing_attribution_field");
      assert.equal(result.attributionSubKind, "source_sub_id1_null");
      assertNoForbiddenTokens(result.details, "null sub_id1 details");
    } finally {
      try {
        await cleanup(admin);
      } finally {
        await admin.end({ timeout: 5 });
      }
    }
  },
);

test(
  "Phase 20H.6: blank source_sub_id1 returns attribution_invalid before intent lookup",
  { timeout: 60_000 },
  async () => {
    const databaseUrl = requireDatabaseUrl();
    const { reconcileShopeeCsvRowWithPurchaseIntentAsync } = await import(
      "@/repositories/shopee-reconciliation-ingestion.repository"
    );
    const admin = postgres(databaseUrl, { max: 4, prepare: false });
    try {
      await cleanup(admin);
      await bootstrap(admin);
      await insertHappyPathStagedRow(admin, {
        id: STAGED_ROW_BLANK_SUB_ID,
        sourceSubId1: "   ",
        sourceRowNumber: 3,
        rowFingerprintSha256: ROW_FINGERPRINTS[STAGED_ROW_BLANK_SUB_ID],
      });

      const result =
        await reconcileShopeeCsvRowWithPurchaseIntentAsync({
          stagedRowId: STAGED_ROW_BLANK_SUB_ID,
        });

      assert.equal(result.kind, "attribution_invalid");
      if (result.kind !== "attribution_invalid") return;
      assert.equal(result.reason, "missing_attribution_field");
      assert.equal(result.attributionSubKind, "source_sub_id1_blank");
      assertNoForbiddenTokens(result.details, "blank sub_id1 details");
    } finally {
      try {
        await cleanup(admin);
      } finally {
        await admin.end({ timeout: 5 });
      }
    }
  },
);

test(
  "Phase 20H.6: malformed source_sub_id1 returns attribution_invalid before intent lookup",
  { timeout: 60_000 },
  async () => {
    const databaseUrl = requireDatabaseUrl();
    const { reconcileShopeeCsvRowWithPurchaseIntentAsync } = await import(
      "@/repositories/shopee-reconciliation-ingestion.repository"
    );
    const admin = postgres(databaseUrl, { max: 4, prepare: false });
    try {
      await cleanup(admin);
      await bootstrap(admin);
      await insertHappyPathStagedRow(admin, {
        id: STAGED_ROW_MALFORMED_SUB_ID,
        sourceSubId1: "not-a-token",
        sourceRowNumber: 4,
        rowFingerprintSha256: ROW_FINGERPRINTS[STAGED_ROW_MALFORMED_SUB_ID],
      });

      const result =
        await reconcileShopeeCsvRowWithPurchaseIntentAsync({
          stagedRowId: STAGED_ROW_MALFORMED_SUB_ID,
        });

      assert.equal(result.kind, "attribution_invalid");
      if (result.kind !== "attribution_invalid") return;
      assert.equal(result.reason, "invalid_attribution_format");
      assertNoForbiddenTokens(result.details, "malformed sub_id1 details");
    } finally {
      try {
        await cleanup(admin);
      } finally {
        await admin.end({ timeout: 5 });
      }
    }
  },
);

test(
  "Phase 20H.6: valid token but no intent returns purchase_intent_not_found",
  { timeout: 60_000 },
  async () => {
    const databaseUrl = requireDatabaseUrl();
    const { reconcileShopeeCsvRowWithPurchaseIntentAsync } = await import(
      "@/repositories/shopee-reconciliation-ingestion.repository"
    );
    const admin = postgres(databaseUrl, { max: 4, prepare: false });
    try {
      await cleanup(admin);
      await bootstrap(admin);
      await insertHappyPathStagedRow(admin, {
        id: STAGED_ROW_NO_INTENT,
        sourceSubId1: NETWORK_SUB_ID,
        sourceRowNumber: 5,
        rowFingerprintSha256: ROW_FINGERPRINTS[STAGED_ROW_NO_INTENT],
      });

      const result =
        await reconcileShopeeCsvRowWithPurchaseIntentAsync({
          stagedRowId: STAGED_ROW_NO_INTENT,
        });

      assert.equal(result.kind, "skip");
      if (result.kind !== "skip") return;
      assert.equal(result.reason, "purchase_intent_not_found");
      assertNoForbiddenTokens(result.details, "no intent details");
    } finally {
      try {
        await cleanup(admin);
      } finally {
        await admin.end({ timeout: 5 });
      }
    }
  },
);

test(
  "Phase 20H.6: intent in non-redirect_prepared status returns intent_not_redirect_prepared",
  { timeout: 60_000 },
  async () => {
    const databaseUrl = requireDatabaseUrl();
    const { reconcileShopeeCsvRowWithPurchaseIntentAsync } = await import(
      "@/repositories/shopee-reconciliation-ingestion.repository"
    );
    const admin = postgres(databaseUrl, { max: 4, prepare: false });
    try {
      await cleanup(admin);
      await bootstrap(admin);
      await insertRedirectPreparedIntent(admin, {
        id: INTENT_ID_BAD_STATUS,
        networkSubId: NETWORK_SUB_ID,
        status: "created",
      });
      await insertHappyPathStagedRow(admin, {
        id: STAGED_ROW_BAD_STATUS,
        sourceSubId1: NETWORK_SUB_ID,
        sourceRowNumber: 6,
        rowFingerprintSha256: ROW_FINGERPRINTS[STAGED_ROW_BAD_STATUS],
      });

      const result =
        await reconcileShopeeCsvRowWithPurchaseIntentAsync({
          stagedRowId: STAGED_ROW_BAD_STATUS,
        });

      assert.equal(result.kind, "attribution_invalid");
      if (result.kind !== "attribution_invalid") return;
      assert.equal(result.reason, "intent_not_redirect_prepared");
      assertNoForbiddenTokens(result.details, "bad status details");
    } finally {
      try {
        await cleanup(admin);
      } finally {
        await admin.end({ timeout: 5 });
      }
    }
  },
);

test(
  "Phase 20H.6: happy path matched -> promoted; replay returns duplicate; money invariant holds",
  { timeout: 60_000 },
  async () => {
    const databaseUrl = requireDatabaseUrl();
    const { reconcileShopeeCsvRowWithPurchaseIntentAsync } = await import(
      "@/repositories/shopee-reconciliation-ingestion.repository"
    );
    const admin = postgres(databaseUrl, { max: 4, prepare: false });
    try {
      await cleanup(admin);
      await bootstrap(admin);
      await insertRedirectPreparedIntent(admin, {
        id: INTENT_ID,
        networkSubId: NETWORK_SUB_ID,
        status: "redirect_prepared",
      });
      // The staged row is inserted with tracking_link_id = NULL and
      // publisher_id = NULL (Phase 20H.6 happy-path shape). The
      // matched purchase intent supplies both via the locked catalog.
      await insertHappyPathStagedRow(admin, {
        id: STAGED_ROW_HAPPY_PATH,
        sourceSubId1: NETWORK_SUB_ID,
        sourceRowNumber: 7,
        rowFingerprintSha256: ROW_FINGERPRINTS[STAGED_ROW_HAPPY_PATH],
      });

      // First call: promoted.
      const first =
        await reconcileShopeeCsvRowWithPurchaseIntentAsync({
          stagedRowId: STAGED_ROW_HAPPY_PATH,
        });
      assert.equal(first.kind, "promoted");
      if (first.kind !== "promoted") return;

      // Verify the DB conversion row was attached to the matched
      // tracking link / publisher via the catalog snapshot, NOT via
      // any pre-filled CSV fields.
      const convRows = await admin<{
        tracking_link_id: string;
        publisher_id: string;
        network_commission: string;
        user_cashback: string;
        platform_profit: string;
      }[]>`
        SELECT
          tracking_link_id::text AS tracking_link_id,
          publisher_id::text     AS publisher_id,
          network_commission::text AS network_commission,
          user_cashback::text       AS user_cashback,
          platform_profit::text     AS platform_profit
        FROM conversions
        WHERE network = 'shopee'
          AND external_order_id = ${EXTERNAL_ORDER_ID_HAPPY}
      `;
      assert.equal(convRows.length, 1);
      const r = convRows[0];
      assert.equal(r.tracking_link_id, TRACKING_LINK_ID);
      assert.equal(r.publisher_id, PUBLISHER_ID);
      // Money invariant: network_commission = user_cashback + platform_profit.
      assert.equal(
        Number(r.network_commission),
        Number(r.user_cashback) + Number(r.platform_profit),
        "money invariant: network_commission = user_cashback + platform_profit",
      );
      // 6000 bps of 5000 = 3000; remainder = 2000.
      assert.equal(r.network_commission, "5000");
      assert.equal(r.user_cashback, "3000");
      assert.equal(r.platform_profit, "2000");

      // Replay: duplicate.
      const replay =
        await reconcileShopeeCsvRowWithPurchaseIntentAsync({
          stagedRowId: STAGED_ROW_HAPPY_PATH,
        });
      assert.equal(replay.kind, "duplicate");
      if (replay.kind !== "duplicate") return;
      assert.equal(
        replay.existing.sourceConversionKey,
        first.conversion.sourceConversionKey,
      );

      // Final DB state: exactly one conversion row, exactly one
      // ingestion event row.
      const finalCount = await admin<{ count: string }[]>`
        SELECT count(*)::text AS count
        FROM conversions
        WHERE network = 'shopee'
          AND external_order_id = ${EXTERNAL_ORDER_ID_HAPPY}
      `;
      assert.equal(finalCount[0].count, "1");

      const finalIngestion = await admin<{ count: string }[]>`
        SELECT count(*)::text AS count
        FROM shopee_ingestion_events
        WHERE network = 'shopee'
          AND source_event_id = ${ROW_FINGERPRINTS[STAGED_ROW_HAPPY_PATH]}::text
      `;
      assert.equal(finalIngestion[0].count, "1");
    } finally {
      try {
        await cleanup(admin);
      } finally {
        await admin.end({ timeout: 5 });
      }
    }
  },
);

test(
  "Phase 20H.6: unclassified Shopee tracking link returns catalog_snapshot_not_found",
  { timeout: 60_000 },
  async () => {
    const databaseUrl = requireDatabaseUrl();
    const { reconcileShopeeCsvRowWithPurchaseIntentAsync } = await import(
      "@/repositories/shopee-reconciliation-ingestion.repository"
    );
    const admin = postgres(databaseUrl, { max: 4, prepare: false });
    try {
      await cleanup(admin);
      await bootstrap(admin);
      // Unclassified-tracking-link fixture: the matched intent points at
      // TRACKING_LINK_ID_UNCLASSIFIED, which is a schema-valid Shopee
      // tracking link (platform='shopee', owned by PUBLISHER_ID) whose
      // campaign_id and offer_id are both NULL. The intent therefore
      // satisfies the shopee_purchase_intents_tracking_link_publisher_fk
      // composite FK, and matchShopeeCsvPurchaseIntentAttribution
      // succeeds because the matcher only compares the trimmed
      // network_sub_id and intent fields. After the lock the repository
      // (lockAndLoadShopeeCatalogForReconcile) returns null as soon as
      // either campaign_id or offer_id is null, so the post-lock check
      // maps the outcome to catalog_snapshot_not_found without ever
      // inserting a conversion. No platform or FK constraint is violated.
      await insertRedirectPreparedIntent(admin, {
        id: INTENT_ID_PUBLISHER_MISMATCH,
        networkSubId: NETWORK_SUB_ID_UNCLASSIFIED,
        status: "redirect_prepared",
        publisherId: PUBLISHER_ID,
        trackingLinkId: TRACKING_LINK_ID_UNCLASSIFIED,
      });
      await insertHappyPathStagedRow(admin, {
        id: STAGED_ROW_PUBLISHER_MISMATCH,
        sourceSubId1: NETWORK_SUB_ID_UNCLASSIFIED,
        externalOrderId: EXTERNAL_ORDER_ID_MISMATCH,
        sourceRowNumber: 8,
        rowFingerprintSha256: ROW_FINGERPRINTS[STAGED_ROW_PUBLISHER_MISMATCH],
      });

      const result =
        await reconcileShopeeCsvRowWithPurchaseIntentAsync({
          stagedRowId: STAGED_ROW_PUBLISHER_MISMATCH,
        });

      assert.equal(result.kind, "skip");
      if (result.kind !== "skip") return;
      assert.equal(result.reason, "catalog_snapshot_not_found");
      assertNoForbiddenTokens(
        result.details,
        "unclassified catalog details",
      );

      // Verify no conversion row was inserted.
      const count = await admin<{ count: string }[]>`
        SELECT count(*)::text AS count
        FROM conversions
        WHERE network = 'shopee'
          AND external_order_id = ${EXTERNAL_ORDER_ID_MISMATCH}
      `;
      assert.equal(count[0].count, "0");
    } finally {
      try {
        await cleanup(admin);
      } finally {
        await admin.end({ timeout: 5 });
      }
    }
  },
);

test(
  "Phase 20H.6: staged row in pending status returns source_row_not_ready",
  { timeout: 60_000 },
  async () => {
    const databaseUrl = requireDatabaseUrl();
    const { reconcileShopeeCsvRowWithPurchaseIntentAsync } = await import(
      "@/repositories/shopee-reconciliation-ingestion.repository"
    );
    const admin = postgres(databaseUrl, { max: 4, prepare: false });
    try {
      await cleanup(admin);
      await bootstrap(admin);
      await insertHappyPathStagedRow(admin, {
        id: STAGED_ROW_NOT_READY,
        sourceSubId1: NETWORK_SUB_ID,
        processingStatus: "pending",
        sourceRowNumber: 9,
        rowFingerprintSha256: ROW_FINGERPRINTS[STAGED_ROW_NOT_READY],
      });

      const result =
        await reconcileShopeeCsvRowWithPurchaseIntentAsync({
          stagedRowId: STAGED_ROW_NOT_READY,
        });

      assert.equal(result.kind, "skip");
      if (result.kind !== "skip") return;
      assert.equal(result.reason, "source_row_not_ready");
      assertNoForbiddenTokens(result.details, "not-ready details");
    } finally {
      try {
        await cleanup(admin);
      } finally {
        await admin.end({ timeout: 5 });
      }
    }
  },
);

/**
 * Lifecycle: the dynamic `await import("@/repositories/shopee-reconciliation-ingestion.repository")`
 * inside the subtests above transitively loads `src/db/client.ts`, which
 * lazily opens a singleton `postgres` client at module-load time and
 * stashes it on `globalThis.__vaffiliatePostgresClient` so HMR / repeated
 * imports in dev do not pile up connections. That client is never
 * closed by the production code path -- production callers run
 * continuously -- so without this `after()` hook the `node --test`
 * runner would hang on idle postgres sockets that keep the event
 * loop alive.
 *
 * The hook drains the singleton pool with a generous timeout and
 * surfaces unexpected failures as a concise one-line `console.warn`
 * so a future operator sees something went wrong, but tolerates the
 * two known already-closed shapes (`Cannot use a pool after calling
 * end` from a double-close, plain `Error` with `Illegal invocation`
 * from a destroyed handle) without masking a passing suite.
 *
 * Known acceptable failures:
 *   - `Cannot use a pool after calling end on the pool` (double-close)
 *   - `Illegal invocation` (handle destroyed before close)
 *
 * Anything else is logged and re-thrown so the test runner exits
 * non-zero instead of silently swallowing a real regression.
 */
after(async () => {
  const candidate = (
    globalThis as unknown as {
      __vaffiliatePostgresClient?: {
        end: (options?: { timeout?: number }) => Promise<void>;
      };
    }
  ).__vaffiliatePostgresClient;

  if (!candidate) {
    return;
  }

  try {
    await candidate.end({ timeout: 5 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);

    const isAlreadyClosed =
      message.includes("Cannot use a pool after calling end") ||
      message.includes("Illegal invocation");

    if (isAlreadyClosed) {
      // Tolerated: the singleton was already closed or its handle
      // was destroyed before this hook ran. Nothing to do.
      return;
    }

    console.warn(
      "[shopee-reconciliation-ingestion after()] unexpected error draining singleton postgres client: " + message,
    );
    // Re-throw so the test runner exits non-zero on truly
    // unexpected failures, instead of silently masking them.
    throw error;
  }
});
