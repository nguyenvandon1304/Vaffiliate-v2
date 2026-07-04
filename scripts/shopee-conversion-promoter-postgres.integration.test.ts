/**
 * Phase 20G.2a PostgreSQL integration test: idempotent / concurrent
 * promotion of staged Shopee CSV rows into canonical conversions, plus
 * honest handling of the legacy `network + external_order_id` uniqueness
 * boundary.
 *
 * Pattern: mirrors scripts/affiliate-catalog-postgres.integration.test.ts.
 * Requires DATABASE_URL pointing at a Supabase / Postgres instance where
 * every migration through drizzle/0020_phase_20g2a_*.sql has been applied.
 * The CI runner applies the migrations in order; this test only inserts
 * and asserts, never mutates the schema.
 *
 * Covered invariants:
 *
 * 1. First promote call inserts exactly one shopee_ingestion_events row
 *    and exactly one conversions row, with the correct ingestion_event_id
 *    foreign key.
 * 2. Second promote call with the same staged row returns
 *    { kind: "duplicate" } and does NOT insert a new conversion row or
 *    a new ingestion_events row.
 * 3. Two concurrent promote calls from separate connections serialize
 *    correctly: each returns either "promoted" or "duplicate", and the
 *    final database state has exactly one canonical conversion row.
 * 4. The conversion's source_conversion_key matches the deterministic
 *    SHA-256 hex digest that the pure reducer derives from the staged
 *    row's immutable fields (computed via the production
 *    `deriveShopeeSourceConversionKey` helper, not a stub).
 * 5. The conversion's `source_event_id` on `shopee_ingestion_events`
 *    matches the staged row's `row_fingerprint_sha256`, consistent with
 *    the production reducer design.
 * 6. Two `ready_for_conversion` staged rows that share the same
 *    `external_order_id` but differ in their `row_fingerprint_sha256`
 *    produce two distinct `source_conversion_key` values; the legacy
 *    `network + external_order_id` unique index still blocks writing
 *    both, and the repository returns a typed
 *    { kind: "skip", reason: "external_order_collision" } result rather
 *    than crashing with an unhandled unique-constraint error.
 *
 * Money expectations:
 *
 * - `total_product_commission = 5000.0`
 * - `refunded_amount        = 0.0`
 * - `cashback_share_bps     = 6000` (60.00 percent)
 *
 * Strict no-truncate no-round semantics produce integer VND:
 * - `network_commission = 5000`
 * - `user_cashback      = 3000`
 * - `platform_profit    = 2000`
 */
import assert from "node:assert/strict";
import test from "node:test";

import postgres from "postgres";

import {
  deriveShopeeSourceConversionKey,
  SHOPEE_NETWORK_LABEL,
} from "@/services/shopee-csv-row-id";

const PUBLISHER_ID =
  "00000000-0000-4000-8000-0000000000a1";
const BATCH_ID =
  "00000000-0000-4000-8000-0000000000a3";
const STAGED_ROW_ID =
  "00000000-0000-4000-8000-0000000000a4";
const STAGED_ROW_ID_CONFLICT =
  "00000000-0000-4000-8000-0000000000a5";

// Per-test tracking link fixtures. Each test owns its own
// `tracking_links` row with its own `id` and `network_sub_id` so the
// two tests can run independently and in any order without colliding
// on the `tracking_links_network_sub_id_unique` index.
//
// `network_sub_id` is enforced by
// `tracking_links_network_sub_id_check` to `^vaflnk[a-f0-9]{24}$`
// (the `tracking_links_network_sub_id_check` constraint declared in
// `src/db/schema.ts`). The values below are 30 chars total
// (`vaflnk` + 24 lowercase hex chars), are disjoint from
// `scripts/affiliate-catalog-postgres.integration.test.ts`, which
// hard-codes `vaflnk111111111111111111111111` for its own
// `TRACKING_LINK_ID = 00000000-0000-4000-8000-000000000002` row,
// and visibly encode Phase 20G.2a ownership via the
// `20b200c0ffeedeadbeef` mid-segment.
const TRACKING_LINK_ID_PRIMARY =
  "00000000-0000-4000-8000-0000000000b1";
const TRACKING_LINK_ID_COLLISION =
  "00000000-0000-4000-8000-0000000000b2";
const NETWORK_SUB_ID_PRIMARY =
  "vaflnk20b200c0ffeedeadbeef0000";
const NETWORK_SUB_ID_COLLISION =
  "vaflnk20b200c0ffeedeadbeef1111";

