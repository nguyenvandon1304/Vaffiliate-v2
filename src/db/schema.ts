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
  uuid,
} from "drizzle-orm/pg-core";

// ─── Profiles ────────────────────────────────────────────────────────────────

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

// ─── Publisher payout accounts ──────────────────────────────────────────────

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

// ─── Consumer cashback tracking links ───────────────────────────────────────

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

// ─── Consumer cashback clicks ────────────────────────────────────────────────

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

// ─── Shopee CSV import staging ────────────────────────────────────────────────

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
  ],
);

// ─── Conversion ledger ──────────────────────────────────────────────────────

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
  ],
);

// ─── Inferred database row types ────────────────────────────────────────────

export type ProfileRow = typeof profiles.$inferSelect;
export type NewProfileRow = typeof profiles.$inferInsert;

export type PayoutAccountRow = typeof payoutAccounts.$inferSelect;
export type NewPayoutAccountRow = typeof payoutAccounts.$inferInsert;

export type TrackingLinkRow = typeof trackingLinks.$inferSelect;
export type NewTrackingLinkRow = typeof trackingLinks.$inferInsert;

export type ClickRow = typeof clicks.$inferSelect;
export type NewClickRow = typeof clicks.$inferInsert;

export type ConversionRow = typeof conversions.$inferSelect;
export type NewConversionRow = typeof conversions.$inferInsert;
