import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// --- Profiles ----------------------------------------------------------------

export const profiles = pgTable("profiles", {
  userId: uuid("user_id").primaryKey(),

  fullName: text("full_name"),
  phone: text("phone"),
  avatarUrl: text("avatar_url"),

  memberTier: text("member_tier")
    .default("standard")
    .notNull(),

  preferredPlatforms: text("preferred_platforms")
    .array()
    .default(sql`'{}'::text[]`)
    .notNull(),

  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "date",
  })
    .defaultNow()
    .notNull(),

  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "date",
  })
    .defaultNow()
    .notNull(),
});

// --- Publisher payout accounts ----------------------------------------------

export const payoutAccounts = pgTable(
  "payout_accounts",
  {
    id: uuid("id")
      .defaultRandom()
      .primaryKey(),

    userId: uuid("user_id")
      .notNull()
      .unique("payout_accounts_user_id_unique")
      .references(() => profiles.userId, {
        onDelete: "cascade",
      }),

    method: text("method")
      .default("bank")
      .notNull(),

    provider: text("provider")
      .notNull(),

    accountName: text("account_name")
      .notNull(),

    accountNumber: text("account_number")
      .notNull(),

    status: text("status")
      .default("unverified")
      .notNull(),

    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "payout_accounts_method_check",
      sql`${table.method} = 'bank'`,
    ),

    check(
      "payout_accounts_status_check",
      sql`${table.status} in ('unverified', 'verified', 'rejected', 'disabled')`,
    ),
  ],
);

// --- Consumer cashback tracking links ---------------------------------------

export const trackingLinks = pgTable(
  "tracking_links",
  {
    id: uuid("id")
      .defaultRandom()
      .primaryKey(),

    publisherId: uuid("publisher_id")
      .notNull()
      .references(() => profiles.userId, {
        onDelete: "cascade",
      }),

    platform: text("platform")
      .notNull(),

    /**
     * Original product or merchant URL supplied by the customer.
     *
     * This URL is used as the source destination when generating an
     * affiliate URL, but it is not the final attribution redirect target.
     */
    destinationUrl: text("destination_url")
      .notNull(),

    /**
     * Network-generated affiliate URL for the same destination.
     *
     * The URL should contain the stable tracking-link attribution token
     * in Shopee Sub_id1. It remains nullable until affiliate-link
     * generation has completed successfully.
     */
    affiliateUrl: text("affiliate_url"),

    campaignId: text("campaign_id"),

    offerId: text("offer_id"),

    /**
     * Stable network attribution token owned by this tracking link.
     *
     * Shopee convention:
     * - Sub_id1 = networkSubId
     * - Sub IDs accept ASCII letters and digits only
     * - Sub_id2 may later contain a click-specific token
     */
    networkSubId: text("network_sub_id")
      .notNull(),

    shortCode: text("short_code")
      .notNull(),

    status: text("status")
      .default("active")
      .notNull(),

    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("tracking_links_short_code_unique").on(
      table.shortCode,
    ),

    unique("tracking_links_network_sub_id_unique").on(
      table.networkSubId,
    ),

    unique("tracking_links_id_publisher_unique").on(
      table.id,
      table.publisherId,
    ),

    index("tracking_links_publisher_created_at_idx").on(
      table.publisherId,
      table.createdAt,
    ),

    check(
      "tracking_links_platform_check",
      sql`${table.platform} in ('shopee', 'tiktok')`,
    ),

    check(
      "tracking_links_destination_url_https_check",
      sql`${table.destinationUrl} ~ '^https://'`,
    ),

    check(
      "tracking_links_affiliate_url_https_check",
      sql`
        ${table.affiliateUrl} is null
        or ${table.affiliateUrl} ~ '^https://'
      `,
    ),

    check(
      "tracking_links_network_sub_id_check",
      sql`
        ${table.networkSubId}
        ~ '^vaflnk[a-f0-9]{24}$'
      `,
    ),

    check(
      "tracking_links_campaign_id_not_blank_check",
      sql`char_length(trim(${table.campaignId})) > 0`,
    ),

    check(
      "tracking_links_offer_id_not_blank_check",
      sql`char_length(trim(${table.offerId})) > 0`,
    ),

    check(
      "tracking_links_classification_pair_check",
      sql`
        (
          ${table.campaignId} is null
          and ${table.offerId} is null
        )
        or
        (
          ${table.campaignId} is not null
          and ${table.offerId} is not null
        )
      `,
    ),

    check(
      "tracking_links_short_code_check",
      sql`${table.shortCode} ~ '^[A-Za-z0-9_-]{10,32}$'`,
    ),

    check(
      "tracking_links_status_check",
      sql`${table.status} in ('active', 'paused', 'disabled')`,
    ),
  ],
);

// --- Consumer cashback clicks ------------------------------------------------