interface TrackingLinkFixture {
  trackingLinkId: string;
  networkSubId: string;
}

const TRACKING_LINK_FIXTURES: readonly TrackingLinkFixture[] =
  Object.freeze([
    Object.freeze({
      trackingLinkId: TRACKING_LINK_ID_PRIMARY,
      networkSubId: NETWORK_SUB_ID_PRIMARY,
    }),
    Object.freeze({
      trackingLinkId: TRACKING_LINK_ID_COLLISION,
      networkSubId: NETWORK_SUB_ID_COLLISION,
    }),
  ]);

const KNOWN_TRACKING_LINK_IDS: readonly string[] = Object.freeze(
  TRACKING_LINK_FIXTURES.map((f) => f.trackingLinkId),
);

const KNOWN_NETWORK_SUB_IDS: readonly string[] = Object.freeze(
  TRACKING_LINK_FIXTURES.map((f) => f.networkSubId),
);
const ADVERTISER_ID = "ci-20g2a-advertiser";
const CAMPAIGN_ID = "ci-20g2a-campaign";
const OFFER_ID = "ci-20g2a-offer";

const CHECKOUT_ID = "ci-20g2a-checkout";
const ITEM_ID = "ci-20g2a-item";
const MODEL_ID = "ci-20g2a-model";

// Valid 64-character lowercase hex SHA-256-shaped identifiers used as
// fixture identities for `source_file_sha256` on
// `shopee_csv_import_batches` and for `row_fingerprint_sha256` /
// `source_event_id` on the staged rows. All of these satisfy the
// `^[a-f0-9]{64}$` regex enforced by:
// - shopee_csv_import_batches_source_file_sha256_check
// - shopee_ingestion_events_payload_sha256_check
// - conversions_source_conversion_key_shape_check (when the staged
//   row is promoted to a canonical conversion)
const SOURCE_FILE_SHA256 =
  "1111111111111111111111111111111111111111111111111111111111111111";
const ROW_FINGERPRINT_A =
  "2222222222222222222222222222222222222222222222222222222222222222";
const ROW_FINGERPRINT_B =
  "3333333333333333333333333333333333333333333333333333333333333333";

const EXTERNAL_ORDER_ID_PRIMARY = "ci-20g2a-order-001";
const EXTERNAL_ORDER_ID_COLLISION = "ci-20g2a-order-conflict";

// All source_event_id values the suite may insert on
// `shopee_ingestion_events` (== row_fingerprint_sha256 of each staged
// row promoted). Cleanup must delete exactly these values, not the
// STAGED_ROW_ID::uuid::text surrogate that prior passes used.
const KNOWN_SOURCE_EVENT_IDS: readonly string[] = Object.freeze([
  ROW_FINGERPRINT_A,
  ROW_FINGERPRINT_B,
]);

function requireDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required for Phase 20G.2a PostgreSQL integration tests",
    );
  }
  return databaseUrl;
}

// Cleanup helper for the two tracking link fixtures owned by this
// suite. The DELETE predicate uses a tuple-IN so the row must match
// BOTH `id` AND `network_sub_id` simultaneously; that makes the
// delete provably disjoint from any other suite's `tracking_links`
// rows (e.g. the affiliate-catalog integration test's row whose
// `id = 00000000-0000-4000-8000-000000000002` and
// `network_sub_id = vaflnk111111111111111111111111`). After the
// delete, an explicit verification SELECT throws if any of the
// known (id, network_sub_id) tuples are still present, so a
// pre-existing stale row or a previously failed migration cannot
// silently leak into the next test.
async function deleteTrackingLinkFixtures(
  admin: postgres.Sql,
): Promise<void> {
  const [trackingLinkIdA, trackingLinkIdB] = KNOWN_TRACKING_LINK_IDS;
  const [networkSubIdA, networkSubIdB] = KNOWN_NETWORK_SUB_IDS;

  await admin.unsafe(
    `
      DELETE FROM tracking_links
      WHERE (id, network_sub_id) IN (
        ($1::uuid, $3::text),
        ($2::uuid, $4::text)
      )
    `,
    [
      trackingLinkIdA,
      trackingLinkIdB,
      networkSubIdA,
      networkSubIdB,
    ],
  );

  const leftoverRows = await admin<{ id: string; network_sub_id: string }[]>`
    SELECT id, network_sub_id
    FROM tracking_links
    WHERE (id, network_sub_id) IN (
      (${trackingLinkIdA}::uuid, ${networkSubIdA}::text),
      (${trackingLinkIdB}::uuid, ${networkSubIdB}::text)
    )
  `;
  if (leftoverRows.length > 0) {
    throw new Error(
      `deleteTrackingLinkFixtures: stale rows remain after delete: ${JSON.stringify(
        leftoverRows,
      )}. ` +
        "The pre-test cleanup in `bootstrapCatalog` will fail on the " +
        "next INSERT with `23505 duplicate key value violates " +
        "tracking_links_network_sub_id_unique`. Investigate the " +
        "previous test run's failure mode rather than re-running.",
    );
  }
}

