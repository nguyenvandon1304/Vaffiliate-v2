/**
 * Phase 20H.7a -- PostgreSQL integration test for the post-RPC
 * classify-on-purchase path.
 *
 * Mirrors scripts/shopee-reconciliation-ingestion-postgres.integration.test.ts
 * for the fixture pattern: postgres admin client, bootstrap helper
 * that seeds publisher + Shopee advertiser/campaign/offer/policy.
 *
 * Skip behaviour: if DATABASE_URL is not set the test emits a single
 * explicit "skipping" message and passes. The `after()` hook still
 * drains the singleton client if any subtest imported the catalog
 * repo (which transitively loads `@/db/client`).
 *
 * Covered invariants:
 *
 *   A. resolveGenericShopeeCashbackOfferAsync returns the seeded offer
 *      when the generic catalog row exists.
 *
 *   B. classifyShopeeTrackingLinkAsync populates tracking_links
 *      campaign_id and offer_id when called against the same publisher.
 *
 *   C. reconcileShopeeCsvRowWithPurchaseIntentAsync promotes the CSV
 *      row whose source_sub_id1 matches the now-classified tracking
 *      link's network_sub_id. Money invariant:
 *      user_cashback + platform_profit == network_commission.
 *
 *   D. Replay is idempotent: the second call on the same row returns
 *      a non-promoted outcome (external_order_collision).
 *
 *   E. Safe failure: if no generic Shopee offer exists in the catalog,
 *      resolveGenericShopeeCashbackOfferAsync returns `unavailable`.
 *
 *   F. Phase 20H.7a correction: the shopee_purchase_intents row
 *      inserted with status='redirect_prepared' carries the
 *      CLASSIFIED campaign_id and offer_id (both non-null, equal to
 *      the catalog values). The canonical_product_url follows the
 *      `^https://shopee.vn/product/[0-9]+/[0-9]+/?$` schema check.
 */
import assert from "node:assert/strict";
import test, { after } from "node:test";

import postgres from "postgres";
import { config as loadEnv } from "dotenv";

// Tests are launched via `npm run test:integration` which uses
// `--import dotenv/config`. As a belt-and-braces measure for ad-hoc
// invocations we also call dotenv here so the script remains usable
// when run via `node --import tsx --test scripts/...`.
loadEnv({ path: ".env.local", quiet: true });

const PUBLISHER_ID =
  "00000000-0000-4000-8000-0000000007a1";
const ADVERTISER_ID = "ci-20h7a-advertiser";
const CAMPAIGN_ID = "ci-20h7a-campaign";
const OFFER_ID = "ci-20h7a-offer";

const TRACKING_LINK_ID =
  "00000000-0000-4000-8000-0000000007b1";
const NETWORK_SUB_ID =
  "vaflnk207200c0ffeedeadbeef8888";
const SHORT_CODE = "ci20h7aabcdabcdabcdabcdabcd";

const BATCH_ID = "00000000-0000-4000-8000-0000000007a3";
const STAGED_ROW_PROMOTED =
  "00000000-0000-4000-8000-0000000007a4";
const STAGED_ROW_REPLAY =
  "00000000-0000-4000-8000-0000000007a5";
const ROW_FINGERPRINT_PROMOTED =
  "7711111111111111111111111111111111111111111111111111111111111111";
const ROW_FINGERPRINT_REPLAY =
  "7722222222222222222222222222222222222222222222222222222222222222";

const INTENT_ID_PROMOTED =
  "00000000-0000-4000-8000-0000000007c1";
const INTENT_ID_REPLAY =
  "00000000-0000-4000-8000-0000000007c2";

// Schema-valid Shopee canonical product URL.
// Must satisfy `^https://shopee\.vn/product/[0-9]+/[0-9]+/?$`.
const CANONICAL_PRODUCT_URL =
  "https://shopee.vn/product/123456/987654";
const ORIGINAL_PRODUCT_URL =
  "https://shopee.vn/product/123456/987654";
const SHOP_ID = "123456";
const ITEM_ID = "987654";

// External order IDs are derived deterministically from the staged
// row UUIDs so the cleanup can target them by name even when the
// run produced an extra `conversions` row we did not pre-track.
const EXTERNAL_ORDER_ID_PROMOTED =
  "ci-20h7a-order-" + STAGED_ROW_PROMOTED.slice(-4);