export const clicks = pgTable(
  "clicks",
  {
    id: uuid("id")
      .defaultRandom()
      .primaryKey(),

    trackingLinkId: uuid("tracking_link_id")
      .notNull(),

    publisherId: uuid("publisher_id")
      .notNull()
      .references(() => profiles.userId, {
        onDelete: "cascade",
      }),

    /**
     * Unique identifier for this individual click.
     *
     * This is separate from trackingLinks.networkSubId. It may later be
     * passed to an affiliate network through Sub_id2 when supported.
     */
    clickToken: text("click_token")
      .notNull(),

    referrer: text("referrer"),
    userAgentHash: text("user_agent_hash"),
    ipHash: text("ip_hash"),
    fingerprintHash: text("fingerprint_hash"),

    isUnique: boolean("is_unique")
      .default(true)
      .notNull(),

    clickedAt: timestamp("clicked_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [
        table.trackingLinkId,
        table.publisherId,
      ],
      foreignColumns: [
        trackingLinks.id,
        trackingLinks.publisherId,
      ],
      name: "clicks_tracking_link_publisher_fk",
    }).onDelete("cascade"),

    unique("clicks_click_token_unique").on(
      table.clickToken,
    ),

    index("clicks_publisher_clicked_at_idx").on(
      table.publisherId,
      table.clickedAt,
    ),

    index("clicks_tracking_link_clicked_at_idx").on(
      table.trackingLinkId,
      table.clickedAt,
    ),

    index("clicks_fingerprint_clicked_at_idx").on(
      table.fingerprintHash,
      table.clickedAt,
    ),

    check(
      "clicks_click_token_not_blank_check",
      sql`char_length(trim(${table.clickToken})) > 0`,
    ),

    check(
      "clicks_user_agent_hash_check",
      sql`${table.userAgentHash} is null or ${table.userAgentHash} ~ '^[a-f0-9]{64}$'`,
    ),

    check(
      "clicks_ip_hash_check",
      sql`${table.ipHash} is null or ${table.ipHash} ~ '^[a-f0-9]{64}$'`,
    ),

    check(
      "clicks_fingerprint_hash_check",
      sql`${table.fingerprintHash} is null or ${table.fingerprintHash} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
);

// --- Shopee CSV import staging ------------------------------------------------

export const shopeeCsvImportBatches = pgTable(
  "shopee_csv_import_batches",
  {
    id: uuid("id")
      .defaultRandom()
      .primaryKey(),

    sourceFileName: text("source_file_name")
      .notNull(),

    /**
     * SHA-256 of the original file bytes.
     *
     * This is the file-level idempotency boundary. The same official report
     * cannot be imported twice as a separate batch.
     */
    sourceFileSha256: text("source_file_sha256")
      .notNull(),

    sourceFileSizeBytes: bigint("source_file_size_bytes", {
      mode: "number",
    })
      .notNull(),

    /**
     * Original Shopee headers in their received order.
     *
     * The parser must retain exact official header spellings, including any
     * spelling inconsistencies present in the exported report.
     */
    sourceHeaders: jsonb("source_headers")
      .$type<string[]>()
      .notNull(),

    parserVersion: text("parser_version")
      .notNull(),

    /**
     * Report source identifier.
     *
     * - manual_csv        : a human-uploaded CSV file (Phase 20G.1 baseline)
     * - addlivetag_api    : Addlivetag REST API adapter (Phase 20H.8)
     * - official_shopee_api: reserved for a future direct Shopee API adapter
     *
     * Defaults to `manual_csv` to preserve historical CSV row identity.
     */
    source: text("source")
      .notNull()
      .default("manual_csv"),

    status: text("status")
      .default("pending")
      .notNull(),

    totalRows: integer("total_rows")
      .default(0)
      .notNull(),

    insertedRows: integer("inserted_rows")
      .default(0)
      .notNull(),

    duplicateRows: integer("duplicate_rows")
      .default(0)
      .notNull(),

    attributedRows: integer("attributed_rows")
      .default(0)
      .notNull(),

    unattributedRows: integer("unattributed_rows")
      .default(0)
      .notNull(),

    awaitingClassificationRows: integer(
      "awaiting_classification_rows",
    )
      .default(0)
      .notNull(),

    rejectedRows: integer("rejected_rows")
      .default(0)
      .notNull(),

    errorMessage: text("error_message"),

    startedAt: timestamp("started_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),

    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),

    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique(
      "shopee_csv_import_batches_source_file_sha256_unique",
    ).on(
      table.sourceFileSha256,
    ),

    index(
      "shopee_csv_import_batches_status_created_at_idx",
    ).on(
      table.status,
      table.createdAt,
    ),

    check(
      "shopee_csv_import_batches_source_file_name_check",
      sql`char_length(trim(${table.sourceFileName})) > 0`,
    ),

    check(
      "shopee_csv_import_batches_source_file_sha256_check",
      sql`${table.sourceFileSha256} ~ '^[a-f0-9]{64}$'`,
    ),

    check(
      "shopee_csv_import_batches_source_file_size_check",
      sql`${table.sourceFileSizeBytes} >= 0`,
    ),

    check(
      "shopee_csv_import_batches_source_headers_check",
      sql`jsonb_typeof(${table.sourceHeaders}) = 'array'`,
    ),

    check(
      "shopee_csv_import_batches_parser_version_check",
      sql`char_length(trim(${table.parserVersion})) > 0`,
    ),

    check(
      "shopee_csv_import_batches_status_check",
      sql`${table.status} in (
        'pending',
        'processing',
        'completed',
        'failed'
      )`,
    ),

    check(
      "shopee_csv_import_batches_row_counts_check",
      sql`
        ${table.totalRows} >= 0
        and ${table.insertedRows} >= 0
        and ${table.duplicateRows} >= 0
        and ${table.attributedRows} >= 0
        and ${table.unattributedRows} >= 0
        and ${table.awaitingClassificationRows} >= 0
        and ${table.rejectedRows} >= 0
      `,
    ),

    check(
      "shopee_csv_import_batches_completion_check",
      sql`
        (
          ${table.status} in ('completed', 'failed')
          and ${table.completedAt} is not null
        )
        or
        (
          ${table.status} in ('pending', 'processing')
          and ${table.completedAt} is null
        )
      `,
    ),

    check(
      "shopee_csv_import_batches_error_check",
      sql`
        (
          ${table.status} = 'failed'
          and nullif(trim(${table.errorMessage}), '') is not null
        )
        or
        (
          ${table.status} <> 'failed'
          and ${table.errorMessage} is null
        )
      `,
    ),

    /**
     * Phase 20H.8 -- allowed batch source values. The forward-compatible
     * 'official_shopee_api' value is reserved for a later adapter.
     */
    check(
      "shopee_csv_import_batches_source_check",
      sql`${table.source} in (
        'manual_csv',
        'addlivetag_api',
        'official_shopee_api'
      )`,
    ),

    index("shopee_csv_import_batches_source_created_at_idx").on(
      table.source,
      table.createdAt,
    ),
  ],
);

export const shopeeCsvRows = pgTable(
  "shopee_csv_rows",
  {
    id: uuid("id")
      .defaultRandom()
      .primaryKey(),

    batchId: uuid("batch_id")
      .notNull()
      .references(
        () => shopeeCsvImportBatches.id,
        {
          onDelete: "cascade",
        },
      ),

    /**
     * Report source that produced this row. Mirrors
     * `shopee_csv_import_batches.source` so the source is queryable
     * per row and not only per batch.
     */
    source: text("source")
      .notNull()
      .default("manual_csv"),

    /**
     * Physical row number in the original CSV file.
     *
     * The header is row 1, so imported data starts at row 2.
     */
    sourceRowNumber: integer("source_row_number")
      .notNull(),

    /**
     * SHA-256 of the canonical complete source row.
     *
     * This prevents the same row snapshot from being inserted again,
     * including when it appears in an overlapping Shopee report.
     */
    rowFingerprintSha256: text(
      "row_fingerprint_sha256",
    )
      .notNull(),

    /**
     * Exact source values keyed by the original official Shopee headers.
     */
    rawRow: jsonb("raw_row")
      .$type<Record<string, string>>()
      .notNull(),

    externalOrderId: text("external_order_id"),

    checkoutId: text("checkout_id"),

    orderStatus: text("order_status"),

    orderedAt: timestamp("ordered_at", {
      withTimezone: true,
      mode: "date",
    }),

    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),

    clickedAt: timestamp("clicked_at", {
      withTimezone: true,
      mode: "date",
    }),

    shopId: text("shop_id"),

    itemId: text("item_id"),

    modelId: text("model_id"),

    promotionId: text("promotion_id"),

    quantity: integer("quantity"),

    /**
     * Source money remains exact decimal VND.
     *
     * Conversion into the integer-VND ledger must happen only during
     * promotion into conversions and must never silently round.
     */
    orderValue: numeric("order_value", {
      precision: 20,
      scale: 5,
    }),

    refundedAmount: numeric("refunded_amount", {
      precision: 20,
      scale: 5,
    }),

    totalProductCommission: numeric(
      "total_product_commission",
      {
        precision: 20,
        scale: 5,
      },
    ),

    totalOrderCommission: numeric(
      "total_order_commission",
      {
        precision: 20,
        scale: 5,
      },
    ),

    netAffiliateCommission: numeric(
      "net_affiliate_commission",
      {
        precision: 20,
        scale: 5,
      },
    ),

    linkedProductStatus: text(
      "linked_product_status",
    ),

    sourceSubId1: text("source_sub_id1"),

    sourceSubId2: text("source_sub_id2"),

    sourceSubId3: text("source_sub_id3"),

    sourceSubId4: text("source_sub_id4"),

    sourceSubId5: text("source_sub_id5"),

    channel: text("channel"),

    /**
     * Processing lifecycle:
     *
     * - pending: parsed but not evaluated
     * - unattributed: Sub_id1 is blank or has no exact tracking-link match
     * - awaiting_classification: tracking link matched but lacks catalog IDs
     * - ready_for_conversion: attribution and classification are complete
     * - rejected: malformed or unsupported source row
     */
    processingStatus: text("processing_status")
      .default("pending")
      .notNull(),

    trackingLinkId: uuid("tracking_link_id"),

    publisherId: uuid("publisher_id"),

    rejectionReason: text("rejection_reason"),

    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique(
      "shopee_csv_rows_batch_row_unique",
    ).on(
      table.batchId,
      table.sourceRowNumber,
    ),

    unique(
      "shopee_csv_rows_fingerprint_unique",
    ).on(
      table.rowFingerprintSha256,
    ),

    foreignKey({
      columns: [
        table.trackingLinkId,
        table.publisherId,
      ],
      foreignColumns: [
        trackingLinks.id,
        trackingLinks.publisherId,
      ],
      name: "shopee_csv_rows_tracking_owner_fk",
    }).onDelete("set null"),

    index("shopee_csv_rows_batch_idx").on(
      table.batchId,
    ),

    index("shopee_csv_rows_order_idx").on(
      table.externalOrderId,
    ),

    index("shopee_csv_rows_sub_id1_idx").on(
      table.sourceSubId1,
    ),

    index("shopee_csv_rows_status_idx").on(
      table.processingStatus,
    ),

    check(
      "shopee_csv_rows_source_row_check",
      sql`${table.sourceRowNumber} >= 2`,
    ),

    check(
      "shopee_csv_rows_fingerprint_check",
      sql`${table.rowFingerprintSha256} ~ '^[a-f0-9]{64}$'`,
    ),

    check(
      "shopee_csv_rows_raw_row_check",
      sql`jsonb_typeof(${table.rawRow}) = 'object'`,
    ),

    check(
      "shopee_csv_rows_quantity_check",
      sql`
        ${table.quantity} is null
        or ${table.quantity} >= 0
      `,
    ),

    check(
      "shopee_csv_rows_processing_status_check",
      sql`${table.processingStatus} in (
        'pending',
        'unattributed',
        'awaiting_classification',
        'ready_for_conversion',
        'rejected'
      )`,
    ),

    check(
      "shopee_csv_rows_attribution_pair_check",
      sql`
        (
          ${table.trackingLinkId} is null
          and ${table.publisherId} is null
        )
        or
        (
          ${table.trackingLinkId} is not null
          and ${table.publisherId} is not null
        )
      `,
    ),

    check(
      "shopee_csv_rows_status_attribution_check",
      sql`
        (
          ${table.processingStatus} in (
            'awaiting_classification',
            'ready_for_conversion'
          )
          and ${table.sourceSubId1} is not null
          and ${table.trackingLinkId} is not null
          and ${table.publisherId} is not null
        )
        or
        (
          ${table.processingStatus} in (
            'pending',
            'unattributed',
            'rejected'
          )
          and ${table.trackingLinkId} is null
          and ${table.publisherId} is null
        )
      `,
    ),

    check(
      "shopee_csv_rows_rejection_check",
      sql`
        (
          ${table.processingStatus} = 'rejected'
          and nullif(
            trim(${table.rejectionReason}),
            ''
          ) is not null
        )
        or
        (
          ${table.processingStatus} <> 'rejected'
          and ${table.rejectionReason} is null
        )
      `,
    ),

    /**
     * Phase 20H.8 -- allowed row source values. Mirrors the
     * `shopee_csv_import_batches_source_check` constraint.
     */
    check(
      "shopee_csv_rows_source_check",
      sql`${table.source} in (
        'manual_csv',
        'addlivetag_api',
        'official_shopee_api'
      )`,
    ),

    index("shopee_csv_rows_source_idx").on(table.source),
  ],
);
// ----------------------------------------------------------------------------
// Shopee ingestion events (Phase 20G.2a)
//
// Immutable event surface for Shopee CSV ingestion. Each successful promotion
// of a staged shopee_csv_rows row creates one shopee_ingestion_events row,
// which the canonical conversions row references through
// ingestion_event_id. Rows are append-only; status transitions update the
// same row in place. RLS is enabled and only the service role may write.
// ----------------------------------------------------------------------------

export const shopeeIngestionEvents = pgTable(
  "shopee_ingestion_events",
  {
    id: uuid("id")
      .defaultRandom()
      .primaryKey(),

    /**
     * Affiliate network. Phase 20G.2a is Shopee-only; this column is left
     * text for forward compatibility without inventing TikTok Shop rows.
     */
    network: text("network")
      .notNull(),

    /**
     * Network-supplied or derived source event identifier.
     */
    sourceEventId: text("source_event_id")
      .notNull(),

    /**
     * SHA-256 of the canonical immutable payload that produced the event.
     */
    payloadSha256: text("payload_sha256")
      .notNull(),

    receivedAt: timestamp("received_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),

    processingStatus: text("processing_status")
      .default("pending")
      .notNull(),

    attemptCount: integer("attempt_count")
      .default(1)
      .notNull(),

    processedAt: timestamp("processed_at", {
      withTimezone: true,
      mode: "date",
    }),

    failureCode: text("failure_code"),

    failureMessage: text("failure_message"),

    /**
     * Structured reference to the staged rows / batch the event covers.
     */
    rawReference: jsonb("raw_reference")
      .$type<Record<string, unknown>>()
      .notNull(),

    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("shopee_ingestion_events_network_source_event_unique").on(
      table.network,
      table.sourceEventId,
    ),

    check(
      "shopee_ingestion_events_network_not_blank_check",
      sql`char_length(trim(${table.network})) > 0`,
    ),

    check(
      "shopee_ingestion_events_source_event_id_not_blank_check",
      sql`char_length(trim(${table.sourceEventId})) > 0`,
    ),

    check(
      "shopee_ingestion_events_payload_sha256_check",
      sql`${table.payloadSha256} ~ '^[a-f0-9]{64}$'`,
    ),

    check(
      "shopee_ingestion_events_processing_status_check",
      sql`${table.processingStatus} in (
        'pending',
        'succeeded',
        'failed',
        'replayed'
      )`,
    ),

    check(
      "shopee_ingestion_events_attempt_count_check",
      sql`${table.attemptCount} >= 1`,
    ),

    check(
      "shopee_ingestion_events_raw_reference_check",
      sql`jsonb_typeof(${table.rawReference}) = 'object'`,
    ),

    check(
      "shopee_ingestion_events_processed_at_check",
      sql`
        (
          ${table.processingStatus} in ('succeeded', 'failed', 'replayed')
          and ${table.processedAt} is not null
        )
        or
        (
          ${table.processingStatus} = 'pending'
          and ${table.processedAt} is null
        )
      `,
    ),

    check(
      "shopee_ingestion_events_failure_code_check",
      sql`
        (
          ${table.processingStatus} = 'failed'
          and nullif(trim(${table.failureCode}), '') is not null
          and nullif(trim(${table.failureMessage}), '') is not null
        )
        or
        (
          ${table.processingStatus} <> 'failed'
          and ${table.failureCode} is null
          and ${table.failureMessage} is null
        )
      `,
    ),
  ],
).enableRLS();


// --- Conversion ledger ------------------------------------------------------

export const conversions = pgTable(
  "conversions",
  {
    id: uuid("id")
      .defaultRandom()
      .primaryKey(),

    /**
     * Affiliate network that supplied the order.
     *
     * Examples:
     * - shopee
     * - tiktok
     * - manual
     */
    network: text("network")
      .notNull(),

    /**
     * Order identifier supplied by the affiliate network.
     *
     * The combination of network + externalOrderId is unique and acts as
     * the idempotency boundary for conversion ingestion.
     */
    externalOrderId: text("external_order_id")
      .notNull(),

    /**
     * Publisher that owns this conversion.
     *
     * This is the ownership column used by Row Level Security.
     */
    publisherId: uuid("publisher_id")
      .notNull()
      .references(() => profiles.userId, {
        onDelete: "restrict",
      }),

    /**
     * Catalog identifiers remain text in Phase 20E because advertisers,
     * campaigns, offers, and legacy tracking links may still use text IDs.
     */
    advertiserId: text("advertiser_id")
      .notNull(),

    campaignId: text("campaign_id")
      .notNull(),

    offerId: text("offer_id")
      .notNull(),

    /**
     * Remains text while legacy conversion rows still contain identifiers
     * such as trk-001, trk-002, and trk-003.
     */
    trackingLinkId: text("tracking_link_id")
      .notNull(),

    status: text("status")
      .default("pending")
      .notNull(),

    /**
     * All monetary values are stored as integer VND amounts.
     *
     * No formatted currency strings or decimal values are stored.
     */
    orderAmount: bigint("order_amount", {
      mode: "number",
    })
      .notNull(),

    networkCommission: bigint("network_commission", {
      mode: "number",
    })
      .notNull(),

    /** Immutable cashback policy applied when this conversion was created. */
    cashbackShareBpsSnapshot: integer("cashback_share_bps_snapshot"),

    userCashback: bigint("user_cashback", {
      mode: "number",
    })
      .notNull(),

    platformProfit: bigint("platform_profit", {
      mode: "number",
    })
      .notNull(),

    occurredAt: timestamp("occurred_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull(),

    approvedAt: timestamp("approved_at", {
      withTimezone: true,
      mode: "date",
    }),

    payableAt: timestamp("payable_at", {
      withTimezone: true,
      mode: "date",
    }),

    paidAt: timestamp("paid_at", {
      withTimezone: true,
      mode: "date",
    }),

    rejectedAt: timestamp("rejected_at", {
      withTimezone: true,
      mode: "date",
    }),

    rejectedReason: text("rejected_reason"),

    /**
     * Phase 20G.2a: deterministic line-level idempotency key for Shopee
     * CSV ingestion. Nullable so legacy rows and non-Shopee networks
     * remain valid. The partial unique index only enforces uniqueness
     * when the key is present.
     */
    sourceConversionKey: text("source_conversion_key"),

    /**
     * Phase 20G.2a: validation lifecycle for the conversion. Nullable
     * on legacy rows. Allowed values: 'recorded', 'reconciling',
     * 'approved', 'rejected', 'reversed'.
     */
    validationStatus: text("validation_status"),

    /**
     * Phase 20G.2a: settlement lifecycle for the conversion. Nullable
     * on legacy rows. Allowed values: 'not_payable', 'payable', 'paid'.
     */
    settlementStatus: text("settlement_status"),

    /**
     * Phase 20G.2a: link back to the immutable shopee_ingestion_events
     * row that produced this conversion. Nullable on legacy rows.
     * ON DELETE RESTRICT because ingestion evidence must outlive any
     * downstream conversion row.
     */
    ingestionEventId: uuid("ingestion_event_id"),

    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    /**
     * Prevent duplicate ingestion of the same network order.
     *
     * This constraint remains unchanged during the attribution migration.
     * Line-level Shopee idempotency will be introduced in the CSV phase.
     */
    unique("conversions_network_external_order_unique").on(
      table.network,
      table.externalOrderId,
    ),

    /**
     * Supports publisher conversion history ordered by occurrence time.
     */
    index("conversions_publisher_occurred_at_idx").on(
      table.publisherId,
      table.occurredAt,
    ),

    /**
     * Phase 20G.2a: line-level idempotency for normalized Shopee
     * promotion. Partial UNIQUE keeps legacy rows with NULL
     * source_conversion_key from blocking the constraint.
     */
    uniqueIndex("conversions_network_source_conversion_key_unique").on(
      table.network,
      table.sourceConversionKey,
    ).where(sql`${table.sourceConversionKey} is not null`),

    /**
     * Phase 20G.2a: lookup support for ingestion-event linkage.
     */
    index("conversions_ingestion_event_id_idx").on(
      table.ingestionEventId,
    ),

    /**
     * Phase 20G.2a: ingestion-event linkage. ON DELETE RESTRICT because
     * immutable ingestion evidence must persist with the conversions it
     * created.
     */
    foreignKey({
      columns: [table.ingestionEventId],
      foreignColumns: [shopeeIngestionEvents.id],
      name: "conversions_ingestion_event_id_shopee_ingestion_events_id_fk",
    }).onDelete("restrict"),

    check(
      "conversions_network_not_blank_check",
      sql`char_length(trim(${table.network})) > 0`,
    ),

    check(
      "conversions_external_order_id_not_blank_check",
      sql`char_length(trim(${table.externalOrderId})) > 0`,
    ),

    check(
      "conversions_advertiser_id_not_blank_check",
      sql`char_length(trim(${table.advertiserId})) > 0`,
    ),

    check(
      "conversions_campaign_id_not_blank_check",
      sql`char_length(trim(${table.campaignId})) > 0`,
    ),

    check(
      "conversions_offer_id_not_blank_check",
      sql`char_length(trim(${table.offerId})) > 0`,
    ),

    check(
      "conversions_tracking_link_id_not_blank_check",
      sql`char_length(trim(${table.trackingLinkId})) > 0`,
    ),

    check(
      "conversions_status_check",
      sql`${table.status} in (
        'pending',
        'approved',
        'rejected',
        'payable',
        'paid'
      )`,
    ),

    check(
      "conversions_order_amount_non_negative_check",
      sql`${table.orderAmount} >= 0`,
    ),

    check(
      "conversions_network_commission_non_negative_check",
      sql`${table.networkCommission} >= 0`,
    ),

    check(
      "conversions_user_cashback_non_negative_check",
      sql`${table.userCashback} >= 0`,
    ),

    check(
      "conversions_platform_profit_non_negative_check",
      sql`${table.platformProfit} >= 0`,
    ),

    /**
     * Financial allocation invariant:
     *
     * network commission = publisher cashback + platform profit
     */
    check(
      "conversions_commission_allocation_check",
      sql`${table.networkCommission} = ${table.userCashback} + ${table.platformProfit}`,
    ),

    check(
      "conversions_cashback_share_bps_snapshot_range_check",
      sql`${table.cashbackShareBpsSnapshot} is null or ${table.cashbackShareBpsSnapshot} between 0 and 10000`,
    ),

    check(
      "conversions_cashback_policy_allocation_check",
      sql`${table.cashbackShareBpsSnapshot} is null or ${table.userCashback} = floor(${table.networkCommission}::numeric * ${table.cashbackShareBpsSnapshot} / 10000)::bigint`,
    ),

    /**
     * A rejected conversion must contain both rejection timestamp and reason.
     * Non-rejected conversions must not contain rejection metadata.
     */
    check(
      "conversions_rejection_metadata_check",
      sql`
        (
          ${table.status} = 'rejected'
          and ${table.rejectedAt} is not null
          and nullif(trim(${table.rejectedReason}), '') is not null
        )
        or
        (
          ${table.status} <> 'rejected'
          and ${table.rejectedAt} is null
          and ${table.rejectedReason} is null
        )
      `,
    ),

    /**
     * Status timestamps must exist once the conversion reaches the
     * corresponding lifecycle stage.
     */
    check(
      "conversions_approved_at_check",
      sql`
        (
          ${table.status} in ('approved', 'payable', 'paid')
          and ${table.approvedAt} is not null
        )
        or
        (
          ${table.status} in ('pending', 'rejected')
          and ${table.approvedAt} is null
        )
      `,
    ),

    check(
      "conversions_payable_at_check",
      sql`
        (
          ${table.status} in ('payable', 'paid')
          and ${table.payableAt} is not null
        )
        or
        (
          ${table.status} in ('pending', 'approved', 'rejected')
          and ${table.payableAt} is null
        )
      `,
    ),

    check(
      "conversions_paid_at_check",
      sql`
        (
          ${table.status} = 'paid'
          and ${table.paidAt} is not null
        )
        or
        (
          ${table.status} <> 'paid'
          and ${table.paidAt} is null
        )
      `,
    ),

    /**
     * Lifecycle timestamps cannot occur before the conversion itself.
     */
    check(
      "conversions_lifecycle_timestamp_order_check",
      sql`
        (${table.approvedAt} is null or ${table.approvedAt} >= ${table.occurredAt})
        and
        (
          ${table.payableAt} is null
          or (
            ${table.approvedAt} is not null
            and ${table.payableAt} >= ${table.approvedAt}
          )
        )
        and
        (
          ${table.paidAt} is null
          or (
            ${table.payableAt} is not null
            and ${table.paidAt} >= ${table.payableAt}
          )
        )
        and
        (
          ${table.rejectedAt} is null
          or ${table.rejectedAt} >= ${table.occurredAt}
        )
      `,
    ),

    /**
     * Phase 20G.2a: validation_status domain. Either NULL (legacy rows
     * and non-Shopee networks) or one of the canonical Shopee
     * reconciliation states.
     */
    check(
      "conversions_validation_status_check",
      sql`${table.validationStatus} is null or ${table.validationStatus} in (
        'recorded',
        'reconciling',
        'approved',
        'rejected',
        'reversed'
      )`,
    ),

    /**
     * Phase 20G.2a: settlement_status domain. Either NULL (legacy rows
     * and non-Shopee networks) or one of the canonical Shopee
     * settlement states.
     */
    check(
      "conversions_settlement_status_check",
      sql`${table.settlementStatus} is null or ${table.settlementStatus} in (
        'not_payable',
        'payable',
        'paid'
      )`,
    ),

    /**
     * Phase 20G.2a: source_conversion_key is set only when the
     * conversion was promoted through a normalized Shopee event and is
     * shaped as a SHA-256 hex digest.
     */
    check(
      "conversions_source_conversion_key_shape_check",
      sql`${table.sourceConversionKey} is null or ${table.sourceConversionKey} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
);

