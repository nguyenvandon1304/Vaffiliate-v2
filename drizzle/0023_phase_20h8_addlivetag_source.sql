-- Phase 20H.8 -- Addlivetag Report Source Adapter.
--
-- Extend the existing Shopee staging pipeline so a non-CSV report
-- source (initially `addlivetag_api`, with `official_shopee_api`
-- reserved for a later phase) can feed into the same
-- `shopee_csv_import_batches` and `shopee_csv_rows` tables without
-- creating a second staging pipeline.
--
-- This migration is purely additive:
--
--   * `shopee_csv_import_batches.source` -- text, default 'manual_csv',
--     check constraint enumerating the three forward-compatible
--     source values.
--   * `shopee_csv_rows.source` -- text, default 'manual_csv', same
--     check constraint.
--
-- Existing rows pick up the default. Existing Phase 20G / Phase 20H.x
-- code paths that INSERT into these tables without specifying a
-- `source` column will still succeed because the column is nullable
-- only as a fallback -- the default is applied at insert time.
--
-- The check constraint is intentionally permissive of future sources
-- so a later `official_shopee_api` adapter can reuse the same
-- pipeline without another migration.

ALTER TABLE "shopee_csv_import_batches"
  ADD COLUMN "source" text NOT NULL DEFAULT 'manual_csv';
--> statement-breakpoint

ALTER TABLE "shopee_csv_import_batches"
  ADD CONSTRAINT "shopee_csv_import_batches_source_check"
  CHECK ("shopee_csv_import_batches"."source" in (
    'manual_csv',
    'addlivetag_api',
    'official_shopee_api'
  ));
--> statement-breakpoint

ALTER TABLE "shopee_csv_rows"
  ADD COLUMN "source" text NOT NULL DEFAULT 'manual_csv';
--> statement-breakpoint

ALTER TABLE "shopee_csv_rows"
  ADD CONSTRAINT "shopee_csv_rows_source_check"
  CHECK ("shopee_csv_rows"."source" in (
    'manual_csv',
    'addlivetag_api',
    'official_shopee_api'
  ));
--> statement-breakpoint

CREATE INDEX "shopee_csv_rows_source_idx"
  ON "shopee_csv_rows" USING btree ("source");
--> statement-breakpoint

CREATE INDEX "shopee_csv_import_batches_source_created_at_idx"
  ON "shopee_csv_import_batches" USING btree ("source","created_at");