async function cleanupShopeeFixtures(admin: postgres.Sql): Promise<void> {
  await admin`
    DELETE FROM conversions
    WHERE network = 'shopee'
      AND external_order_id LIKE 'ci-20g2a-order-%'
  `;
  // Delete ingestion events by their real source_event_id values,
  // not by STAGED_ROW_ID::uuid::text. The reducer writes
  // source_event_id = row_fingerprint_sha256, so a re-run of this
  // suite must use the same identity to avoid leaving stale rows.
  await admin`
    DELETE FROM shopee_ingestion_events
    WHERE network = 'shopee'
      AND source_event_id IN ${admin(KNOWN_SOURCE_EVENT_IDS)}
  `;
  await admin`
    DELETE FROM shopee_csv_rows
    WHERE id IN (
      ${STAGED_ROW_ID}::uuid,
      ${STAGED_ROW_ID_CONFLICT}::uuid
    )
  `;
  await admin`
    DELETE FROM shopee_csv_import_batches
    WHERE id = ${BATCH_ID}::uuid
  `;
  await deleteTrackingLinkFixtures(admin);
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

async function bootstrapCatalog(
  admin: postgres.Sql,
  args: {
    externalOrderIds: string[];
    trackingLinkFixtures: readonly TrackingLinkFixture[];
  },
): Promise<void> {
  for (const externalOrderId of args.externalOrderIds) {
    await admin`
      DELETE FROM conversions
      WHERE network = 'shopee'
        AND external_order_id = ${externalOrderId}
    `;
  }
  await admin`
    DELETE FROM shopee_ingestion_events
    WHERE network = 'shopee'
      AND source_event_id IN ${admin(KNOWN_SOURCE_EVENT_IDS)}
  `;
  await admin`
    DELETE FROM shopee_csv_rows
    WHERE id IN (
      ${STAGED_ROW_ID}::uuid,
      ${STAGED_ROW_ID_CONFLICT}::uuid
    )
  `;
  await admin`
    DELETE FROM shopee_csv_import_batches
    WHERE id = ${BATCH_ID}::uuid
  `;
  await deleteTrackingLinkFixtures(admin);
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

  await admin`
    INSERT INTO auth.users (id, raw_user_meta_data)
    VALUES (${PUBLISHER_ID}::uuid, '{}'::jsonb)
    ON CONFLICT (id) DO NOTHING
  `;
  await admin`
    INSERT INTO profiles (user_id)
    VALUES (${PUBLISHER_ID}::uuid)
    ON CONFLICT (user_id) DO NOTHING
  `;
  await admin`
    INSERT INTO advertisers (id, name, platform, status)
    VALUES (
      ${ADVERTISER_ID},
      'CI 20G.2a Advertiser',
      'shopee',
      'active'
    )
  `;
  await admin`
    INSERT INTO campaigns (id, advertiser_id, name, status)
    VALUES (
      ${CAMPAIGN_ID},
      ${ADVERTISER_ID},
      'CI 20G.2a Campaign',
      'active'
    )
  `;
  await admin`
    INSERT INTO offers (id, campaign_id, name, status)
    VALUES (
      ${OFFER_ID},
      ${CAMPAIGN_ID},
      'CI 20G.2a Offer',
      'active'
    )
  `;
  await admin`
    INSERT INTO cashback_policies (offer_id, cashback_share_bps)
    VALUES (${OFFER_ID}, 6000)
  `;
  // Each test owns its own tracking link row, identified by a unique
  // (tracking_link.id, tracking_link.network_sub_id) pair. The pairs
  // never overlap between tests, so the suite remains idempotent
  // across reruns even if a previous run failed mid-test. The
  // `short_code` column is also unique, so we derive a per-fixture
  // value that satisfies `^[A-Za-z0-9_-]{10,32}$` and never collides
  // across fixtures.
  for (const fixture of args.trackingLinkFixtures) {
    await admin`
      INSERT INTO tracking_links (
        id,
        publisher_id,
        platform,
        destination_url,
        affiliate_url,
        campaign_id,
        offer_id,
        network_sub_id,
        short_code,
        status
      )
      VALUES (
        ${fixture.trackingLinkId}::uuid,
        ${PUBLISHER_ID}::uuid,
        'shopee',
        'https://shopee.vn/ci-20g2a-product',
        NULL,
        ${CAMPAIGN_ID},
        ${OFFER_ID},
        ${fixture.networkSubId},
        ${`ci20g2a-${fixture.networkSubId.slice(-4)}`},
        'active'
      )
    `;
  }
  // `shopee_csv_import_batches` real columns (drizzle/0018...):
  //   source_file_name, source_file_sha256, source_file_size_bytes,
  //   source_headers, parser_version, status, completed_at,
  //   total_rows, ...
  // `source_file_sha256` is constrained by
  // `shopee_csv_import_batches_source_file_sha256_check` to match
  // `^[a-f0-9]{64}$`, so the fixture must use a real 64-char hex.
  // `status` is constrained by
  // `shopee_csv_import_batches_status_check` to one of
  // ('pending', 'processing', 'completed', 'failed'). The
  // `completion_check` invariant requires `completed_at IS NOT NULL`
  // whenever status is 'completed' or 'failed', so a terminal batch
  // must carry a `completed_at` value.
  await admin`
    INSERT INTO shopee_csv_import_batches (
      id,
      source_file_name,
      source_file_sha256,
      source_file_size_bytes,
      source_headers,
      parser_version,
      status,
      completed_at,
      total_rows,
      inserted_rows,
      duplicate_rows,
      attributed_rows,
      unattributed_rows,
      awaiting_classification_rows,
      rejected_rows
    )
    VALUES (
      ${BATCH_ID}::uuid,
      'ci-20g2a-batch.csv',
      ${SOURCE_FILE_SHA256},
      1024,
      jsonb_build_array(
        'No.',
        'Order ID',
        'Checkout ID',
        'Item ID',
        'Model ID',
        'Quantity',
        'Order Value',
        'Total Product Commission',
        'Refunded Amount',
        'Linked Product Status'
      ),
      'ci-20g2a-parser-v1',
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
  `;
}

/**
 * Read the immutable Shopee source-line fields back from the database
 * and re-derive the deterministic source_conversion_key exactly as
 * `reduceShopeeCsvPromotion` will see them.
 *
 * Why this helper exists:
 *
 * `shopee_csv_rows.order_value`, `total_product_commission`, and
 * `refunded_amount` are typed `numeric(20, 5)`. PostgreSQL stores the
 * inputs in scale 5 -- `'100000.0'` is round-tripped as
 * `'100000.00000'`, `'0.0'` as `'0.00000'`, etc. The production
 * reducer hashes the textual form that comes back from the SELECT,
 * NOT the textual form the test originally wrote to the INSERT.
 *
 * Deriving the expected key from the in-memory `buildSourceLine(...)`
 * inputs (e.g. `'100000.0'`) yields a DIFFERENT hash than the
 * production reducer actually inserts. The only honest way to assert
 * `assert.equal(actual, expected)` is to derive the expected value
 * from the same stored fields the production reducer reads. This
 * helper does exactly that.
 *
 * Production parity:
 *
 * - Reads only the columns the production mapper exposes.
 * - Calls the same `deriveShopeeSourceConversionKey` pure module the
 *   production reducer calls.
 * - Returns the canonical 64-character lowercase hex digest that the
 *   test must now assert against.
 */
async function deriveShopeeSourceConversionKeyFromStoredRow(
  admin: postgres.Sql,
  stagedRowId: string,
): Promise<string> {
  const rows = await admin<
    {
      row_fingerprint_sha256: string;
      external_order_id: string;
      checkout_id: string;
      item_id: string;
      model_id: string;
      quantity: number;
      order_value: string;
      total_product_commission: string;
      refunded_amount: string;
      linked_product_status: string;
    }[]
  >`
    SELECT
      row_fingerprint_sha256,
      external_order_id,
      checkout_id,
      item_id,
      model_id,
      quantity,
      order_value::text AS order_value,
      total_product_commission::text AS total_product_commission,
      refunded_amount::text AS refunded_amount,
      linked_product_status
    FROM shopee_csv_rows
    WHERE id = ${stagedRowId}::uuid
  `;
  if (rows.length !== 1) {
    throw new Error(
      "deriveShopeeSourceConversionKeyFromStoredRow: expected exactly one staged row for " +
        stagedRowId +
        ", got " +
        rows.length,
    );
  }
  const row = rows[0]!;
  return deriveShopeeSourceConversionKey({
    network: SHOPEE_NETWORK_LABEL,
    sourceEventId: row.row_fingerprint_sha256,
    externalOrderId: row.external_order_id,
    checkoutId: row.checkout_id,
    itemId: row.item_id,
    modelId: row.model_id,
    quantity: row.quantity,
    orderValue: row.order_value,
    totalProductCommission: row.total_product_commission,
    refundedAmount: row.refunded_amount,
    linkedProductStatus: row.linked_product_status,
  });
}

async function bootstrapShopeeStagedRow(
  admin: postgres.Sql,
  args: {
    stagedRowId: string;
    rowFingerprintSha256: string;
    externalOrderId: string;
    totalProductCommission: string;
    refundedAmount: string;
    orderValue: string;
    quantity: number;
    trackingLinkId: string;
    networkSubId: string;
    /**
     * `source_row_number` for this staged row inside the shared
     * `BATCH_ID`. Distinct per row to satisfy
     * `shopee_csv_rows_batch_row_unique (batch_id, source_row_number)`.
     * Defaults to 2 -- the historic single-row position used by the
     * primary idempotent test -- and may be overridden (e.g. by the
     * `external_order_collision` test, which inserts two rows under
     * the same batch and needs `source_row_number` to differ between
     * them).
     */
    sourceRowNumber?: number;
  },
): Promise<void> {
  // `raw_row` is constrained by `shopee_csv_rows_raw_row_check` to
  // `jsonb_typeof(raw_row) = 'object'`, so the value must arrive at
  // the server as a JSONB object, not a JSON string. Using
  // `jsonb_build_object(...)` constructs the object inside the
  // database, side-stepping any client-side JSON-string
  // misinterpretation.
  //
  // Every parameter placeholder below carries an explicit SQL cast
  // (`::uuid`, `::text`, `::numeric`, `::integer`). postgres.js binds
  // JS strings / numbers with `inferType = 0` (unknown), and Postgres
  // then cannot resolve that against `jsonb_build_object(VARIADIC
  // "any")` -- it raises `could not determine data type of parameter
  // $N` at parse time. Explicit casts on the parameter slots close
  // the ambiguity without altering the column shape. The `raw_row`
  // JSONB object is preserved.
  await admin`
    INSERT INTO shopee_csv_rows (
      id,
      batch_id,
      source_row_number,
      row_fingerprint_sha256,
      raw_row,
      external_order_id,
      checkout_id,
      item_id,
      model_id,
      quantity,
      order_value,
      total_product_commission,
      refunded_amount,
      linked_product_status,
      processing_status,
      tracking_link_id,
      publisher_id,
      source_sub_id1
    )
    VALUES (
      ${args.stagedRowId}::uuid,
      ${BATCH_ID}::uuid,
      ${args.sourceRowNumber ?? 2}::integer,
      ${args.rowFingerprintSha256}::text,
      jsonb_build_object(
        'external_order_id', ${args.externalOrderId}::text,
        'checkout_id', ${CHECKOUT_ID}::text,
        'item_id', ${ITEM_ID}::text,
        'model_id', ${MODEL_ID}::text,
        'quantity', ${String(args.quantity)}::text,
        'order_value', ${args.orderValue}::text,
        'total_product_commission', ${args.totalProductCommission}::text,
        'refunded_amount', ${args.refundedAmount}::text,
        'linked_product_status', 'linked',
        'source_sub_id1', ${args.networkSubId}::text
      ),
      ${args.externalOrderId}::text,
      ${CHECKOUT_ID}::text,
      ${ITEM_ID}::text,
      ${MODEL_ID}::text,
      ${args.quantity}::integer,
      ${args.orderValue}::numeric,
      ${args.totalProductCommission}::numeric,
      ${args.refundedAmount}::numeric,
      'linked',
      'ready_for_conversion',
      ${args.trackingLinkId}::uuid,
      ${PUBLISHER_ID}::uuid,
      ${args.networkSubId}::text
    )
  `;
}

test(
  "Phase 20G.2a promotion is idempotent across replay and concurrent calls",
  { timeout: 60_000 },
  async () => {
    const databaseUrl = requireDatabaseUrl();
    // Dynamic import: shopee-conversion-promoter.repository transitively
    // imports src/db/client.ts, which throws at module-load time if
    // DATABASE_URL is missing. Pulling the import inside the test body
    // mirrors the affiliate-catalog integration test pattern and keeps
    // this suite loadable on machines without a live database.
    const { promoteShopeeCsvRowConversionAsync } = await import(
      "@/repositories/shopee-conversion-promoter.repository"
    );
    const admin = postgres(databaseUrl, {
      max: 4,
      prepare: false,
    });

    // `sourceKey` is the deterministic SHA-256 the production reducer
    // will compute -- and therefore insert into
    // `conversions.source_conversion_key` -- when it reads the staged
    // row back from the database. Because
    // `shopee_csv_rows.{order_value, total_product_commission,
    // refunded_amount}` are typed `numeric(20, 5)`, PostgreSQL stores
    // and round-trips those columns at scale 5 (e.g. `'100000.0'`
    // becomes `'100000.00000'`). Computing the key from the original
    // `buildSourceLine(...)` inputs would yield a different hash than
    // the production reducer inserts; re-reading the staged row from
    // the DB and feeding those round-tripped values into the same
    // `deriveShopeeSourceConversionKey` helper the reducer uses
    // produces an honest expected value.
    let sourceKey = "";

    try {
      await bootstrapCatalog(admin, {
        externalOrderIds: [EXTERNAL_ORDER_ID_PRIMARY],
        trackingLinkFixtures: [TRACKING_LINK_FIXTURES[0]!],
      });
      await bootstrapShopeeStagedRow(admin, {
        stagedRowId: STAGED_ROW_ID,
        rowFingerprintSha256: ROW_FINGERPRINT_A,
        externalOrderId: EXTERNAL_ORDER_ID_PRIMARY,
        orderValue: "100000.0",
        totalProductCommission: "5000.0",
        refundedAmount: "0.0",
        quantity: 1,
        trackingLinkId: TRACKING_LINK_ID_PRIMARY,
        networkSubId: NETWORK_SUB_ID_PRIMARY,
      });
      sourceKey =
        await deriveShopeeSourceConversionKeyFromStoredRow(
          admin,
          STAGED_ROW_ID,
        );

      // Single promote: must succeed and insert exactly one row each.
      const first = await promoteShopeeCsvRowConversionAsync({
        stagedRowId: STAGED_ROW_ID,
      });
      assert.equal(first.kind, "promoted");
      if (first.kind !== "promoted") throw new Error("unreachable");
      assert.equal(first.conversion.network, "shopee");
      assert.equal(
        first.conversion.externalOrderId,
        EXTERNAL_ORDER_ID_PRIMARY,
      );
      assert.equal(first.conversion.sourceConversionKey, sourceKey);
      assert.ok(first.conversion.ingestionEventId.length > 0);

      const conversionCountRows = await admin<
        { count: string }[]
      >`
        SELECT count(*)::text AS count
        FROM conversions
        WHERE network = 'shopee'
          AND source_conversion_key = ${sourceKey}
      `;
      assert.equal(conversionCountRows[0].count, "1");

      // The reducer writes ingestion source_event_id equal to the
      // staged row's row_fingerprint_sha256. Query by that exact
      // identity, not by BATCH_ID, to stay consistent with the
      // production design.
      const ingestionCountRows = await admin<
        { count: string }[]
      >`
        SELECT count(*)::text AS count
        FROM shopee_ingestion_events
        WHERE network = 'shopee'
          AND source_event_id = ${ROW_FINGERPRINT_A}
      `;
      assert.equal(ingestionCountRows[0].count, "1");

      // Replay: same staged row must return duplicate without inserting.
      const replay = await promoteShopeeCsvRowConversionAsync({
        stagedRowId: STAGED_ROW_ID,
      });
      assert.equal(replay.kind, "duplicate");

      const conversionAfterReplay = await admin<
        { count: string }[]
      >`
        SELECT count(*)::text AS count
        FROM conversions
        WHERE network = 'shopee'
          AND source_conversion_key = ${sourceKey}
      `;
      assert.equal(conversionAfterReplay[0].count, "1");

      const ingestionAfterReplay = await admin<
        { count: string }[]
      >`
        SELECT count(*)::text AS count
        FROM shopee_ingestion_events
        WHERE network = 'shopee'
          AND source_event_id = ${ROW_FINGERPRINT_A}
      `;
      assert.equal(ingestionAfterReplay[0].count, "1");

      // Concurrent promote: two parallel calls must serialize so the
      // database ends with exactly one canonical conversion row.
      const concurrent = await Promise.all([
        promoteShopeeCsvRowConversionAsync({
          stagedRowId: STAGED_ROW_ID,
        }),
        promoteShopeeCsvRowConversionAsync({
          stagedRowId: STAGED_ROW_ID,
        }),
      ]);
      for (const result of concurrent) {
        assert.ok(
          result.kind === "duplicate" || result.kind === "promoted",
          `unexpected concurrent result: ${result.kind}`,
        );
      }

      const conversionAfterConcurrent = await admin<
        { count: string }[]
      >`
        SELECT count(*)::text AS count
        FROM conversions
        WHERE network = 'shopee'
          AND source_conversion_key = ${sourceKey}
      `;
      assert.equal(conversionAfterConcurrent[0].count, "1");

      // Final invariants on the canonical conversion row.
      const finalRows = await admin<
        {
          source_conversion_key: string;
          validation_status: string;
          settlement_status: string;
          ingestion_event_id: string;
          status: string;
          network_commission: string;
          user_cashback: string;
          platform_profit: string;
        }[]
      >`
        SELECT
          source_conversion_key,
          validation_status,
          settlement_status,
          ingestion_event_id::text AS ingestion_event_id,
          status,
          network_commission::text AS network_commission,
          user_cashback::text AS user_cashback,
          platform_profit::text AS platform_profit
        FROM conversions
        WHERE network = 'shopee'
          AND source_conversion_key = ${sourceKey}
      `;
      assert.equal(finalRows.length, 1);
      const finalRow = finalRows[0];
      assert.equal(finalRow.source_conversion_key, sourceKey);
      assert.equal(finalRow.validation_status, "recorded");
      assert.equal(finalRow.settlement_status, "not_payable");
      assert.equal(finalRow.status, "pending");
      assert.equal(
        finalRow.ingestion_event_id,
        first.conversion.ingestionEventId,
      );
      // 6000 bps of 5000 = 3000; remainder = 2000. Strict integer
      // VND, no truncation.
      assert.equal(finalRow.network_commission, "5000");
      assert.equal(finalRow.user_cashback, "3000");
      assert.equal(finalRow.platform_profit, "2000");
    } finally {
      try {
        await cleanupShopeeFixtures(admin);
      } finally {
        await admin.end({ timeout: 1 });
      }
    }
  },
);

test(
  "Phase 20G.2a promotion returns external_order_collision on legacy network+external_order_id collision with distinct source_conversion_key",
  { timeout: 60_000 },
  async () => {
    const databaseUrl = requireDatabaseUrl();
    // Dynamic import: shopee-conversion-promoter.repository transitively
    // imports src/db/client.ts, which throws at module-load time if
    // DATABASE_URL is missing. Pulling the import inside the test body
    // mirrors the affiliate-catalog integration test pattern and keeps
    // this suite loadable on machines without a live database.
    const { promoteShopeeCsvRowConversionAsync } = await import(
      "@/repositories/shopee-conversion-promoter.repository"
    );
    const admin = postgres(databaseUrl, {
      max: 4,
      prepare: false,
    });

    // `sourceKeyA` and `sourceKeyB` are the deterministic SHA-256
    // values the production reducer would compute from each staged
    // row. We derive them via `deriveShopeeSourceConversionKeyFromStoredRow`
    // AFTER inserting each row, because
    // `shopee_csv_rows.{order_value, total_product_commission,
    // refunded_amount}` are `numeric(20, 5)` and PostgreSQL
    // round-trips them at scale 5 -- computing the keys from the
    // original in-memory inputs would yield a different hash than
    // the production reducer inserts.
    //
    // Note: this test deliberately inserts BOTH staged rows under
    // `BATCH_ID` but at distinct `source_row_number` values so the
    // `shopee_csv_rows_batch_row_unique (batch_id, source_row_number)`
    // constraint is satisfied. Reusing source_row_number=2 for both
    // is a constraint violation in the bootstrap step, NOT the
    // promotion step -- fixing it here is unrelated to the
    // promotion-side external_order_id collision the test exists
    // to verify.
    let sourceKeyA = "";
    let sourceKeyB = "";

    try {
      await bootstrapCatalog(admin, {
        externalOrderIds: [EXTERNAL_ORDER_ID_COLLISION],
        trackingLinkFixtures: [TRACKING_LINK_FIXTURES[1]!],
      });
      await bootstrapShopeeStagedRow(admin, {
        stagedRowId: STAGED_ROW_ID,
        rowFingerprintSha256: ROW_FINGERPRINT_A,
        externalOrderId: EXTERNAL_ORDER_ID_COLLISION,
        orderValue: "100000.0",
        totalProductCommission: "5000.0",
        refundedAmount: "0.0",
        quantity: 1,
        trackingLinkId: TRACKING_LINK_ID_COLLISION,
        networkSubId: NETWORK_SUB_ID_COLLISION,
        sourceRowNumber: 2,
      });
      await bootstrapShopeeStagedRow(admin, {
        stagedRowId: STAGED_ROW_ID_CONFLICT,
        rowFingerprintSha256: ROW_FINGERPRINT_B,
        externalOrderId: EXTERNAL_ORDER_ID_COLLISION,
        orderValue: "100000.0",
        totalProductCommission: "6000.0",
        refundedAmount: "0.0",
        quantity: 1,
        trackingLinkId: TRACKING_LINK_ID_COLLISION,
        networkSubId: NETWORK_SUB_ID_COLLISION,
        // Distinct source_row_number from STAGED_ROW_ID above so
        // `shopee_csv_rows_batch_row_unique` is satisfied for both
        // rows under shared BATCH_ID.
        sourceRowNumber: 3,
      });
      sourceKeyA =
        await deriveShopeeSourceConversionKeyFromStoredRow(
          admin,
          STAGED_ROW_ID,
        );
      sourceKeyB =
        await deriveShopeeSourceConversionKeyFromStoredRow(
          admin,
          STAGED_ROW_ID_CONFLICT,
        );

      assert.notEqual(
        sourceKeyA,
        sourceKeyB,
        "fixture invariant: two staged rows that share external_order_id but differ on another immutable field must yield distinct keys",
      );

      const first = await promoteShopeeCsvRowConversionAsync({
        stagedRowId: STAGED_ROW_ID,
      });
      assert.equal(first.kind, "promoted");
      if (first.kind !== "promoted") throw new Error("unreachable");
      assert.equal(first.conversion.sourceConversionKey, sourceKeyA);

      // Second staged row shares external_order_id but has its own
      // distinct source_conversion_key. The legacy unique constraint
      // (network, external_order_id) is still present and must not be
      // dropped in Phase 20G.2a, so the repository must surface this
      // as a typed skip result -- never as an unhandled PostgreSQL
      // error and never as a phantom "promoted".
      const second = await promoteShopeeCsvRowConversionAsync({
        stagedRowId: STAGED_ROW_ID_CONFLICT,
      });
      assert.equal(second.kind, "skip");
      if (second.kind !== "skip") throw new Error("unreachable");
      assert.equal(second.reason, "external_order_collision");
      assert.match(
        second.details,
        /network \+ external_order_id/,
        "skip details must mention the legacy network + external_order_id boundary so a future operator can identify the constraint without a code dive",
      );

      // Final DB state: exactly one canonical conversion row tied to
      // the shared external_order_id, regardless of how many staged
      // rows had that id. The collision row must NOT have been
      // promoted to a second conversion row.
      const finalCount = await admin<
        { count: string }[]
      >`
        SELECT count(*)::text AS count
        FROM conversions
        WHERE network = 'shopee'
          AND external_order_id = ${EXTERNAL_ORDER_ID_COLLISION}
      `;
      assert.equal(finalCount[0].count, "1");

      const finalRow = await admin<
        { source_conversion_key: string }[]
      >`
        SELECT source_conversion_key
        FROM conversions
        WHERE network = 'shopee'
          AND external_order_id = ${EXTERNAL_ORDER_ID_COLLISION}
      `;
      assert.equal(finalRow.length, 1);
      assert.equal(finalRow[0].source_conversion_key, sourceKeyA);
      assert.notEqual(
        finalRow[0].source_conversion_key,
        sourceKeyB,
        "the collision row must not have produced a second conversion row",
      );

      // No second ingestion event row tied to ROW_FINGERPRINT_B
      // either: the repository short-circuits before reaching the
      // ingestion insert.
      const ingestionForB = await admin<
        { count: string }[]
      >`
        SELECT count(*)::text AS count
        FROM shopee_ingestion_events
        WHERE network = 'shopee'
          AND source_event_id = ${ROW_FINGERPRINT_B}
      `;
      assert.equal(
        ingestionForB[0].count,
        "0",
        "the external_order_collision skip must not insert a second ingestion event row",
      );
    } finally {
      try {
        await cleanupShopeeFixtures(admin);
      } finally {
        await admin.end({ timeout: 1 });
      }
    }
  },
);