// --- Affiliate catalog ------------------------------------------------------

export const advertisers = pgTable(
  "advertisers",
  {
    id: text("id").primaryKey(),

    name: text("name").notNull(),

    /**
     * Affiliate platform the advertiser belongs to.
     *
     * Tracking-link and conversion catalog identifiers are text today, so
     * the catalog must use the same text ids and remain compatible with
     * existing rows in tracking_links and conversions.
     */
    platform: text("platform").notNull(),

    status: text("status")
      .default("active")
      .notNull(),

    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "advertisers_platform_check",
      sql`${table.platform} in ('shopee', 'tiktok')`,
    ),

    check(
      "advertisers_status_check",
      sql`${table.status} in ('active', 'disabled')`,
    ),

    check(
      "advertisers_id_not_blank_check",
      sql`char_length(trim(${table.id})) > 0`,
    ),

    check(
      "advertisers_name_not_blank_check",
      sql`char_length(trim(${table.name})) > 0`,
    ),
  ],
).enableRLS();

export const campaigns = pgTable(
  "campaigns",
  {
    id: text("id").primaryKey(),

    advertiserId: text("advertiser_id")
      .notNull()
      .references(() => advertisers.id, {
        onDelete: "restrict",
      }),

    name: text("name").notNull(),

    status: text("status")
      .default("active")
      .notNull(),

    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("campaigns_advertiser_idx").on(
      table.advertiserId,
    ),

    check(
      "campaigns_id_not_blank_check",
      sql`char_length(trim(${table.id})) > 0`,
    ),

    check(
      "campaigns_name_not_blank_check",
      sql`char_length(trim(${table.name})) > 0`,
    ),

    check(
      "campaigns_status_check",
      sql`${table.status} in ('active', 'paused', 'disabled')`,
    ),
  ],
).enableRLS();

