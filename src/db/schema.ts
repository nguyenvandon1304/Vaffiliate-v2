import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
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

    destinationUrl: text("destination_url")
      .notNull(),

      campaignId: text("campaign_id"),

      offerId: text("offer_id"),

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

    networkSubId: text("network_sub_id")
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

    unique("clicks_network_sub_id_unique").on(
      table.networkSubId,
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
      "clicks_network_sub_id_not_blank_check",
      sql`char_length(trim(${table.networkSubId})) > 0`,
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
     * campaigns, offers, and tracking links are not persisted yet.
     */
    advertiserId: text("advertiser_id")
      .notNull(),

    campaignId: text("campaign_id")
      .notNull(),

    offerId: text("offer_id")
      .notNull(),

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
