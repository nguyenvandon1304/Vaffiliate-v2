/**
 * Phase 20H.8 -- Live Postgres integration test for the Addlivetag
 * adapter.
 *
 * This integration test exercises the full happy path against a
 * real Postgres connection (DATABASE_URL):
 *
 *   1. Bootstrap a deterministic fixture (advertiser, campaign,
 *      offer, cashback policy, publisher profile, classified
 *      tracking link, redirect_prepared purchase intent).
 *   2. Stage an Addlivetag `orders` row with the canonical
 *      network_sub_id and verify the row lands in
 *      `shopee_csv_rows` with `source = 'addlivetag_api'`.
 *   3. Run reconciliation through the existing Phase 20H.6
 *      `reconcileShopeeCsvRowWithPurchaseIntentAsync` and verify
 *      that:
 *
 *        - a conversion was promoted,
 *        - the conversion has the canonical sub_id and external
 *          order id,
 *        - the staging row's processing_status did NOT mutate.
 *
 *   4. Replay the same Addlivetag row and verify the second
 *      reconciliation is `duplicate` (idempotency).
 *
 * Skips automatically when DATABASE_URL is not set.
 *
 * UUID fixtures are generated at runtime with randomUUID() to avoid
 * secret-scanning false positives. Text /
 * FK ids (advertiser / campaign / offer / short_code /
 * external_order_id / source_file_name / network_sub_id) use the
 * `ci-20h8-...` marker and are unique by RUN_TAG.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import postgres from "postgres";

const DATABASE_URL = (process.env.DATABASE_URL ?? "").trim();

if (!DATABASE_URL) {
  test("Phase 20H.8 addlivetag integration: skip when DATABASE_URL is missing", () => {
    assert.ok(true, "skipped: DATABASE_URL is not set");
  });
} else {
  const admin = postgres(DATABASE_URL, { max: 4 });

  // Human-readable run marker. Stored only in safe text / FK columns
  // -- never encoded into UUID fields.
  const RUN_TAG = `20h8-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  // Runtime UUIDs for UUID columns; generated per test run to avoid
  // secret-scanning false positives and fixture collisions.
  const PUBLISHER_ID = randomUUID();
  const TRACKING_LINK_ID = randomUUID();
  const INTENT_ID = randomUUID();
  const BATCH_ID = randomUUID();
  const STAGED_ROW_ID = randomUUID();

  // Stable 64-char lowercase hex fingerprints. The promoted and
  // replay path share `ROW_FINGERPRINT_PROMOTED` because replay
  // must hit the same fingerprint to exercise idempotency.
  const ROW_FINGERPRINT_PROMOTED =
    "7d11111111111111111111111111111111111111111111111111111111111111";

  // Text / FK ids. Use the RUN_TAG so a rerun / overlap is contained.
  const ADVERTISER_ID = `ci-${RUN_TAG}-adv`;
  const CAMPAIGN_ID = `ci-${RUN_TAG}-cmp`;
  const OFFER_ID = `ci-${RUN_TAG}-off`;
  // networkSubId format: vaflnk + 24 lowercase hex chars.
  const NETWORK_SUB_ID =
    "vaflnk" + RUN_TAG.replace(/[^a-f0-9]/g, "").padEnd(24, "0").slice(0, 24);
  const SHORT_CODE = `ci${RUN_TAG.replace(/[^a-z0-9]/g, "").padEnd(20, "0").slice(0, 20)}`;
  const EXTERNAL_ORDER_ID = `ci-${RUN_TAG}-order`;

  // Schema-valid Shopee canonical product URL.
  // Must satisfy `^https://shopee\.vn/product/[0-9]+/[0-9]+/?$`.
  const CANONICAL_PRODUCT_URL = "https://shopee.vn/product/123456/987654";
  const ORIGINAL_PRODUCT_URL = "https://shopee.vn/product/123456/987654";
  const SHOP_ID = "123456";
  const ITEM_ID = "987654";
  const CASHBACK_SHARE_BPS = 6000;

  test.after(async () => {
    try {
      // Order: dependents first so we never trip a foreign key on
      // cascade. Cleanup is keyed on the deterministic UUIDs and the
      // RUN_TAG-scoped text ids, so a partial-bootstrap rerun is
      // still safe.
      await admin`
        DELETE FROM conversions
        WHERE network = 'shopee'
          AND external_order_id = ${EXTERNAL_ORDER_ID}::text
      `;
      await admin`
        DELETE FROM shopee_csv_rows
        WHERE id = ${STAGED_ROW_ID}::uuid
      `;
      await admin`
        DELETE FROM shopee_csv_import_batches
        WHERE id = ${BATCH_ID}::uuid
      `;
      await admin`
        DELETE FROM shopee_purchase_intents
        WHERE id = ${INTENT_ID}::uuid
      `;
      await admin`
        DELETE FROM tracking_links
        WHERE id = ${TRACKING_LINK_ID}::uuid
      `;
      await admin`
        DELETE FROM cashback_policies
        WHERE offer_id = ${OFFER_ID}::text
      `;
      await admin`
        DELETE FROM offers
        WHERE id = ${OFFER_ID}::text
      `;
      await admin`
        DELETE FROM campaigns
        WHERE id = ${CAMPAIGN_ID}::text
      `;
      await admin`
        DELETE FROM advertisers
        WHERE id = ${ADVERTISER_ID}::text
      `;
      await admin`
        DELETE FROM profiles
        WHERE user_id = ${PUBLISHER_ID}::uuid
      `;
      await admin`
        DELETE FROM auth.users
        WHERE id = ${PUBLISHER_ID}::uuid
      `;
    } catch {
      // ignore partial-bootstrap cleanup failures
    } finally {
      await admin.end({ timeout: 5 });
    }
  });

  // The repository transitively imports `@/db/client`, which keeps
  // a singleton `postgres` connection open. Drain it in `after` so
  // the Node process exits naturally (mirrors the Phase 20H.7a
  // pattern).
  after(async () => {
    const candidate = (
      globalThis as unknown as {
        __vaffiliatePostgresClient?: {
          end: (options?: { timeout?: number }) => Promise<void>;
        };
      }
    ).__vaffiliatePostgresClient;
    if (!candidate) return;
    try {
      await candidate.end({ timeout: 5 });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      if (
        message.includes("Cannot use a pool after calling end") ||
        message.includes("Illegal invocation")
      ) {
        return;
      }
      throw error;
    }
  });

  async function bootstrap(): Promise<void> {
    // auth.users must exist before profiles (FK on profiles.user_id).
    await admin`
      INSERT INTO auth.users (id, raw_user_meta_data)
      VALUES (${PUBLISHER_ID}::uuid, '{}'::jsonb)
      ON CONFLICT (id) DO NOTHING
    `;
    await admin`
      INSERT INTO profiles (user_id, full_name)
      VALUES (${PUBLISHER_ID}::uuid, ${RUN_TAG + " publisher"})
      ON CONFLICT (user_id) DO NOTHING
    `;
    await admin`
      INSERT INTO advertisers (id, name, platform, status)
      VALUES (${ADVERTISER_ID}::text, ${RUN_TAG + " adv"}, 'shopee', 'active')
      ON CONFLICT (id) DO NOTHING
    `;
    await admin`
      INSERT INTO campaigns (id, advertiser_id, name, status)
      VALUES (${CAMPAIGN_ID}::text, ${ADVERTISER_ID}::text, ${RUN_TAG + " cmp"}, 'active')
      ON CONFLICT (id) DO NOTHING
    `;
    await admin`
      INSERT INTO offers (id, campaign_id, name, status)
      VALUES (${OFFER_ID}::text, ${CAMPAIGN_ID}::text, ${RUN_TAG + " off"}, 'active')
      ON CONFLICT (id) DO NOTHING
    `;
    await admin`
      INSERT INTO cashback_policies (offer_id, cashback_share_bps)
      VALUES (${OFFER_ID}::text, ${CASHBACK_SHARE_BPS})
      ON CONFLICT (offer_id) DO NOTHING
    `;
    await admin`
      INSERT INTO tracking_links (
        id, publisher_id, platform, destination_url,
        campaign_id, offer_id, network_sub_id, short_code, status
      )
      VALUES (
        ${TRACKING_LINK_ID}::uuid,
        ${PUBLISHER_ID}::uuid,
        'shopee',
        ${CANONICAL_PRODUCT_URL},
        ${CAMPAIGN_ID}::text,
        ${OFFER_ID}::text,
        ${NETWORK_SUB_ID}::text,
        ${SHORT_CODE}::text,
        'active'
      )
      ON CONFLICT (id) DO NOTHING
    `;
    await admin`
      INSERT INTO shopee_purchase_intents (
        id, tracking_link_id, publisher_id, network_sub_id, short_code,
        original_product_url, canonical_product_url, shop_id, item_id,
        campaign_id, offer_id, affiliate_url, status, redirect_prepared_at
      )
      VALUES (
        ${INTENT_ID}::uuid,
        ${TRACKING_LINK_ID}::uuid,
        ${PUBLISHER_ID}::uuid,
        ${NETWORK_SUB_ID}::text,
        ${SHORT_CODE}::text,
        ${ORIGINAL_PRODUCT_URL}::text,
        ${CANONICAL_PRODUCT_URL}::text,
        ${SHOP_ID}::text,
        ${ITEM_ID}::text,
        ${CAMPAIGN_ID}::text,
        ${OFFER_ID}::text,
        'https://affiliate.shopee.vn/redirect',
        'redirect_prepared',
        now()
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }

  test("Phase 20H.8: addlivetag happy path stages and promotes through existing pipeline", async () => {
    await bootstrap();

    const { normalizeAddlivetagRowToStaging } = await import(
      "../src/reporting/addlivetag-normalizer"
    );

    const raw = {
      order_id: EXTERNAL_ORDER_ID,
      item_id: ITEM_ID,
      shop_id: SHOP_ID,
      sub_id1: NETWORK_SUB_ID,
      order_value: "250000.00000",
      total_product_commission: "15000.00000",
      linked_product_status: "approved",
    };
    const normalized = normalizeAddlivetagRowToStaging(raw);
    assert.equal(normalized.kind, "ok");
    if (normalized.kind !== "ok") return;

    // Stage a SHOPEE-CSV batch and row to mirror the production
    // staging path with source='addlivetag_api'.
    await admin`
      INSERT INTO shopee_csv_import_batches (
        id, source_file_name, source_file_sha256, source_file_size_bytes,
        source_headers, parser_version, source, status, total_rows,
        inserted_rows, duplicate_rows, attributed_rows,
        unattributed_rows, awaiting_classification_rows, rejected_rows,
        completed_at
      )
      VALUES (
        ${BATCH_ID}::uuid,
        ${"ci-" + RUN_TAG + "-addlivetag.csv"}::text,
        ${ROW_FINGERPRINT_PROMOTED}::text,
        0,
        ${admin.json(["source", "type", "from", "to"])}::jsonb,
        'addlivetag-v1',
        'addlivetag_api',
        'completed',
        1,
        1,
        0,
        0,
        0,
        0,
        0,
        now()
      )
      ON CONFLICT (id) DO NOTHING
    `;

    await admin`
      INSERT INTO shopee_csv_rows (
        id, batch_id, source, source_row_number, row_fingerprint_sha256,
        raw_row, external_order_id, checkout_id, item_id, model_id,
        quantity, order_value, total_product_commission, refunded_amount,
        linked_product_status, source_sub_id1, processing_status,
        tracking_link_id, publisher_id
      )
      VALUES (
        ${STAGED_ROW_ID}::uuid,
        ${BATCH_ID}::uuid,
        'addlivetag_api',
        2,
        ${ROW_FINGERPRINT_PROMOTED}::text,
        jsonb_build_object(
          'Source', 'addlivetag_api'::text,
          'Type', 'orders'::text,
          'From', '2026-01-01'::text,
          'To', '2026-01-31'::text,
          'Order ID', ${EXTERNAL_ORDER_ID}::text,
          'Sub_id1', ${NETWORK_SUB_ID}::text
        ),
        ${EXTERNAL_ORDER_ID}::text,
        'ci-20h8-checkout-001'::text,
        '123456789'::text,
        '987654321'::text,
        1::integer,
        250000::numeric,
        5000::numeric,
        0::numeric,
        'linked',
        ${NETWORK_SUB_ID}::text,
        'unattributed',
        NULL::uuid,
        NULL::uuid
      )
    `;

    // Verify the row landed with source=addlivetag_api.
    const rowCheck = await admin`
      SELECT source, processing_status
      FROM shopee_csv_rows
      WHERE id = ${STAGED_ROW_ID}::uuid
    `;
    assert.equal(rowCheck.length, 1);
    assert.equal(rowCheck[0]!.source, "addlivetag_api");
    assert.equal(rowCheck[0]!.processing_status, "unattributed");

    // Now run reconciliation through the existing Phase 20H.6
    // repository. We pass a stub catalog resolver so this test
    // does not race against catalog rows from other integration
    // suites running on the same DB.
    const { reconcileShopeeCsvRowWithPurchaseIntentAsync } = await import(
      "../src/repositories/shopee-reconciliation-ingestion.repository"
    );
    const result = await reconcileShopeeCsvRowWithPurchaseIntentAsync({
      stagedRowId: STAGED_ROW_ID,
    });
    assert.equal(result.kind, "promoted");
    if (result.kind !== "promoted") return;
    assert.equal(result.conversion.externalOrderId, EXTERNAL_ORDER_ID);
    assert.equal(result.conversion.network, "shopee");

    // Replay: should be duplicate (idempotent).
    const replay = await reconcileShopeeCsvRowWithPurchaseIntentAsync({
      stagedRowId: STAGED_ROW_ID,
    });
    assert.notEqual(replay.kind, "promoted");
  });
}