export const offers = pgTable(
  "offers",
  {
    id: text("id").primaryKey(),

    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, {
        onDelete: "restrict",
      }),

    name: text("name").notNull(),

    status: text("status")
      .default("active")
      .notNull(),

    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("offers_campaign_idx").on(
      table.campaignId,
    ),

    check(
      "offers_id_not_blank_check",
      sql`char_length(trim(${table.id})) > 0`,
    ),

    check(
      "offers_name_not_blank_check",
      sql`char_length(trim(${table.name})) > 0`,
    ),

    check(
      "offers_status_check",
      sql`${table.status} in ('active', 'paused', 'disabled')`,
    ),
  ],
).enableRLS();

export const cashbackPolicies = pgTable(
  "cashback_policies",
  {
    offerId: text("offer_id")
      .primaryKey()
      .references(() => offers.id, {
        onDelete: "cascade",
      }),

    /**
     * Share of the network commission that is paid out as user cashback,
     * expressed in basis points where 10000 == 100%.
     *
     * The remaining share is retained as platform profit.
     */
    cashbackShareBps: integer("cashback_share_bps")
      .notNull(),

    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "cashback_policies_share_bps_range_check",
      sql`${table.cashbackShareBps} between 0 and 10000`,
    ),
  ],
).enableRLS();

// --- Shopee buyer purchase intent (Phase 20H.3b) -----------------------------
//
// One durable first-party record of a buyer's intent to start a Shopee
// cashback handoff. Written by `initiateShopeePurchaseAction` BEFORE the
// action returns `/go/<shortCode>` so the redirect is always backed by
// an audit anchor Vaffiliate owns.
//
// Distinct from `tracking_links` (the affiliate-link record) and `clicks`
// (the post-redirect audit row). This table only ever stores
// server-derived data; nothing client-trusted lives here.

export const shopeePurchaseIntents = pgTable(
  "shopee_purchase_intents",
  {
    id: uuid("id")
      .defaultRandom()
      .primaryKey(),

    publisherId: uuid("publisher_id")
      .notNull()
      .references(() => profiles.userId, {
        onDelete: "cascade",
      }),

    trackingLinkId: uuid("tracking_link_id")
      .notNull()
      .references(() => trackingLinks.id, {
        onDelete: "restrict",
      }),

    networkSubId: text("network_sub_id").notNull(),
    shortCode: text("short_code").notNull(),

    originalProductUrl: text("original_product_url").notNull(),
    canonicalProductUrl: text("canonical_product_url").notNull(),
    shopId: text("shop_id").notNull(),
    itemId: text("item_id").notNull(),

    campaignId: text("campaign_id"),
    offerId: text("offer_id"),

    affiliateUrl: text("affiliate_url").notNull(),

    /**
     * JSONB snapshot of the server-derived quote at intent time. Stored
     * as opaque JSONB; never treated as a guarantee. Nullable when the
     * user reached the CTA without a quote (e.g. metadata fallback).
     */
    quoteSnapshot: jsonb("quote_snapshot"),

    /**
     * Lifecycle of the handoff attempt:
     *
     *  - `created`            -- intent row inserted, redirect not yet
     *                            prepared (reserved for future flows)
     *  - `redirect_prepared`  -- intent row inserted AND /go/<shortCode>
     *                            path handed back to the client
     *  - `redirect_failed`    -- affiliate URL could not be built or
     *                            verified; no redirect path returned
     *  - `persistence_failed` -- intent row could not be inserted; no
     *                            redirect path returned
     */
    status: text("status").notNull(),

    failureReason: text("failure_reason"),

    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),

    redirectPreparedAt: timestamp("redirect_prepared_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    // Composite ownership FK: an intent row may only pair a publisher
    // with one of their own tracking links. `tracking_links` already
    // declares the composite unique key `tracking_links_id_publisher_unique`
    // on (id, publisher_id), so this FK references that key and the DB
    // rejects any insert where (tracking_link_id, publisher_id) does not
    // match a real tracking_links row. Mirrors the
    // `clicks_tracking_link_publisher_fk` pattern so Phase 20G.2a
    // reconciliation can trust the (publisher, tracking_link) pair.
    foreignKey({
      columns: [
        table.trackingLinkId,
        table.publisherId,
      ],
      foreignColumns: [
        trackingLinks.id,
        trackingLinks.publisherId,
      ],
      name: "shopee_purchase_intents_tracking_link_publisher_fk",
    }).onDelete("cascade"),

    index("shopee_purchase_intents_publisher_created_idx").on(
      table.publisherId,
      table.createdAt,
    ),

    index("shopee_purchase_intents_tracking_link_idx").on(
      table.trackingLinkId,
    ),

    index("shopee_purchase_intents_status_created_idx").on(
      table.status,
      table.createdAt,
    ),

    check(
      "shopee_purchase_intents_status_check",
      sql`${table.status} in (
        'created',
        'redirect_prepared',
        'redirect_failed',
        'persistence_failed'
      )`,
    ),

    check(
      "shopee_purchase_intents_network_sub_id_check",
      sql`${table.networkSubId} ~ '^vaflnk[a-f0-9]{24}$'`,
    ),

    check(
      "shopee_purchase_intents_short_code_check",
      sql`${table.shortCode} ~ '^[A-Za-z0-9_-]{10,32}$'`,
    ),

    check(
      "shopee_purchase_intents_canonical_product_url_check",
      sql`${table.canonicalProductUrl} ~ '^https://shopee\.vn/product/[0-9]+/[0-9]+/?$'`,
    ),

    check(
      "shopee_purchase_intents_affiliate_url_check",
      sql`${table.affiliateUrl} ~ '^https://'`,
    ),

    check(
      "shopee_purchase_intents_shop_id_check",
      sql`${table.shopId} ~ '^[0-9]+$'`,
    ),

    check(
      "shopee_purchase_intents_item_id_check",
      sql`${table.itemId} ~ '^[0-9]+$'`,
    ),

    check(
      "shopee_purchase_intents_classification_pair_check",
      sql`
        (
          ${table.campaignId} is null
          and ${table.offerId} is null
        )
        or
        (
          ${table.campaignId} is not null
          and ${table.offerId} is not null
        )
      `,
    ),

    check(
      "shopee_purchase_intents_redirect_prepared_at_check",
      sql`
        (
          ${table.status} = 'redirect_prepared'
          and ${table.redirectPreparedAt} is not null
        )
        or
        (
          ${table.status} <> 'redirect_prepared'
          and ${table.redirectPreparedAt} is null
        )
      `,
    ),

    check(
      "shopee_purchase_intents_failure_reason_check",
      sql`
        (
          ${table.status} in ('redirect_failed', 'persistence_failed')
          and ${table.failureReason} is not null
          and char_length(trim(${table.failureReason})) > 0
        )
        or
        (
          ${table.status} in ('created', 'redirect_prepared')
          and ${table.failureReason} is null
        )
      `,
    ),

    check(
      "shopee_purchase_intents_quote_snapshot_object_check",
      sql`
        ${table.quoteSnapshot} is null
        or jsonb_typeof(${table.quoteSnapshot}) = 'object'
      `,
    ),
  ],
).enableRLS();

// --- Inferred database row types --------------------------------------------

export type ProfileRow = typeof profiles.$inferSelect;
export type NewProfileRow = typeof profiles.$inferInsert;

export type PayoutAccountRow = typeof payoutAccounts.$inferSelect;
export type NewPayoutAccountRow = typeof payoutAccounts.$inferInsert;

export type TrackingLinkRow = typeof trackingLinks.$inferSelect;
export type NewTrackingLinkRow = typeof trackingLinks.$inferInsert;

export type ShopeePurchaseIntentRow =
  typeof shopeePurchaseIntents.$inferSelect;
export type NewShopeePurchaseIntentRow =
  typeof shopeePurchaseIntents.$inferInsert;

export type ClickRow = typeof clicks.$inferSelect;
export type NewClickRow = typeof clicks.$inferInsert;

export type ConversionRow = typeof conversions.$inferSelect;
export type NewConversionRow = typeof conversions.$inferInsert;

export type ShopeeIngestionEventRow =
  typeof shopeeIngestionEvents.$inferSelect;
export type NewShopeeIngestionEventRow =
  typeof shopeeIngestionEvents.$inferInsert;