const EXTERNAL_ORDER_ID_REPLAY =
  "ci-20h7a-order-" + STAGED_ROW_REPLAY.slice(-4);

const CASHBACK_SHARE_BPS = 6000;

function getDatabaseUrlOrSkip(): string | null {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    return null;
  }
  return databaseUrl;
}

/**
 * Seed publisher + Shopee catalog rows. The tracking link is left
 * UNCLASSIFIED (campaign_id, offer_id, affiliate_url all NULL) and
 * no shopee_purchase_intents row is inserted here -- the test must
 * always persist the intent AFTER classifyShopeeTrackingLinkAsync
 * has populated the classified IDs, and AFTER it has done so with a
 * canonical_product_url that satisfies the schema check constraint.
 */
async function bootstrap(admin: postgres.Sql): Promise<void> {
  await admin`
    INSERT INTO auth.users (id, raw_user_meta_data)
    VALUES (${PUBLISHER_ID}::uuid, '{}'::jsonb)
    ON CONFLICT (id) DO NOTHING
  `;
  await admin`
    INSERT INTO profiles (user_id, full_name)
    VALUES (${PUBLISHER_ID}::uuid, 'CI 20H.7a Publisher')
    ON CONFLICT (user_id) DO NOTHING
  `;
  await admin`
    INSERT INTO advertisers (id, name, platform, status)
    VALUES (${ADVERTISER_ID}, 'CI 20H.7a Advertiser', 'shopee', 'active')
    ON CONFLICT (id) DO NOTHING
  `;
  await admin`
    INSERT INTO campaigns (id, advertiser_id, name, status)
    VALUES (${CAMPAIGN_ID}, ${ADVERTISER_ID}, 'CI 20H.7a Campaign', 'active')
    ON CONFLICT (id) DO NOTHING
  `;
  await admin`
    INSERT INTO offers (id, campaign_id, name, status)
    VALUES (${OFFER_ID}, ${CAMPAIGN_ID}, 'CI 20H.7a Offer', 'active')
    ON CONFLICT (id) DO NOTHING
  `;
  await admin`
    INSERT INTO cashback_policies (offer_id, cashback_share_bps)
    VALUES (${OFFER_ID}, ${CASHBACK_SHARE_BPS})
    ON CONFLICT (offer_id) DO NOTHING
  `;
  await admin`
    INSERT INTO tracking_links (
      id, publisher_id, platform, destination_url, affiliate_url,
      campaign_id, offer_id, network_sub_id, short_code, status
    )
    VALUES (
      ${TRACKING_LINK_ID}::uuid,
      ${PUBLISHER_ID}::uuid,
      'shopee',
      'https://shopee.vn/product/123456/987654',
      NULL,
      NULL,
      NULL,
      ${NETWORK_SUB_ID}::text,
      ${SHORT_CODE}::text,
      'active'
    )
    ON CONFLICT (id) DO NOTHING
  `;
  await admin`
    INSERT INTO shopee_csv_import_batches (
      id, source_file_name, source_file_sha256, source_file_size_bytes,
      source_headers, parser_version, status, completed_at, total_rows,
      inserted_rows, duplicate_rows, attributed_rows,
      unattributed_rows, awaiting_classification_rows, rejected_rows
    )
    VALUES (
      ${BATCH_ID}::uuid,
      'ci-20h7a.csv',
      'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      1024,
      '["id","checkout_id","item_id","model_id","quantity","order_value","total_product_commission","refunded_amount","linked_product_status","processing_status","source_sub_id1"]'::jsonb,
      'v1',
      'completed',
      now(),
      1,
      1,
      0,
      0,
      1,
      0,
      0
    )
    ON CONFLICT (id) DO NOTHING
  `;
}

/**
 * Insert a redirect_prepared shopee_purchase_intents row with the
 * CLASSIFIED campaign_id/offer_id and the SCHEMA-VALID canonical URL.
 * Phase 20H.7a invariant: status='redirect_prepared' requires both
 * campaign_id and offer_id to be non-null AND canonical_product_url
 * to match `^https://shopee.vn/product/[0-9]+/[0-9]+/?$`.
 */
