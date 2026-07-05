/*
 * Phase 20H.3b - Shopee buyer purchase-intent persistence (additive only).
 *
 * Adds one durable first-party record per buyer handoff attempt: a
 * `shopee_purchase_intents` row written by `initiateShopeePurchaseAction`
 * BEFORE the action returns `/go/<shortCode>`. The redirect is therefore
 * always backed by an audit anchor Vaffiliate owns.
 *
 * This migration is additive only:
 *
 *  - No destructive cleanup.
 *  - No data backfill.
 *  - No rename of existing tables.
 *  - No drop of existing constraints or unique indexes.
 *  - No removal of the existing `tracking_links`, `clicks`, or
 *    `shopee_ingestion_events` boundaries.
 *
 * New object:
 *
 *  1. `shopee_purchase_intents` - immutable-from-the-buyer's-perspective
 *     intent surface. One row per handoff attempt. Carries the
 *     authenticated publisher, the tracking link it produced, the
 *     original and canonical Shopee product URLs, the parsed shopId
 *     and itemId, the generated affiliate URL, an opaque JSONB quote
 *     snapshot (never a guarantee), a typed status, the redirect
 *     timestamp when the redirect was prepared, and an internal failure
 *     reason for the two failure states.
 *
 *     Server-only via RLS enabled with no policies and no grants to
 *     PUBLIC/anon/authenticated. Reads must go through the
 *     repository/service layer.
 *
 * CHECK constraints:
 *  - `status` enum (created / redirect_prepared / redirect_failed /
 *    persistence_failed)
 *  - `network_sub_id` matches the existing tracking_links shape
 *  - `short_code` matches the existing tracking_links shape
 *  - `canonical_product_url` matches https://shopee.vn/product/<digits>/<digits>
 *  - `affiliate_url` uses HTTPS
 *  - `shop_id` / `item_id` are non-empty ASCII digit strings
 *  - `campaign_id` / `offer_id` form the same classification pair as
 *    tracking_links
 *  - `redirect_prepared_at` is non-null iff status = 'redirect_prepared'
 *  - `failure_reason` is non-blank iff status is one of the two failure
 *    states; null otherwise
 *  - `quote_snapshot` is either null or a JSONB object
 *
 * Indexes:
 *  - (publisher_id, created_at) for buyer audit
 *  - (tracking_link_id) for cross-link query
 *  - (status, created_at) for ops dashboards
 */
CREATE TABLE "shopee_purchase_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publisher_id" uuid NOT NULL,
	"tracking_link_id" uuid NOT NULL,
	"network_sub_id" text NOT NULL,
	"short_code" text NOT NULL,
	"original_product_url" text NOT NULL,
	"canonical_product_url" text NOT NULL,
	"shop_id" text NOT NULL,
	"item_id" text NOT NULL,
	"campaign_id" text,
	"offer_id" text,
	"affiliate_url" text NOT NULL,
	"quote_snapshot" jsonb,
	"status" text NOT NULL,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"redirect_prepared_at" timestamp with time zone,
	CONSTRAINT "shopee_purchase_intents_publisher_id_profiles_user_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "shopee_purchase_intents_tracking_link_id_tracking_links_id_fk" FOREIGN KEY ("tracking_link_id") REFERENCES "public"."tracking_links"("id") ON DELETE restrict ON UPDATE no action
);
--> statement-breakpoint

CREATE INDEX "shopee_purchase_intents_publisher_created_idx" ON "shopee_purchase_intents" USING btree ("publisher_id","created_at");
--> statement-breakpoint

CREATE INDEX "shopee_purchase_intents_tracking_link_idx" ON "shopee_purchase_intents" USING btree ("tracking_link_id");
--> statement-breakpoint

CREATE INDEX "shopee_purchase_intents_status_created_idx" ON "shopee_purchase_intents" USING btree ("status","created_at");
--> statement-breakpoint

ALTER TABLE "shopee_purchase_intents" ADD CONSTRAINT "shopee_purchase_intents_status_check" CHECK ("shopee_purchase_intents"."status" in (
        'created',
        'redirect_prepared',
        'redirect_failed',
        'persistence_failed'
      ));