export type AdvertiserRow = typeof advertisers.$inferSelect;
export type NewAdvertiserRow = typeof advertisers.$inferInsert;

export type CampaignRow = typeof campaigns.$inferSelect;
export type NewCampaignRow = typeof campaigns.$inferInsert;

export type OfferRow = typeof offers.$inferSelect;
export type NewOfferRow = typeof offers.$inferInsert;

export type CashbackPolicyRow = typeof cashbackPolicies.$inferSelect;
export type NewCashbackPolicyRow = typeof cashbackPolicies.$inferInsert;

// --- Phase 20K: reconciliation audit trail -----------------------------------

/**
 * Phase 20K -- durable reconciliation audit event surface.
 *
 * Every applied reconciliation transition inserts a row here in the
 * same DB transaction as the matching `conversions.status` update.
 * The full 64-character lowercase hex `idempotency_key` is persisted
 * and the `(network, idempotency_key)` UNIQUE constraint enforces
 * DB-level idempotency: a repeated sequential OR concurrent commit
 * with the same `(network, sourceConversionKey, decision)` tuple
 * collides on this index and is treated as an idempotent skipped
 * result by the application layer.
 *
 * The closed enum on `decision`, the explicit CHECK that
 * `next_status <> 'paid'`, the commission allocation invariant
 * (`network_commission = user_cashback + platform_profit`), and the
 * `actor_kind in ('admin', 'system')` constraint together keep the
 * audit trail internally consistent with the conversion row.
 *
 * The actor model is intentionally narrow:
 *
 *   - `actor_kind = 'admin'`: a real authenticated admin pressed
 *     Commit through the admin UI. `actor_user_id` and
 *     `actor_role` are populated from `requireAdmin()`.
 *   - `actor_kind = 'system'`: a future scheduled job / settlement
 *     pipeline triggers the same idempotent transition. No user
 *     id, no role. Phase 20K only ever inserts `'admin'` rows;
 *     `'system'` is reserved for the future payout / settlement
 *     pipeline.
 *
 * `reconciliation_run_id` is generated per commit pass and is
 * stable across every audit row the pass produces. It is NOT the
 * idempotency key -- the idempotency key is the per-decision
 * SHA-256. The run id is a separate grouping handle so a reviewer
 * can fetch all events from one admin click in one query.
 */
export const reconciliationAuditEvents = pgTable(
  "reconciliation_audit_events",
  {
    id: uuid("id")
      .defaultRandom()
      .primaryKey(),

    /**
     * Affiliate network that produced the conversion. Closed enum:
     * 'shopee' / 'manual'. 'tiktok' is deliberately absent -- the
     * engine refuses to plan an apply decision for any other
     * network.
     */
    network: text("network")
      .notNull(),

    /**
     * The conversion's `source_conversion_key` value. Stored
     * alongside the idempotency key for human-readable auditing.
     * Shape is enforced to the SHA-256 hex pattern to match
     * `conversions.source_conversion_key`.
     */
    sourceConversionKey: text("source_conversion_key")
      .notNull(),

    /**
     * The full 64-char lowercase hex SHA-256 digest from
     * `buildReconciliationIdempotencyKey()`. The UNIQUE index on
     * `(network, idempotency_key)` is the database-level
     * idempotency boundary; the application layer treats a unique
     * violation as an idempotent skipped result.
     */
    idempotencyKey: text("idempotency_key")
      .notNull(),

    conversionId: uuid("conversion_id")
      .notNull(),

    previousStatus: text("previous_status")
      .notNull(),

    nextStatus: text("next_status")
      .notNull(),

    decision: text("decision")
      .notNull(),

    reasonCode: text("reason_code")
      .notNull(),

    humanReason: text("human_reason")
      .notNull(),

    networkCommission: bigint("network_commission", {
      mode: "number",
    })
      .notNull(),

    userCashback: bigint("user_cashback", {
      mode: "number",
    })
      .notNull(),

    platformProfit: bigint("platform_profit", {
      mode: "number",
    })
      .notNull(),

    /** Policy evidence copied from the conversion for this audit decision. */
    cashbackShareBpsSnapshot: integer("cashback_share_bps_snapshot"),

    /**
     * Either 'admin' (a real admin pressed Commit) or 'system' (a
     * future settlement pipeline; never inserted by Phase 20K).
     */
    actorKind: text("actor_kind")
      .notNull(),

    actorUserId: uuid("actor_user_id"),

    actorRole: text("actor_role"),

    /**
     * Per-commit grouping handle. Distinct from the per-decision
     * `idempotency_key`. Every audit row emitted by a single
     * commit pass shares the same `reconciliation_run_id`.
     */
    reconciliationRunId: uuid("reconciliation_run_id")
      .notNull(),

    /**
     * The candidate row from `reconciliation_run_candidates` that
     * this audit event applied. NULL for legacy audit rows
     * inserted before Phase 20K follow-up 2 added run scoping.
     *
     * Together with the UNIQUE index on this column, this is the
     * DB-level idempotency boundary for "the same run + same
     * candidate may produce at most one applied audit event".
     */
    runCandidateId: uuid("run_candidate_id"),

    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    /**
     * Database-level idempotency boundary. Repeated sequential
     * OR concurrent commits of the SAME `(network,
     * sourceConversionKey, decision)` tuple collide here and the
     * application layer treats the conflict as an idempotent
     * skipped result rather than a server crash.
     */
    unique("reconciliation_audit_events_network_idempotency_key_unique").on(
      table.network,
      table.idempotencyKey,
    ),

    index("reconciliation_audit_events_conversion_id_idx").on(
      table.conversionId,
    ),

    index("reconciliation_audit_events_reconciliation_run_id_idx").on(
      table.reconciliationRunId,
    ),

    index("reconciliation_audit_events_created_at_idx").on(
      table.createdAt,
    ),

    /**
     * Database-level idempotency boundary for "the same run
     * candidate may produce at most one applied audit event".
     * Partial unique index because legacy audit rows from
     * before Phase 20K follow-up 2 have NULL `run_candidate_id`.
     */
    uniqueIndex("reconciliation_audit_events_run_candidate_id_unique")
      .on(table.runCandidateId)
      .where(sql`${table.runCandidateId} is not null`),

    check(
      "reconciliation_audit_events_network_check",
      sql`${table.network} in ('shopee', 'manual')`,
    ),

    check(
      "reconciliation_audit_events_network_not_blank_check",
      sql`char_length(trim(${table.network})) > 0`,
    ),

    check(
      "reconciliation_audit_events_source_conversion_key_shape_check",
      sql`${table.sourceConversionKey} ~ '^[a-f0-9]{64}$'`,
    ),

    check(
      "reconciliation_audit_events_idempotency_key_shape_check",
      sql`${table.idempotencyKey} ~ '^[a-f0-9]{64}$'`,
    ),

    check(
      "reconciliation_audit_events_previous_status_check",
      sql`${table.previousStatus} in ('pending', 'approved', 'rejected', 'payable', 'paid')`,
    ),

    check(
      "reconciliation_audit_events_next_status_check",
      sql`${table.nextStatus} in ('pending', 'approved', 'rejected', 'payable', 'paid')`,
    ),

    check(
      "reconciliation_audit_events_decision_check",
      sql`${table.decision} in ('approve', 'reject', 'mark_payable', 'mark_paid', 'reverse_to_pending')`,
    ),

    check(
      "reconciliation_audit_events_reason_code_not_blank_check",
      sql`char_length(trim(${table.reasonCode})) > 0`,
    ),

    check(
      "reconciliation_audit_events_human_reason_not_blank_check",
      sql`char_length(trim(${table.humanReason})) > 0`,
    ),

    /**
     * Defense-in-depth: a Phase 20K audit event MUST NOT be
     * stamped with `next_status = 'paid'`. The state machine
     * permits `payable -> paid` for a future settlement pipeline,
     * but the audit row itself refuses that stamp so a stray code
     * path cannot bypass the application-level guard.
     */
    check(
      "reconciliation_audit_events_no_paid_by_phase_20k_check",
      sql`${table.nextStatus} <> 'paid'`,
    ),

    check(
      "reconciliation_audit_events_previous_next_status_must_differ_check",
      sql`${table.previousStatus} <> ${table.nextStatus}`,
    ),

    check(
      "reconciliation_audit_events_network_commission_non_negative_check",
      sql`${table.networkCommission} >= 0`,
    ),

    check(
      "reconciliation_audit_events_user_cashback_non_negative_check",
      sql`${table.userCashback} >= 0`,
    ),

    check(
      "reconciliation_audit_events_platform_profit_non_negative_check",
      sql`${table.platformProfit} >= 0`,
    ),

    check(
      "reconciliation_audit_events_commission_allocation_check",
      sql`${table.networkCommission} = ${table.userCashback} + ${table.platformProfit}`,
    ),

    check(
      "reconciliation_audit_events_cashback_bps_range_check",
      sql`${table.cashbackShareBpsSnapshot} is null or ${table.cashbackShareBpsSnapshot} between 0 and 10000`,
    ),

    check(
      "reconciliation_audit_events_cashback_policy_allocation_check",
      sql`${table.cashbackShareBpsSnapshot} is null or ${table.userCashback} = floor(${table.networkCommission}::numeric * ${table.cashbackShareBpsSnapshot} / 10000)::bigint`,
    ),

    check(
      "reconciliation_audit_events_actor_kind_check",
      sql`${table.actorKind} in ('admin', 'system')`,
    ),

    /**
     * Cross-column actor consistency. Phase 20K only ever inserts
     * `'admin'` rows. The `'system'` branch is reserved for a
     * future settlement pipeline and forces `actor_user_id` /
     * `actor_role` to be NULL.
     */
    check(
      "reconciliation_audit_events_actor_consistency_check",
      sql`
        (
          ${table.actorKind} = 'admin'
          and ${table.actorUserId} is not null
          and ${table.actorRole} in ('admin', 'super_admin')
        )
        or
        (
          ${table.actorKind} = 'system'
          and ${table.actorUserId} is null
          and ${table.actorRole} is null
        )
      `,
    ),
  ],
).enableRLS();

export type ReconciliationAuditEventRow =
  typeof reconciliationAuditEvents.$inferSelect;
export type NewReconciliationAuditEventRow =
  typeof reconciliationAuditEvents.$inferInsert;