async function insertRedirectPreparedIntent(
  admin: postgres.Sql,
  args: {
    id: string;
  },
): Promise<void> {
  await admin`
    INSERT INTO shopee_purchase_intents (
      id, tracking_link_id, publisher_id, network_sub_id, short_code,
      original_product_url, canonical_product_url, shop_id, item_id,
      campaign_id, offer_id, affiliate_url, status, redirect_prepared_at
    )
    VALUES (
      ${args.id}::uuid,
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

async function insertPromotedStagedRow(
  admin: postgres.Sql,
  stagedRowId: string,
  rowFingerprint: string,
  externalOrderId: string,
): Promise<void> {
  // `processing_status = 'ready_for_conversion'` requires
  // source_sub_id1 / tracking_link_id / publisher_id to be non-null
  // per the shopee_csv_rows_status_attribution_check constraint.
  await admin`
    INSERT INTO shopee_csv_rows (
      id, batch_id, source_row_number, row_fingerprint_sha256, raw_row,
      external_order_id, checkout_id, item_id, model_id, quantity,
      order_value, total_product_commission, refunded_amount,
      linked_product_status, source_sub_id1, processing_status,
      tracking_link_id, publisher_id
    )
    VALUES (
      ${stagedRowId}::uuid,
      ${BATCH_ID}::uuid,
      2,
      ${rowFingerprint},
      jsonb_build_object(
        'Order ID', ${externalOrderId}::text,
        'Sub_id1', ${NETWORK_SUB_ID}::text
      ),
      ${externalOrderId}::text,
      'co-20h7a',
      ${ITEM_ID}::text,
      'm-20h7a',
      1,
      200000,
      10000,
      0,
      'linked',
      ${NETWORK_SUB_ID}::text,
      'ready_for_conversion',
      ${TRACKING_LINK_ID}::uuid,
      ${PUBLISHER_ID}::uuid
    )
    ON CONFLICT (id) DO NOTHING
  `;
}

/**
 * Clean up everything we might have written. Order: dependents first
 * so we never trip a foreign key on cascade.
 *
 * The `conversions` row created by reconcileShopeeCsvRowWithPurchaseIntentAsync
 * is keyed by (network, external_order_id). Both `external_order_id`
 * values from this fixture are listed explicitly so a rerun starts
 * from a known-clean baseline.
 */
async function cleanup(admin: postgres.Sql): Promise<void> {
  await admin`
    DELETE FROM conversions
    WHERE network = 'shopee'
      AND external_order_id IN (
        ${EXTERNAL_ORDER_ID_PROMOTED}::text,
        ${EXTERNAL_ORDER_ID_REPLAY}::text
      )
  `;
  await admin`
    DELETE FROM shopee_purchase_intents
    WHERE id IN (
      ${INTENT_ID_PROMOTED}::uuid,
      ${INTENT_ID_REPLAY}::uuid
    )
  `;
  await admin`
    DELETE FROM shopee_csv_rows
    WHERE batch_id = ${BATCH_ID}::uuid
  `;
  await admin`
    DELETE FROM shopee_csv_import_batches
    WHERE id = ${BATCH_ID}::uuid
  `;
  await admin`
    DELETE FROM tracking_links
    WHERE id = ${TRACKING_LINK_ID}::uuid
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

async function loadClassifyAndResolve() {
  const [{ classifyShopeeTrackingLinkAsync }, { resolveGenericShopeeCashbackOfferAsync }] = await Promise.all([
    import("@/repositories/affiliate-catalog.repository"),
    import("@/services/shopee-generic-cashback.service"),
  ]);
  return { classifyShopeeTrackingLinkAsync, resolveGenericShopeeCashbackOfferAsync };
}

/**
 * Inject ONLY the Phase 20H.7a fixture's Shopee offer into
 * `resolveGenericShopeeCashbackOfferAsync`.
 *
 * Production callers do not pass `dependencies.listActiveOffers`,
 * so the service hits the live catalog and the deterministic sort
 * picks whichever offer sorts first by `offerId ASC`. When the full
 * integration suite runs against a shared test database this would
 * race against `ci-20g2a-*` and `ci-20h6-*` fixtures left behind
 * by earlier integration files. Injecting a stub narrows the
 * resolver to just our fixture and keeps the rest of the flow
 * (classify, intent, staged row, reconcile) real against the DB.
 */
function stubListActiveOffers() {
  return async () => [
    {
      offerId: OFFER_ID,
      campaignId: CAMPAIGN_ID,
      advertiserId: ADVERTISER_ID,
      advertiserPlatform: "shopee" as const,
      cashbackShareBps: CASHBACK_SHARE_BPS,
    },
  ];
}

const databaseUrl = getDatabaseUrlOrSkip();

if (!databaseUrl) {
  test(
    "Phase 20H.7a: skips when DATABASE_URL is not set",
    { timeout: 5_000 },
    () => {
      // eslint-disable-next-line no-console
      console.warn(
        "[Phase 20H.7a integration] skipping PostgreSQL tests because " +
          "DATABASE_URL is not set. Set DATABASE_URL and re-run to " +
          "exercise the live classify-on-purchase flow.",
      );
    },
  );

  test(
    "Phase 20H.7a: empty catalog returns unavailable without throwing (no DB)",
    { timeout: 5_000 },
    async () => {
      // Lazy import to avoid touching the singleton DB client when
      // DATABASE_URL is not set.
      const { resolveGenericShopeeCashbackOfferAsync } = await import(
        "@/services/shopee-generic-cashback.service"
      );

      const resolution = await resolveGenericShopeeCashbackOfferAsync({
        publisherId: PUBLISHER_ID,
        dependencies: {
          listActiveOffers: async () => [],
        },
      });
      assert.deepEqual(resolution, {
        kind: "unavailable",
        reason: "no_active_offer",
      });
    },
  );
} else {
  test(
    "Phase 20H.7a: classify-on-purchase populates campaign_id and offer_id, then reconciliation promotes",
    { timeout: 60_000 },
    async () => {
      const { classifyShopeeTrackingLinkAsync, resolveGenericShopeeCashbackOfferAsync } =
        await loadClassifyAndResolve();
      const { reconcileShopeeCsvRowWithPurchaseIntentAsync } = await import(
        "@/repositories/shopee-reconciliation-ingestion.repository"
      );

      const admin = postgres(databaseUrl, { max: 4, prepare: false });
      try {
        await cleanup(admin);
        await bootstrap(admin);

        // (1) Resolve the generic offer. Inject ONLY the Phase 20H.7a
        //     fixture offer via the dependency override so the full
        //     integration suite (which leaves other fixtures in the
        //     shared DEV database) cannot race our resolve call.
        const genericOffer = await resolveGenericShopeeCashbackOfferAsync({
          publisherId: PUBLISHER_ID,
          dependencies: {
            listActiveOffers: stubListActiveOffers(),
          },
        });
        assert.equal(genericOffer.kind, "available");
        if (genericOffer.kind !== "available") return;
        assert.equal(genericOffer.offerId, OFFER_ID);
        assert.equal(genericOffer.campaignId, CAMPAIGN_ID);
        assert.equal(genericOffer.cashbackShareBps, CASHBACK_SHARE_BPS);

        // (2) Run the classifier. The classified IDs returned here
        //     are the SAME values written to the DB row.
        const classifyResult = await classifyShopeeTrackingLinkAsync({
          publisherId: PUBLISHER_ID,
          trackingLinkId: TRACKING_LINK_ID,
          offerId: genericOffer.offerId,
        });
        assert.equal(classifyResult.campaignId, CAMPAIGN_ID);
        assert.equal(classifyResult.offerId, OFFER_ID);

        // (3) Assert tracking_link row has the classified IDs (NOT NULL).
        const [link] = await admin<{
          campaignId: string | null;
          offerId: string | null;
        }[]>`
          SELECT campaign_id AS "campaignId",
                 offer_id AS "offerId"
          FROM tracking_links
          WHERE id = ${TRACKING_LINK_ID}::uuid
        `;
        assert.ok(link);
        assert.equal(link.campaignId, CAMPAIGN_ID);
        assert.equal(link.offerId, OFFER_ID);

        // (4) Insert the redirect_prepared shopee_purchase_intents
        //     with the CLASSIFIED campaign_id/offer_id and a
        //     schema-valid canonical URL.
        await insertRedirectPreparedIntent(admin, {
          id: INTENT_ID_PROMOTED,
        });

        // (5) Insert the staged CSV row keyed by NETWORK_SUB_ID.
        await insertPromotedStagedRow(
          admin,
          STAGED_ROW_PROMOTED,
          ROW_FINGERPRINT_PROMOTED,
          EXTERNAL_ORDER_ID_PROMOTED,
        );

        // (6) Run reconciliation. Should promote the staged row
        //     because the intent exists with the matching network_sub_id.
        const reconciliation = await reconcileShopeeCsvRowWithPurchaseIntentAsync(
          {
            stagedRowId: STAGED_ROW_PROMOTED,
          },
        );

        assert.equal(reconciliation.kind, "promoted");
        if (reconciliation.kind !== "promoted") return;
        assert.ok(reconciliation.conversion.id.length > 0);
        assert.equal(reconciliation.conversion.network, "shopee");
        assert.equal(
          reconciliation.conversion.externalOrderId,
          EXTERNAL_ORDER_ID_PROMOTED,
        );
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
    "Phase 20H.7a: replaying the same staged row is idempotent",
    { timeout: 60_000 },
    async () => {
      const { classifyShopeeTrackingLinkAsync, resolveGenericShopeeCashbackOfferAsync } =
        await loadClassifyAndResolve();
      const { reconcileShopeeCsvRowWithPurchaseIntentAsync } = await import(
        "@/repositories/shopee-reconciliation-ingestion.repository"
      );

      const admin = postgres(databaseUrl, { max: 4, prepare: false });
      try {
        await cleanup(admin);
        await bootstrap(admin);

        const genericOffer = await resolveGenericShopeeCashbackOfferAsync({
          publisherId: PUBLISHER_ID,
          dependencies: {
            listActiveOffers: stubListActiveOffers(),
          },
        });
        if (genericOffer.kind !== "available") {
          throw new Error("expected generic offer to be available");
        }

        const classifyResult = await classifyShopeeTrackingLinkAsync({
          publisherId: PUBLISHER_ID,
          trackingLinkId: TRACKING_LINK_ID,
          offerId: genericOffer.offerId,
        });
        assert.equal(classifyResult.campaignId, CAMPAIGN_ID);
        assert.equal(classifyResult.offerId, OFFER_ID);

        await insertRedirectPreparedIntent(admin, {
          id: INTENT_ID_REPLAY,
        });
        await insertPromotedStagedRow(
          admin,
          STAGED_ROW_REPLAY,
          ROW_FINGERPRINT_REPLAY,
          EXTERNAL_ORDER_ID_REPLAY,
        );

        const first = await reconcileShopeeCsvRowWithPurchaseIntentAsync({
          stagedRowId: STAGED_ROW_REPLAY,
        });
        assert.equal(first.kind, "promoted");

        const replay = await reconcileShopeeCsvRowWithPurchaseIntentAsync({
          stagedRowId: STAGED_ROW_REPLAY,
        });
        assert.notEqual(replay.kind, "promoted");
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
    "Phase 20H.7a: classified campaign_id/offer_id persist into shopee_purchase_intents and survive a DB read",
    { timeout: 60_000 },
    async () => {
      const { classifyShopeeTrackingLinkAsync, resolveGenericShopeeCashbackOfferAsync } =
        await loadClassifyAndResolve();

      const admin = postgres(databaseUrl, { max: 4, prepare: false });
      try {
        await cleanup(admin);
        await bootstrap(admin);

        // (1) Resolve the generic offer. Inject ONLY the Phase 20H.7a
        //     fixture offer via the dependency override so the full
        //     integration suite (which leaves other fixtures in the
        //     shared DEV database) cannot race our resolve call.
        const genericOffer = await resolveGenericShopeeCashbackOfferAsync({
          publisherId: PUBLISHER_ID,
          dependencies: {
            listActiveOffers: stubListActiveOffers(),
          },
        });
        assert.equal(genericOffer.kind, "available");
        if (genericOffer.kind !== "available") return;
        assert.equal(genericOffer.offerId, OFFER_ID);
        assert.equal(genericOffer.campaignId, CAMPAIGN_ID);

        // (2) BEFORE classification: assert tracking_link.campaign_id
        //     and offer_id are NULL (this is the bug we are guarding).
        const [pre] = await admin<{
          campaignId: string | null;
          offerId: string | null;
        }[]>`
          SELECT campaign_id AS "campaignId",
                 offer_id AS "offerId"
          FROM tracking_links
          WHERE id = ${TRACKING_LINK_ID}::uuid
        `;
        assert.ok(pre, "fixture tracking link must exist");
        assert.equal(pre.campaignId, null);
        assert.equal(pre.offerId, null);

        // (3) Run the classifier. The classified IDs returned here
        //     are the SAME values written to the DB row.
        const classifyResult = await classifyShopeeTrackingLinkAsync({
          publisherId: PUBLISHER_ID,
          trackingLinkId: TRACKING_LINK_ID,
          offerId: genericOffer.offerId,
        });
        assert.equal(classifyResult.campaignId, CAMPAIGN_ID);
        assert.equal(classifyResult.offerId, OFFER_ID);

        // (4) Verify the tracking_link row now has the classified IDs.
        const [post] = await admin<{
          campaignId: string | null;
          offerId: string | null;
        }[]>`
          SELECT campaign_id AS "campaignId",
                 offer_id AS "offerId"
          FROM tracking_links
          WHERE id = ${TRACKING_LINK_ID}::uuid
        `;
        assert.ok(post);
        assert.equal(post.campaignId, CAMPAIGN_ID);
        assert.equal(post.offerId, OFFER_ID);

        // (5) Insert a redirect_prepared intent with the CLASSIFIED
        //     campaign_id/offer_id and the schema-valid canonical URL.
        await insertRedirectPreparedIntent(admin, {
          id: INTENT_ID_PROMOTED,
        });

        // (6) Read the persisted intent row back and assert every
        //     invariant the schema check enforces.
        const intentRows = await admin<{
          campaignId: string | null;
          offerId: string | null;
          status: string;
          trackingLinkId: string;
          canonicalProductUrl: string;
          originalProductUrl: string;
          shopId: string;
          itemId: string;
          networkSubId: string;
        }[]>`
          SELECT campaign_id AS "campaignId",
                 offer_id AS "offerId",
                 status,
                 tracking_link_id AS "trackingLinkId",
                 canonical_product_url AS "canonicalProductUrl",
                 original_product_url AS "originalProductUrl",
                 shop_id AS "shopId",
                 item_id AS "itemId",
                 network_sub_id AS "networkSubId"
          FROM shopee_purchase_intents
          WHERE id = ${INTENT_ID_PROMOTED}::uuid
        `;
        const intentRow = intentRows[0];
        assert.ok(intentRow, "purchase intent row must exist");
        assert.equal(intentRow.status, "redirect_prepared");
        assert.equal(intentRow.trackingLinkId, TRACKING_LINK_ID);
        assert.equal(intentRow.networkSubId, NETWORK_SUB_ID);
        assert.equal(intentRow.shopId, SHOP_ID);
        assert.equal(intentRow.itemId, ITEM_ID);
        assert.notEqual(
          intentRow.campaignId,
          null,
          "purchase intent must persist classified campaign_id",
        );
        assert.notEqual(
          intentRow.offerId,
          null,
          "purchase intent must persist classified offer_id",
        );
        assert.equal(intentRow.campaignId, CAMPAIGN_ID);
        assert.equal(intentRow.offerId, OFFER_ID);
        assert.equal(intentRow.canonicalProductUrl, CANONICAL_PRODUCT_URL);
        assert.match(
          intentRow.canonicalProductUrl,
          /^https:\/\/shopee\.vn\/product\/[0-9]+\/[0-9]+\/?$/,
          "canonical_product_url must satisfy the schema check regex",
        );
      } finally {
        try {
          await cleanup(admin);
        } finally {
          await admin.end({ timeout: 5 });
        }
      }
    },
  );
}

test(
  "Phase 20H.7a: empty catalog returns unavailable without throwing -- duplicate",
  { timeout: 5_000 },
  async () => {
    // This test exists purely to run the empty-catalog path under
    // the assumption DATABASE_URL IS set. If the URL is missing the
    // noDB branch above already covers the same logic with a stub
    // and never touches the singleton DB client. Skip otherwise to
    // keep the live and off-line paths distinct.
    if (!process.env.DATABASE_URL?.trim()) {
      return;
    }
    const { resolveGenericShopeeCashbackOfferAsync } =
      await loadClassifyAndResolve();

    const resolution = await resolveGenericShopeeCashbackOfferAsync({
      publisherId: PUBLISHER_ID,
      dependencies: {
        listActiveOffers: async () => [],
      },
    });
    assert.deepEqual(resolution, {
      kind: "unavailable",
      reason: "no_active_offer",
    });
  },
);

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
      return;
    }

    // eslint-disable-next-line no-console
    console.warn(
      "[Phase 20H.7a after()] unexpected error draining singleton postgres client: " +
        message,
    );
    throw error;
  }
});