--> statement-breakpoint

ALTER TABLE "shopee_purchase_intents" ADD CONSTRAINT "shopee_purchase_intents_network_sub_id_check" CHECK ("shopee_purchase_intents"."network_sub_id" ~ '^vaflnk[a-f0-9]{24}$');
--> statement-breakpoint

ALTER TABLE "shopee_purchase_intents" ADD CONSTRAINT "shopee_purchase_intents_short_code_check" CHECK ("shopee_purchase_intents"."short_code" ~ '^[A-Za-z0-9_-]{10,32}$');
--> statement-breakpoint

ALTER TABLE "shopee_purchase_intents" ADD CONSTRAINT "shopee_purchase_intents_canonical_product_url_check" CHECK ("shopee_purchase_intents"."canonical_product_url" ~ '^https://shopee\.vn/product/[0-9]+/[0-9]+/?$');
--> statement-breakpoint

ALTER TABLE "shopee_purchase_intents" ADD CONSTRAINT "shopee_purchase_intents_affiliate_url_check" CHECK ("shopee_purchase_intents"."affiliate_url" ~ '^https://');
--> statement-breakpoint

ALTER TABLE "shopee_purchase_intents" ADD CONSTRAINT "shopee_purchase_intents_shop_id_check" CHECK ("shopee_purchase_intents"."shop_id" ~ '^[0-9]+$');
--> statement-breakpoint

ALTER TABLE "shopee_purchase_intents" ADD CONSTRAINT "shopee_purchase_intents_item_id_check" CHECK ("shopee_purchase_intents"."item_id" ~ '^[0-9]+$');
--> statement-breakpoint

ALTER TABLE "shopee_purchase_intents" ADD CONSTRAINT "shopee_purchase_intents_classification_pair_check" CHECK (
        (
          "shopee_purchase_intents"."campaign_id" is null
          and "shopee_purchase_intents"."offer_id" is null
        )
        or
        (
          "shopee_purchase_intents"."campaign_id" is not null
          and "shopee_purchase_intents"."offer_id" is not null
        )
      );
--> statement-breakpoint

ALTER TABLE "shopee_purchase_intents" ADD CONSTRAINT "shopee_purchase_intents_redirect_prepared_at_check" CHECK (
        (
          "shopee_purchase_intents"."status" = 'redirect_prepared'
          and "shopee_purchase_intents"."redirect_prepared_at" is not null
        )
        or
        (
          "shopee_purchase_intents"."status" <> 'redirect_prepared'
          and "shopee_purchase_intents"."redirect_prepared_at" is null
        )
      );
--> statement-breakpoint

ALTER TABLE "shopee_purchase_intents" ADD CONSTRAINT "shopee_purchase_intents_failure_reason_check" CHECK (
        (
          "shopee_purchase_intents"."status" in ('redirect_failed', 'persistence_failed')
          and "shopee_purchase_intents"."failure_reason" is not null
          and char_length(trim("shopee_purchase_intents"."failure_reason")) > 0
        )
        or
        (
          "shopee_purchase_intents"."status" in ('created', 'redirect_prepared')
          and "shopee_purchase_intents"."failure_reason" is null
        )
      );
--> statement-breakpoint

ALTER TABLE "shopee_purchase_intents" ADD CONSTRAINT "shopee_purchase_intents_quote_snapshot_object_check" CHECK (
        "shopee_purchase_intents"."quote_snapshot" is null
        or jsonb_typeof("shopee_purchase_intents"."quote_snapshot") = 'object'
      );
--> statement-breakpoint

ALTER TABLE "public"."shopee_purchase_intents" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

REVOKE ALL PRIVILEGES ON TABLE "public"."shopee_purchase_intents" FROM PUBLIC;
--> statement-breakpoint

REVOKE ALL PRIVILEGES ON TABLE "public"."shopee_purchase_intents" FROM anon;
--> statement-breakpoint

REVOKE ALL PRIVILEGES ON TABLE "public"."shopee_purchase_intents" FROM authenticated;