// --- Reconciliation run scope (Phase 20K follow-up 2) ----------------------
//
// A reconciliation run is a server-generated, bounded candidate set
// produced by dry-run and consumed by commit. The client never gets
// to choose candidate IDs or actor IDs -- the dry-run creates the run
// server-side, the commit MUST accept only the server-generated
// reconciliationRunId and reload only candidates belonging to that
// run.
//
// Phase 20K follow-up 2 invariants:
//
//   1. `reconciliation_runs` records run metadata + the closed
//      policy version + the authenticated actor who created the run.
//   2. `reconciliation_run_candidates` pins the exact candidate set
//      the run plans against. A UNIQUE constraint on
//      `(run_id, conversion_id)` is the durable boundary for the
//      "same-run replay is a true no-op" rule.
//   3. `reconciliation_audit_events` adds `run_candidate_id` to bind
//      each applied audit row to the candidate it claimed. The new
//      UNIQUE constraint on `run_candidate_id` (nullable for legacy
//      rows) is the database-level idempotency boundary for the
//      operation.

export const RECONCILIATION_RUN_STATUSES = [
  "draft",
  "committed",
  "superseded",
] as const;

export type ReconciliationRunStatus =
  (typeof RECONCILIATION_RUN_STATUSES)[number];

export const reconciliationRuns = pgTable(
  "reconciliation_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    /**
     * Network the run plans against. Closed enum -- `shopee`,
     * `manual`. Unknown values are rejected at the application
     * boundary (`reconciliation-engine.ts`).
     */
    network: text("network").notNull(),

    /**
     * The authenticated admin who created the run. Stored as text
     * for human readability; the actor's `user_id` is the durable
     * handle, the role is mirrored so the audit trail can be read
     * without joining back to the actor's profile row.
     */
    createdByUserId: uuid("created_by_user_id").notNull(),
    createdByRole: text("created_by_role").notNull(),

    /**
     * Reconciliation policy version active when the run was
     * created. Bumping the policy will NOT replay earlier runs --
     * they remain bound to the policy version under which they
     * were planned.
     */
    policyVersion: integer("policy_version").notNull(),

    /**
     * SHA-256 fingerprint of the candidate-set inputs (network +
     * source_conversion_key list + policy version + actor id). The
     * fingerprint is metadata-only; the durable boundary for
     * "this exact run was planned once" is the primary key + the
     * `(run_id, conversion_id)` UNIQUE index on
     * `reconciliation_run_candidates`.
     */
    candidateFingerprint: text("candidate_fingerprint").notNull(),

    /**
     * Phase 20K follow-up 4 -- normalized, server-validated source
     * scope captured at planning time. The commit path reloads
     * this JSONB to ensure the same boundary that produced the
     * candidate set is what is being applied. NULL only on legacy
     * rows that predate follow-up 4.
     */
    scope: jsonb("scope").$type<{
      readonly ingestionEventIds?: ReadonlyArray<string>;
      readonly sourceConversionKeys?: ReadonlyArray<string>;
      readonly explicitConversionIds?: ReadonlyArray<string>;
      readonly occurredAfter?: string;
      readonly occurredBefore?: string;
    }>(),

    /**
     * Phase 20K follow-up 4 -- count of candidates persisted for
     * the run. Captured at planning time; the commit path can
     * cross-check it against the actual candidate rows to detect
     * drift.
     */
    scopeCandidateCount: integer("scope_candidate_count"),

    /**
     * Run lifecycle.
     *   draft       : initial state after dry-run
     *   committing  : commit transaction in progress; the run has
     *                 been acquired via a draft -> committing
     *                 compare-and-set update
     *   committed   : commit completed at least one transition
     *   failed      : commit was acquired but a per-candidate
     *                 failure left the run non-terminal; the run
     *                 can be resumed on a subsequent attempt
     *   superseded  : reserved for future pipeline
     *
     * A run MUST NEVER remain `draft` after a money mutation was
     * applied. The acquire step (`draft -> committing`) is the
     * atomic gate; once the run is `committing`, a terminal
     * transition to either `committed` (success) or `failed`
     * (recoverable) MUST eventually complete.
     */
    status: text("status").notNull().default("draft"),

    /**
     * Phase 20K checkpoint 4D2 -- terminal failure timestamp.
     * Set exactly once, when the lifecycle moves from
     * `committing` to `failed`. The associated reason is in
     * `failed_reason`.
     */
    failedAt: timestamp("failed_at", { withTimezone: true, mode: "date" }),

    failedReason: text("failed_reason"),

    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    committedAt: timestamp("committed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    check(
      "reconciliation_runs_network_check",
      sql`${table.network} in ('shopee', 'manual')`,
    ),
    check(
      "reconciliation_runs_status_check",
      sql`${table.status} in ('draft', 'committing', 'committed', 'failed', 'superseded')`,
    ),
    check(
      "reconciliation_runs_created_by_role_check",
      sql`${table.createdByRole} in ('admin', 'super_admin')`,
    ),
    check(
      "reconciliation_runs_policy_version_positive_check",
      sql`${table.policyVersion} > 0`,
    ),
    check(
      "reconciliation_runs_candidate_fingerprint_shape_check",
      sql`char_length(trim(${table.candidateFingerprint})) > 0`,
    ),
    check(
      "reconciliation_runs_scope_candidate_count_non_negative_check",
      sql`${table.scopeCandidateCount} is null or ${table.scopeCandidateCount} >= 0`,
    ),
    index("reconciliation_runs_created_at_idx").on(table.createdAt),
    index("reconciliation_runs_status_idx").on(table.status),
  ],
).enableRLS();

export type ReconciliationRunRow = typeof reconciliationRuns.$inferSelect;
export type NewReconciliationRunRow = typeof reconciliationRuns.$inferInsert;

