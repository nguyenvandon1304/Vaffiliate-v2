ALTER TABLE "shopee_csv_import_batches" ADD COLUMN "source" text DEFAULT 'manual_csv' NOT NULL;--> statement-breakpoint
ALTER TABLE "shopee_csv_rows" ADD COLUMN "source" text DEFAULT 'manual_csv' NOT NULL;--> statement-breakpoint
CREATE INDEX "shopee_csv_import_batches_source_created_at_idx" ON "shopee_csv_import_batches" USING btree ("source","created_at");--> statement-breakpoint
CREATE INDEX "shopee_csv_rows_source_idx" ON "shopee_csv_rows" USING btree ("source");--> statement-breakpoint
ALTER TABLE "shopee_csv_import_batches" ADD CONSTRAINT "shopee_csv_import_batches_source_check" CHECK ("shopee_csv_import_batches"."source" in (
        'manual_csv',
        'addlivetag_api',
        'official_shopee_api'
      ));--> statement-breakpoint
ALTER TABLE "shopee_csv_rows" ADD CONSTRAINT "shopee_csv_rows_source_check" CHECK ("shopee_csv_rows"."source" in (
        'manual_csv',
        'addlivetag_api',
        'official_shopee_api'
      ));
