CREATE TABLE "shopee_csv_import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_file_name" text NOT NULL,
	"source_file_sha256" text NOT NULL,
	"source_file_size_bytes" bigint NOT NULL,
	"source_headers" jsonb NOT NULL,
	"parser_version" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"inserted_rows" integer DEFAULT 0 NOT NULL,
	"duplicate_rows" integer DEFAULT 0 NOT NULL,
	"attributed_rows" integer DEFAULT 0 NOT NULL,
	"unattributed_rows" integer DEFAULT 0 NOT NULL,
	"awaiting_classification_rows" integer DEFAULT 0 NOT NULL,
	"rejected_rows" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shopee_csv_import_batches_source_file_sha256_unique" UNIQUE("source_file_sha256"),
	CONSTRAINT "shopee_csv_import_batches_source_file_name_check" CHECK (char_length(trim("shopee_csv_import_batches"."source_file_name")) > 0),
	CONSTRAINT "shopee_csv_import_batches_source_file_sha256_check" CHECK ("shopee_csv_import_batches"."source_file_sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "shopee_csv_import_batches_source_file_size_check" CHECK ("shopee_csv_import_batches"."source_file_size_bytes" >= 0),
	CONSTRAINT "shopee_csv_import_batches_source_headers_check" CHECK (jsonb_typeof("shopee_csv_import_batches"."source_headers") = 'array'),
	CONSTRAINT "shopee_csv_import_batches_parser_version_check" CHECK (char_length(trim("shopee_csv_import_batches"."parser_version")) > 0),
	CONSTRAINT "shopee_csv_import_batches_status_check" CHECK ("shopee_csv_import_batches"."status" in (
        'pending',
        'processing',
        'completed',
        'failed'
      )),
	CONSTRAINT "shopee_csv_import_batches_row_counts_check" CHECK (
        "shopee_csv_import_batches"."total_rows" >= 0
        and "shopee_csv_import_batches"."inserted_rows" >= 0
        and "shopee_csv_import_batches"."duplicate_rows" >= 0
        and "shopee_csv_import_batches"."attributed_rows" >= 0
        and "shopee_csv_import_batches"."unattributed_rows" >= 0
        and "shopee_csv_import_batches"."awaiting_classification_rows" >= 0
        and "shopee_csv_import_batches"."rejected_rows" >= 0
      ),
	CONSTRAINT "shopee_csv_import_batches_completion_check" CHECK (
        (
          "shopee_csv_import_batches"."status" in ('completed', 'failed')
          and "shopee_csv_import_batches"."completed_at" is not null
        )
        or
        (
          "shopee_csv_import_batches"."status" in ('pending', 'processing')
          and "shopee_csv_import_batches"."completed_at" is null
        )
      ),
	CONSTRAINT "shopee_csv_import_batches_error_check" CHECK (
        (
          "shopee_csv_import_batches"."status" = 'failed'
          and nullif(trim("shopee_csv_import_batches"."error_message"), '') is not null
        )
        or
        (
          "shopee_csv_import_batches"."status" <> 'failed'
          and "shopee_csv_import_batches"."error_message" is null
        )
      )
);
--> statement-breakpoint
CREATE TABLE "shopee_csv_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"source_row_number" integer NOT NULL,
	"row_fingerprint_sha256" text NOT NULL,
	"raw_row" jsonb NOT NULL,
	"external_order_id" text,
	"checkout_id" text,
	"order_status" text,
	"ordered_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"clicked_at" timestamp with time zone,
	"shop_id" text,
	"item_id" text,
	"model_id" text,
	"promotion_id" text,
	"quantity" integer,
	"order_value" numeric(20, 5),
	"refunded_amount" numeric(20, 5),
	"total_product_commission" numeric(20, 5),
	"total_order_commission" numeric(20, 5),
	"net_affiliate_commission" numeric(20, 5),
	"linked_product_status" text,
	"source_sub_id1" text,
	"source_sub_id2" text,
	"source_sub_id3" text,
	"source_sub_id4" text,
	"source_sub_id5" text,
	"channel" text,
	"processing_status" text DEFAULT 'pending' NOT NULL,
	"tracking_link_id" uuid,
	"publisher_id" uuid,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shopee_csv_rows_batch_row_unique" UNIQUE("batch_id","source_row_number"),
	CONSTRAINT "shopee_csv_rows_fingerprint_unique" UNIQUE("row_fingerprint_sha256"),
	CONSTRAINT "shopee_csv_rows_source_row_check" CHECK ("shopee_csv_rows"."source_row_number" >= 2),
	CONSTRAINT "shopee_csv_rows_fingerprint_check" CHECK ("shopee_csv_rows"."row_fingerprint_sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "shopee_csv_rows_raw_row_check" CHECK (jsonb_typeof("shopee_csv_rows"."raw_row") = 'object'),
	CONSTRAINT "shopee_csv_rows_quantity_check" CHECK (
        "shopee_csv_rows"."quantity" is null
        or "shopee_csv_rows"."quantity" >= 0
      ),
	CONSTRAINT "shopee_csv_rows_processing_status_check" CHECK ("shopee_csv_rows"."processing_status" in (
        'pending',
        'unattributed',
        'awaiting_classification',
        'ready_for_conversion',
        'rejected'
      )),
	CONSTRAINT "shopee_csv_rows_attribution_pair_check" CHECK (
        (
          "shopee_csv_rows"."tracking_link_id" is null
          and "shopee_csv_rows"."publisher_id" is null
        )
        or
        (
          "shopee_csv_rows"."tracking_link_id" is not null
          and "shopee_csv_rows"."publisher_id" is not null
        )
      ),
	CONSTRAINT "shopee_csv_rows_status_attribution_check" CHECK (
        (
          "shopee_csv_rows"."processing_status" in (
            'awaiting_classification',
            'ready_for_conversion'
          )
          and "shopee_csv_rows"."source_sub_id1" is not null
          and "shopee_csv_rows"."tracking_link_id" is not null
          and "shopee_csv_rows"."publisher_id" is not null
        )
        or
        (
          "shopee_csv_rows"."processing_status" in (
            'pending',
            'unattributed',
            'rejected'
          )
          and "shopee_csv_rows"."tracking_link_id" is null
          and "shopee_csv_rows"."publisher_id" is null
        )
      ),
	CONSTRAINT "shopee_csv_rows_rejection_check" CHECK (
        (
          "shopee_csv_rows"."processing_status" = 'rejected'
          and nullif(
            trim("shopee_csv_rows"."rejection_reason"),
            ''
          ) is not null
        )
        or
        (
          "shopee_csv_rows"."processing_status" <> 'rejected'
          and "shopee_csv_rows"."rejection_reason" is null
        )
      )
);
--> statement-breakpoint
ALTER TABLE "shopee_csv_rows" ADD CONSTRAINT "shopee_csv_rows_batch_id_shopee_csv_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."shopee_csv_import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopee_csv_rows" ADD CONSTRAINT "shopee_csv_rows_tracking_owner_fk" FOREIGN KEY ("tracking_link_id","publisher_id") REFERENCES "public"."tracking_links"("id","publisher_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shopee_csv_import_batches_status_created_at_idx" ON "shopee_csv_import_batches" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "shopee_csv_rows_batch_idx" ON "shopee_csv_rows" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "shopee_csv_rows_order_idx" ON "shopee_csv_rows" USING btree ("external_order_id");--> statement-breakpoint
CREATE INDEX "shopee_csv_rows_sub_id1_idx" ON "shopee_csv_rows" USING btree ("source_sub_id1");--> statement-breakpoint
CREATE INDEX "shopee_csv_rows_status_idx" ON "shopee_csv_rows" USING btree ("processing_status");--> statement-breakpoint

ALTER TABLE "public"."shopee_csv_import_batches"
ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE "public"."shopee_csv_rows"
ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

REVOKE ALL PRIVILEGES
ON TABLE "public"."shopee_csv_import_batches"
FROM PUBLIC;
--> statement-breakpoint

REVOKE ALL PRIVILEGES
ON TABLE "public"."shopee_csv_import_batches"
FROM anon;
--> statement-breakpoint

REVOKE ALL PRIVILEGES
ON TABLE "public"."shopee_csv_import_batches"
FROM authenticated;
--> statement-breakpoint

REVOKE ALL PRIVILEGES
ON TABLE "public"."shopee_csv_rows"
FROM PUBLIC;
--> statement-breakpoint

REVOKE ALL PRIVILEGES
ON TABLE "public"."shopee_csv_rows"
FROM anon;
--> statement-breakpoint

REVOKE ALL PRIVILEGES
ON TABLE "public"."shopee_csv_rows"
FROM authenticated;