export const reconciliationRunCandidates = pgTable(
  "reconciliation_run_candidates",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    runId: uuid("run_id")
      .notNull()
      .references(() => reconciliationRuns.id, {
        onDelete: "cascade",
      }),

    conversionId: uuid("conversion_id").notNull(),

    /**
     * Source-evidence fingerprint captured at planning time. The
     * source evidence is the minimum sufficient provenance the
     * engine needs to plan the transition. The Phase 20K
     * follow-up 2 contract is:
     *
     *   - `sourceConversionKey` (sha256 hex of the source CSV row)
     *   - `ingestionEventId` (FK to the immutable ingestion event)
     *   - `validationStatus` / `settlementStatus` snapshots from
     *     the conversion row at planning time
     *
     * If any of these is missing or inconsistent the candidate is
     * refused at planning time and the audit row carries
     * `rejected_missing_provenance`.
     */
    sourceConversionKey: text("source_conversion_key"),
    network: text("network").notNull(),
    expectedPreviousStatus: text("expected_previous_status").notNull(),
    intendedNextStatus: text("intended_next_status").notNull(),
    plannedReasonCode: text("planned_reason_code").notNull(),
    plannedMoneyNetworkCommission: bigint("planned_money_network_commission", {
      mode: "number",
    }).notNull(),
    plannedCashbackShareBps: integer("planned_cashback_share_bps"),
    plannedMoneyUserCashback: bigint("planned_money_user_cashback", {
      mode: "number",
    }).notNull(),
    plannedMoneyPlatformProfit: bigint("planned_money_platform_profit", {
      mode: "number",
    }).notNull(),
    plannedIdempotencyKey: text("planned_idempotency_key").notNull(),
    provenanceFingerprint: text("provenance_fingerprint").notNull(),

    /**
     * Phase 20K checkpoint 4D2 -- durable per-candidate processing
     * outcome. Captured during the commit transaction so the
     * outer run-level transition (`committing -> committed`) can
     * be trusted to rely on durable per-candidate evidence, not
     * on an in-memory array. Closed values:
     *
     *   - 'pending'             : default; not yet processed
     *   - 'applied'             : conversion transitioned +
     *                             audit claim persisted
     *   - 'skipped/idempotent'  : audit claim already existed;
     *                             replay / no-op
     *   - 'skipped/stale'       : 4B commit-time evidence
     *                             revalidation reported a drift
     *   - 'skipped/blocked'     : Phase 20K 4F1B -- hard policy
     *                             block at commit time. Used
     *                             when the intended transition
     *                             is `approved -> payable` AND
     *                             no real durable upstream
     *                             settlement producer exists.
     *                             The per-candidate sub-tx
     *                             returns early with no audit
     *                             INSERT and no conversion
     *                             UPDATE. Companion
     *                             `processing_reason_code` is
     *                             `rejected_unverified_settlement_evidence`.
     *   - 'failed'              : per-candidate sub-transaction
     *                             threw; the durable candidate
     *                             row records the failure for
     *                             ops / retry
     */
    processingOutcome: text("processing_outcome")
      .notNull()
      .default("pending"),

    /**
     * Phase 20K checkpoint 4D2 -- wall-clock completion of the
     * per-candidate sub-transaction. NULL while pending. Set
     * to the sub-tx committed_at when the outcome moves to a
     * terminal value.
     */
    processingCompletedAt: timestamp("processing_completed_at", {
      withTimezone: true,
      mode: "date",
    }),

    /**
     * Phase 20K checkpoint 4D2 -- narrow reason_code for the
     * candidate outcome. Mirrors the audit reason or the 4B
     * drift reason. Never overwritten once set.
     */
    processingReasonCode: text("processing_reason_code"),

    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    /**
     * Database-level idempotency boundary for "same run + same
     * candidate cannot be planned twice". The application layer
     * also enforces this via `INSERT ... ON CONFLICT DO NOTHING`
     * but the UNIQUE index is the durable guarantee.
     */
    unique("reconciliation_run_candidates_run_id_conversion_id_unique").on(
      table.runId,
      table.conversionId,
    ),
    check(
      "reconciliation_run_candidates_network_check",
      sql`${table.network} in ('shopee', 'manual')`,
    ),
    check(
      "reconciliation_run_candidates_expected_previous_status_check",
      sql`${table.expectedPreviousStatus} in ('pending', 'approved', 'rejected', 'payable', 'paid')`,
    ),
    check(
      "reconciliation_run_candidates_intended_next_status_check",
      sql`${table.intendedNextStatus} in ('pending', 'approved', 'rejected', 'payable', 'paid')`,
    ),
    check(
      "reconciliation_run_candidates_previous_next_differ_check",
      sql`${table.expectedPreviousStatus} <> ${table.intendedNextStatus}`,
    ),
    check(
      "reconciliation_run_candidates_intended_next_status_not_paid_by_phase_20k_check",
      sql`${table.intendedNextStatus} <> 'paid'`,
    ),
    check(
      "reconciliation_run_candidates_planned_money_non_negative_check",
      sql`${table.plannedMoneyNetworkCommission} >= 0`,
    ),
    check(
      "reconciliation_run_candidates_cashback_bps_range_check",
      sql`${table.plannedCashbackShareBps} is null or ${table.plannedCashbackShareBps} between 0 and 10000`,
    ),
    check(
      "reconciliation_run_candidates_cashback_policy_allocation_check",
      sql`${table.plannedCashbackShareBps} is null or ${table.plannedMoneyUserCashback} = floor(${table.plannedMoneyNetworkCommission}::numeric * ${table.plannedCashbackShareBps} / 10000)::bigint`,
    ),
    check(
      "reconciliation_run_candidates_planned_idempotency_key_shape_check",
      sql`${table.plannedIdempotencyKey} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "reconciliation_run_candidates_provenance_fingerprint_shape_check",
      sql`char_length(trim(${table.provenanceFingerprint})) > 0`,
    ),
    index("reconciliation_run_candidates_conversion_id_idx").on(
      table.conversionId,
    ),
    check(
      "reconciliation_run_candidates_processing_outcome_check",
      sql`${table.processingOutcome} in (
        'pending',
        'applied',
        'skipped/idempotent',
        'skipped/stale',
        'failed'
      )`,
    ),
    index("reconciliation_run_candidates_processing_outcome_idx").on(
      table.processingOutcome,
    ),
    index("reconciliation_run_candidates_run_id_processing_outcome_idx").on(
      table.runId,
      table.processingOutcome,
    ),
  ],
).enableRLS();

export type ReconciliationRunCandidateRow =
  typeof reconciliationRunCandidates.$inferSelect;
export type NewReconciliationRunCandidateRow =
  typeof reconciliationRunCandidates.$inferInsert;

// --- Payout domain ------------------------------------------------------------

export const PAYOUT_REQUEST_STATUSES = [
  "requested",
  "approved",
  "processing",
  "review_required",
  "paid",
  "rejected",
  "cancelled",
  "failed",
] as const;

export type PayoutRequestStatus =
  (typeof PAYOUT_REQUEST_STATUSES)[number];

export const payoutRequests = pgTable(
  "payout_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "restrict" }),
    payoutAccountId: uuid("payout_account_id")
      .notNull()
      .references(() => payoutAccounts.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("requested"),
    currency: text("currency").notNull().default("VND"),
    idempotencyKey: uuid("idempotency_key").notNull(),
    idempotencyOperation: text("idempotency_operation")
      .notNull()
      .default("create"),
    requestPayloadFingerprint: text("request_payload_fingerprint").notNull(),
    requestedAmount: bigint("requested_amount", { mode: "number" }).notNull(),
    reservedAmount: bigint("reserved_amount", { mode: "number" }).notNull(),
    approvedAmount: bigint("approved_amount", { mode: "number" })
      .notNull()
      .default(0),
    paidAmount: bigint("paid_amount", { mode: "number" }).notNull().default(0),
    releasedAmount: bigint("released_amount", { mode: "number" })
      .notNull()
      .default(0),
    itemCount: integer("item_count").notNull(),
    payoutMethodSnapshot: text("payout_method_snapshot").notNull(),
    providerSnapshot: text("provider_snapshot").notNull(),
    accountNameSnapshot: text("account_name_snapshot").notNull(),
    accountNumberSnapshot: text("account_number_snapshot").notNull(),
    accountNumberLast4Snapshot: text("account_number_last4_snapshot").notNull(),
    payoutAccountStatusSnapshot: text("payout_account_status_snapshot").notNull(),
    destinationFingerprint: text("destination_fingerprint").notNull(),
    processorReference: text("processor_reference"),
    outcomeReference: text("outcome_reference"),
    paymentReference: text("payment_reference"),
    nonpaymentReference: text("nonpayment_reference"),
    ownerReasonCode: text("owner_reason_code"),
    internalReasonCode: text("internal_reason_code"),
    internalReason: text("internal_reason"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    approvedAt: timestamp("approved_at", { withTimezone: true, mode: "date" }),
    processingAt: timestamp("processing_at", { withTimezone: true, mode: "date" }),
    reviewRequiredAt: timestamp("review_required_at", {
      withTimezone: true,
      mode: "date",
    }),
    paidAt: timestamp("paid_at", { withTimezone: true, mode: "date" }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true, mode: "date" }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: "date" }),
    failedAt: timestamp("failed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    unique("payout_requests_user_operation_idempotency_key_unique").on(
      table.userId,
      table.idempotencyOperation,
      table.idempotencyKey,
    ),
    index("payout_requests_user_created_at_idx").on(table.userId, table.createdAt),
    index("payout_requests_status_created_at_idx").on(table.status, table.createdAt),
    index("payout_requests_payout_account_id_idx").on(table.payoutAccountId),
    uniqueIndex("payout_requests_provider_processor_reference_unique")
      .on(table.providerSnapshot, table.processorReference)
      .where(sql`${table.processorReference} is not null`),
    uniqueIndex("payout_requests_provider_payment_reference_unique")
      .on(table.providerSnapshot, table.paymentReference)
      .where(sql`${table.paymentReference} is not null`),
    check(
      "payout_requests_status_check",
      sql`${table.status} in ('requested', 'approved', 'processing', 'review_required', 'paid', 'rejected', 'cancelled', 'failed')`,
    ),
    check("payout_requests_currency_check", sql`${table.currency} = 'VND'`),
    check(
      "payout_requests_idempotency_operation_check",
      sql`${table.idempotencyOperation} = 'create'`,
    ),
    check(
      "payout_requests_amounts_check",
      sql`${table.requestedAmount} > 0
        and ${table.reservedAmount} = ${table.requestedAmount}
        and ${table.approvedAmount} >= 0
        and ${table.paidAmount} >= 0
        and ${table.releasedAmount} >= 0
        and ${table.paidAmount} + ${table.releasedAmount} <= ${table.reservedAmount}
        and not (${table.paidAmount} > 0 and ${table.releasedAmount} > 0)`,
    ),
    check(
      "payout_requests_item_count_check",
      sql`${table.itemCount} between 1 and 200`,
    ),
    check(
      "payout_requests_snapshot_check",
      sql`${table.payoutMethodSnapshot} = 'bank'
        and ${table.payoutAccountStatusSnapshot} = 'verified'
        and char_length(trim(${table.providerSnapshot})) > 0
        and char_length(trim(${table.accountNameSnapshot})) > 0
        and char_length(trim(${table.accountNumberSnapshot})) > 0
        and char_length(${table.accountNumberLast4Snapshot}) between 1 and 4`,
    ),
    check(
      "payout_requests_fingerprint_check",
      sql`${table.requestPayloadFingerprint} ~ '^[a-f0-9]{64}$'
        and ${table.destinationFingerprint} ~ '^[a-f0-9]{64}$'`,
    ),
    check("payout_requests_version_check", sql`${table.version} > 0`),
    check(
      "payout_requests_owner_reason_code_check",
      sql`${table.ownerReasonCode} is null or ${table.ownerReasonCode} in ('user_cancelled', 'request_rejected', 'payment_under_review', 'payment_not_completed')`,
    ),
    check(
      "payout_requests_reference_shape_check",
      sql`(${table.processorReference} is null or (char_length(trim(${table.processorReference})) between 1 and 200 and ${table.processorReference} !~ '[[:cntrl:]]'))
        and (${table.outcomeReference} is null or (char_length(trim(${table.outcomeReference})) between 1 and 200 and ${table.outcomeReference} !~ '[[:cntrl:]]'))
        and (${table.paymentReference} is null or (char_length(trim(${table.paymentReference})) between 1 and 200 and ${table.paymentReference} !~ '[[:cntrl:]]'))
        and (${table.nonpaymentReference} is null or (char_length(trim(${table.nonpaymentReference})) between 1 and 200 and ${table.nonpaymentReference} !~ '[[:cntrl:]]'))`,
    ),
    check(
      "payout_requests_state_amount_check",
      sql`(${table.status} in ('requested', 'approved', 'processing', 'review_required') and ${table.paidAmount} = 0 and ${table.releasedAmount} = 0)
        or (${table.status} = 'paid' and ${table.paidAmount} = ${table.reservedAmount} and ${table.releasedAmount} = 0)
        or (${table.status} in ('rejected', 'cancelled', 'failed') and ${table.paidAmount} = 0 and ${table.releasedAmount} = ${table.reservedAmount})`,
    ),
    check(
      "payout_requests_approved_amount_check",
      sql`(${table.status} in ('requested', 'cancelled') and ${table.approvedAmount} = 0)
        or (${table.status} in ('approved', 'processing', 'review_required', 'paid', 'failed') and ${table.approvedAmount} = ${table.reservedAmount})
        or (${table.status} = 'rejected' and ${table.approvedAmount} in (0, ${table.reservedAmount}))`,
    ),
    check(
      "payout_requests_state_metadata_check",
      sql`(${table.status} = 'requested' and ${table.ownerReasonCode} is null and ${table.approvedAt} is null and ${table.processingAt} is null and ${table.reviewRequiredAt} is null and ${table.paidAt} is null and ${table.rejectedAt} is null and ${table.cancelledAt} is null and ${table.failedAt} is null)
        or (${table.status} = 'approved' and ${table.ownerReasonCode} is null and ${table.approvedAt} is not null and ${table.processingAt} is null and ${table.reviewRequiredAt} is null and ${table.paidAt} is null and ${table.rejectedAt} is null and ${table.cancelledAt} is null and ${table.failedAt} is null)
        or (${table.status} = 'processing' and ${table.ownerReasonCode} is null and ${table.approvedAt} is not null and ${table.processingAt} is not null and ${table.reviewRequiredAt} is null and ${table.paidAt} is null and ${table.rejectedAt} is null and ${table.cancelledAt} is null and ${table.failedAt} is null and ${table.processorReference} is not null)
        or (${table.status} = 'review_required' and ${table.ownerReasonCode} = 'payment_under_review' and ${table.approvedAt} is not null and ${table.processingAt} is not null and ${table.reviewRequiredAt} is not null and ${table.paidAt} is null and ${table.rejectedAt} is null and ${table.cancelledAt} is null and ${table.failedAt} is null and ${table.processorReference} is not null and ${table.outcomeReference} is not null)
        or (${table.status} = 'paid' and ${table.ownerReasonCode} is null and ${table.approvedAt} is not null and ${table.processingAt} is not null and ${table.paidAt} is not null and ${table.rejectedAt} is null and ${table.cancelledAt} is null and ${table.failedAt} is null and ${table.processorReference} is not null and ${table.paymentReference} is not null)
        or (${table.status} = 'rejected' and ${table.ownerReasonCode} = 'request_rejected' and ${table.processingAt} is null and ${table.reviewRequiredAt} is null and ${table.paidAt} is null and ${table.rejectedAt} is not null and ${table.cancelledAt} is null and ${table.failedAt} is null)
        or (${table.status} = 'cancelled' and ${table.ownerReasonCode} = 'user_cancelled' and ${table.approvedAt} is null and ${table.processingAt} is null and ${table.reviewRequiredAt} is null and ${table.paidAt} is null and ${table.rejectedAt} is null and ${table.cancelledAt} is not null and ${table.failedAt} is null)
        or (${table.status} = 'failed' and ${table.ownerReasonCode} = 'payment_not_completed' and ${table.approvedAt} is not null and ${table.processingAt} is not null and ${table.paidAt} is null and ${table.rejectedAt} is null and ${table.cancelledAt} is null and ${table.failedAt} is not null and ${table.processorReference} is not null and ${table.nonpaymentReference} is not null)`,
    ),
    check(
      "payout_requests_timestamp_order_check",
      sql`(${table.approvedAt} is null or ${table.approvedAt} >= ${table.createdAt})
        and (${table.processingAt} is null or (${table.approvedAt} is not null and ${table.processingAt} >= ${table.approvedAt}))
        and (${table.reviewRequiredAt} is null or (${table.processingAt} is not null and ${table.reviewRequiredAt} >= ${table.processingAt}))
        and (${table.paidAt} is null or (${table.processingAt} is not null and ${table.paidAt} >= ${table.processingAt}))
        and (${table.rejectedAt} is null or ${table.rejectedAt} >= ${table.createdAt})
        and (${table.cancelledAt} is null or ${table.cancelledAt} >= ${table.createdAt})
        and (${table.failedAt} is null or (${table.processingAt} is not null and ${table.failedAt} >= ${table.processingAt}))`,
    ),
  ],
).enableRLS();

export const payoutRequestItems = pgTable(
  "payout_request_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    payoutRequestId: uuid("payout_request_id")
      .notNull()
      .references(() => payoutRequests.id, { onDelete: "restrict" }),
    conversionId: uuid("conversion_id")
      .notNull()
      .references(() => conversions.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "restrict" }),
    amount: bigint("amount", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("VND"),
    conversionStatusSnapshot: text("conversion_status_snapshot").notNull(),
    settlementStatusSnapshot: text("settlement_status_snapshot"),
    sourceConversionKeySnapshot: text("source_conversion_key_snapshot"),
    cashbackShareBpsSnapshot: integer("cashback_share_bps_snapshot"),
    conversionPayableAtSnapshot: timestamp("conversion_payable_at_snapshot", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    reservedAt: timestamp("reserved_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    releasedAt: timestamp("released_at", { withTimezone: true, mode: "date" }),
    paidAt: timestamp("paid_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("payout_request_items_request_conversion_unique").on(
      table.payoutRequestId,
      table.conversionId,
    ),
    uniqueIndex("payout_request_items_conversion_unreleased_unique")
      .on(table.conversionId)
      .where(sql`${table.releasedAt} is null`),
    index("payout_request_items_request_id_idx").on(table.payoutRequestId),
    index("payout_request_items_user_created_at_idx").on(table.userId, table.createdAt),
    index("payout_request_items_conversion_id_idx").on(table.conversionId),
    check("payout_request_items_amount_check", sql`${table.amount} > 0`),
    check("payout_request_items_currency_check", sql`${table.currency} = 'VND'`),
    check(
      "payout_request_items_status_snapshot_check",
      sql`${table.conversionStatusSnapshot} = 'payable' and (${table.settlementStatusSnapshot} is null or ${table.settlementStatusSnapshot} = 'payable')`,
    ),
    check(
      "payout_request_items_source_key_check",
      sql`${table.sourceConversionKeySnapshot} is null or ${table.sourceConversionKeySnapshot} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "payout_request_items_bps_check",
      sql`${table.cashbackShareBpsSnapshot} is null or ${table.cashbackShareBpsSnapshot} between 0 and 10000`,
    ),
    check(
      "payout_request_items_lifecycle_check",
      sql`not (${table.releasedAt} is not null and ${table.paidAt} is not null)
        and (${table.releasedAt} is null or ${table.releasedAt} >= ${table.reservedAt})
        and (${table.paidAt} is null or ${table.paidAt} >= ${table.reservedAt})`,
    ),
  ],
).enableRLS();

