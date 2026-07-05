/*
 * Phase 20G.2a - Shopee conversion reconciliation foundation (additive only).
 *
 * Adds the immutable ingestion-event surface and the additive split-status
 * foundation required for normalized Shopee conversion promotion from
 * `shopee_csv_rows.processing_status = 'ready_for_conversion'`.
 *
 * This migration is additive only:
 *
 * - No destructive cleanup.
 * - No data backfill.
 * - No blind text-to-UUID casts.
 * - No rename of existing `conversions.status`.
 * - No drop of existing constraints or unique indexes.
 * - No removal of the temporary uniqueness boundary
 *   (`network + external_order_id`).
 *
 * New objects:
 *
 * 1. `shopee_ingestion_events` - immutable ingestion event surface. Carries
 *    the network, source event / batch identifier, payload hash, received
 *    timestamp, processing status, attempt count, processed timestamp,
 *    failure code + message, and a raw source reference. UNIQUE
 *    `(network, source_event_id)` enforces ingestion idempotency.
 *    Server-only via RLS enabled with no policies and no grants to
 *    PUBLIC/anon/authenticated.
 * 2. Nullable additive columns on `conversions`:
 *    - `source_conversion_key text`
 *    - `validation_status text` (NULL when legacy)
 *    - `settlement_status text` (NULL when legacy)
 *    - `ingestion_event_id uuid` (FK ON DELETE RESTRICT, NULL when legacy)
 * 3. Partial UNIQUE index `conversions_network_source_conversion_key_unique`
 *    on `(network, source_conversion_key) WHERE source_conversion_key IS
 *    NOT NULL` so legacy rows with NULL key do not block the constraint.
 * 4. CHECK constraints on the nullable split-status columns using
 *    `IS NULL OR <set>` so legacy rows with NULL stay valid.
 *
 * The conversion table's legacy `status` column, `network + external_order_id`
 * unique constraint, lifecycle timestamp checks, commission-allocation
 * invariant, and the publisher RLS SELECT policy are all preserved
 * untouched.
 */

CREATE TABLE "shopee_ingestion_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"network" text NOT NULL,
	"source_event_id" text NOT NULL,
	"payload_sha256" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processing_status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 1 NOT NULL,
	"processed_at" timestamp with time zone,
	"failure_code" text,
	"failure_message" text,
	"raw_reference" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shopee_ingestion_events_network_source_event_unique" UNIQUE("network","source_event_id"),
	CONSTRAINT "shopee_ingestion_events_network_not_blank_check" CHECK (char_length(trim("shopee_ingestion_events"."network")) > 0),
	CONSTRAINT "shopee_ingestion_events_source_event_id_not_blank_check" CHECK (char_length(trim("shopee_ingestion_events"."source_event_id")) > 0),
	CONSTRAINT "shopee_ingestion_events_payload_sha256_check" CHECK ("shopee_ingestion_events"."payload_sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "shopee_ingestion_events_processing_status_check" CHECK ("shopee_ingestion_events"."processing_status" in (
        'pending',
        'succeeded',
        'failed',
        'replayed'
      )),
	CONSTRAINT "shopee_ingestion_events_attempt_count_check" CHECK ("shopee_ingestion_events"."attempt_count" >= 1),
	CONSTRAINT "shopee_ingestion_events_raw_reference_check" CHECK (jsonb_typeof("shopee_ingestion_events"."raw_reference") = 'object'),
	CONSTRAINT "shopee_ingestion_events_processed_at_check" CHECK (
        (
          "shopee_ingestion_events"."processing_status" in ('succeeded', 'failed', 'replayed')
          and "shopee_ingestion_events"."processed_at" is not null
        )
        or
        (
          "shopee_ingestion_events"."processing_status" = 'pending'
          and "shopee_ingestion_events"."processed_at" is null
        )
      ),
	CONSTRAINT "shopee_ingestion_events_failure_code_check" CHECK (
        (
          "shopee_ingestion_events"."processing_status" = 'failed'
          and nullif(trim("shopee_ingestion_events"."failure_code"), '') is not null
          and nullif(trim("shopee_ingestion_events"."failure_message"), '') is not null
        )
        or
        (
          "shopee_ingestion_events"."processing_status" <> 'failed'
          and "shopee_ingestion_events"."failure_code" is null
          and "shopee_ingestion_events"."failure_message" is null
        )
      )
);
--> statement-breakpoint

ALTER TABLE "conversions" ADD COLUMN "source_conversion_key" text;
--> statement-breakpoint

ALTER TABLE "conversions" ADD COLUMN "validation_status" text;
--> statement-breakpoint

ALTER TABLE "conversions" ADD COLUMN "settlement_status" text;
--> statement-breakpoint

ALTER TABLE "conversions" ADD COLUMN "ingestion_event_id" uuid;
--> statement-breakpoint

ALTER TABLE "conversions" ADD CONSTRAINT "conversions_ingestion_event_id_shopee_ingestion_events_id_fk" FOREIGN KEY ("ingestion_event_id") REFERENCES "public"."shopee_ingestion_events"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "conversions" ADD CONSTRAINT "conversions_source_conversion_key_shape_check" CHECK ("conversions"."source_conversion_key" is null or "conversions"."source_conversion_key" ~ '^[a-f0-9]{64}$');
--> statement-breakpoint

ALTER TABLE "conversions" ADD CONSTRAINT "conversions_validation_status_check" CHECK (
        "conversions"."validation_status" is null
        or "conversions"."validation_status" in (
          'recorded',
          'reconciling',
          'approved',
          'rejected',
          'reversed'
        )
      );
--> statement-breakpoint

ALTER TABLE "conversions" ADD CONSTRAINT "conversions_settlement_status_check" CHECK (
        "conversions"."settlement_status" is null
        or "conversions"."settlement_status" in (
          'not_payable',
          'payable',
          'paid'
        )
      );
--> statement-breakpoint

CREATE UNIQUE INDEX "conversions_network_source_conversion_key_unique" ON "conversions" USING btree ("network","source_conversion_key") WHERE "source_conversion_key" IS NOT NULL;
--> statement-breakpoint

CREATE INDEX "conversions_ingestion_event_id_idx" ON "conversions" USING btree ("ingestion_event_id");
--> statement-breakpoint

ALTER TABLE "public"."shopee_ingestion_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

REVOKE ALL PRIVILEGES ON TABLE "public"."shopee_ingestion_events" FROM PUBLIC;
--> statement-breakpoint

REVOKE ALL PRIVILEGES ON TABLE "public"."shopee_ingestion_events" FROM anon;
--> statement-breakpoint

REVOKE ALL PRIVILEGES ON TABLE "public"."shopee_ingestion_events" FROM authenticated;