export const payoutEvents = pgTable(
  "payout_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    payoutRequestId: uuid("payout_request_id")
      .notNull()
      .references(() => payoutRequests.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "restrict" }),
    sequenceNo: integer("sequence_no").notNull(),
    eventType: text("event_type").notNull(),
    previousStatus: text("previous_status"),
    nextStatus: text("next_status").notNull(),
    actorKind: text("actor_kind").notNull(),
    actorUserId: uuid("actor_user_id"),
    actorRole: text("actor_role"),
    idempotencyScope: text("idempotency_scope").notNull(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    payloadFingerprint: text("payload_fingerprint").notNull(),
    correlationId: uuid("correlation_id").notNull(),
    requestVersion: integer("request_version").notNull(),
    requestedAmount: bigint("requested_amount", { mode: "number" }).notNull(),
    reservedAmount: bigint("reserved_amount", { mode: "number" }).notNull(),
    approvedAmount: bigint("approved_amount", { mode: "number" }).notNull(),
    paidAmount: bigint("paid_amount", { mode: "number" }).notNull(),
    releasedAmount: bigint("released_amount", { mode: "number" }).notNull(),
    beforeSnapshot: jsonb("before_snapshot").$type<Record<string, unknown>>(),
    afterSnapshot: jsonb("after_snapshot")
      .$type<Record<string, unknown>>()
      .notNull(),
    ownerReasonCode: text("owner_reason_code"),
    internalReasonCode: text("internal_reason_code"),
    internalReason: text("internal_reason"),
    evidenceReference: text("evidence_reference"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("payout_events_request_sequence_unique").on(
      table.payoutRequestId,
      table.sequenceNo,
    ),
    unique("payout_events_scope_key_unique").on(
      table.idempotencyScope,
      table.idempotencyKey,
    ),
    index("payout_events_request_sequence_idx").on(
      table.payoutRequestId,
      table.sequenceNo,
    ),
    index("payout_events_user_created_at_idx").on(table.userId, table.createdAt),
    index("payout_events_created_at_idx").on(table.createdAt),
    check("payout_events_sequence_check", sql`${table.sequenceNo} > 0`),
    check(
      "payout_events_event_type_check",
      sql`${table.eventType} in ('request_created', 'request_approved', 'request_rejected', 'request_cancelled', 'processing_started', 'outcome_uncertain', 'payment_confirmed', 'nonpayment_confirmed')`,
    ),
    check(
      "payout_events_status_check",
      sql`(${table.eventType} = 'request_created' and ${table.previousStatus} is null and ${table.nextStatus} = 'requested')
        or (${table.eventType} = 'request_approved' and ${table.previousStatus} = 'requested' and ${table.nextStatus} = 'approved')
        or (${table.eventType} = 'request_rejected' and ${table.previousStatus} in ('requested', 'approved') and ${table.nextStatus} = 'rejected')
        or (${table.eventType} = 'request_cancelled' and ${table.previousStatus} = 'requested' and ${table.nextStatus} = 'cancelled')
        or (${table.eventType} = 'processing_started' and ${table.previousStatus} = 'approved' and ${table.nextStatus} = 'processing')
        or (${table.eventType} = 'outcome_uncertain' and ${table.previousStatus} = 'processing' and ${table.nextStatus} = 'review_required')
        or (${table.eventType} = 'payment_confirmed' and ${table.previousStatus} in ('processing', 'review_required') and ${table.nextStatus} = 'paid')
        or (${table.eventType} = 'nonpayment_confirmed' and ${table.previousStatus} in ('processing', 'review_required') and ${table.nextStatus} = 'failed')`,
    ),
    check(
      "payout_events_actor_check",
      sql`(${table.eventType} in ('request_created', 'request_cancelled') and ${table.actorKind} = 'user' and ${table.actorUserId} is not null and ${table.actorRole} is null)
        or (${table.eventType} in ('request_approved', 'request_rejected') and ${table.actorKind} = 'admin' and ${table.actorUserId} is not null and ${table.actorRole} in ('admin', 'super_admin'))
        or (${table.eventType} in ('processing_started', 'outcome_uncertain', 'payment_confirmed', 'nonpayment_confirmed') and ${table.actorKind} = 'system' and ${table.actorUserId} is null and ${table.actorRole} is null)`,
    ),
    check(
      "payout_events_idempotency_check",
      sql`char_length(trim(${table.idempotencyScope})) > 0
        and ${table.payloadFingerprint} ~ '^[a-f0-9]{64}$'
        and ${table.correlationId} = ${table.payoutRequestId}`,
    ),
    check(
      "payout_events_snapshot_check",
      sql`jsonb_typeof(${table.afterSnapshot}) = 'object'
        and (${table.beforeSnapshot} is null or jsonb_typeof(${table.beforeSnapshot}) = 'object')`,
    ),
    check(
      "payout_events_money_check",
      sql`${table.requestedAmount} > 0
        and ${table.reservedAmount} = ${table.requestedAmount}
        and ${table.approvedAmount} >= 0
        and ${table.paidAmount} >= 0
        and ${table.releasedAmount} >= 0`,
    ),
    check(
      "payout_events_owner_reason_code_check",
      sql`(${table.eventType} = 'request_cancelled' and ${table.ownerReasonCode} = 'user_cancelled')
        or (${table.eventType} = 'request_rejected' and ${table.ownerReasonCode} = 'request_rejected')
        or (${table.eventType} = 'outcome_uncertain' and ${table.ownerReasonCode} = 'payment_under_review')
        or (${table.eventType} = 'nonpayment_confirmed' and ${table.ownerReasonCode} = 'payment_not_completed')
        or (${table.eventType} in ('request_created', 'request_approved', 'processing_started', 'payment_confirmed') and ${table.ownerReasonCode} is null)`,
    ),
    check(
      "payout_events_evidence_reference_check",
      sql`${table.evidenceReference} is null or (char_length(trim(${table.evidenceReference})) between 1 and 200 and ${table.evidenceReference} !~ '[[:cntrl:]]')`,
    ),
  ],
).enableRLS();

export type PayoutRequestRow = typeof payoutRequests.$inferSelect;
export type NewPayoutRequestRow = typeof payoutRequests.$inferInsert;
export type PayoutRequestItemRow = typeof payoutRequestItems.$inferSelect;
export type NewPayoutRequestItemRow = typeof payoutRequestItems.$inferInsert;
export type PayoutEventRow = typeof payoutEvents.$inferSelect;
export type NewPayoutEventRow = typeof payoutEvents.$inferInsert;
