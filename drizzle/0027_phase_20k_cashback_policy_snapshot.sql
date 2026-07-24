/*
 * Phase 20K checkpoint 1 -- immutable cashback policy evidence.
 *
 * Existing rows remain nullable because their historical policy cannot be
 * inferred safely. New Shopee ingestion and reconciliation paths persist the
 * exact basis-points snapshot and fail closed when it is absent.
 */

ALTER TABLE "public"."conversions"
  ADD COLUMN IF NOT EXISTS "cashback_share_bps_snapshot" integer;
--> statement-breakpoint

ALTER TABLE "public"."reconciliation_run_candidates"
  ADD COLUMN IF NOT EXISTS "planned_cashback_share_bps" integer;
--> statement-breakpoint

ALTER TABLE "public"."reconciliation_audit_events"
  ADD COLUMN IF NOT EXISTS "cashback_share_bps_snapshot" integer;
--> statement-breakpoint

ALTER TABLE "public"."conversions"
  ADD CONSTRAINT "conversions_cashback_share_bps_snapshot_range_check"
  CHECK (
    "cashback_share_bps_snapshot" is null
    or "cashback_share_bps_snapshot" between 0 and 10000
  );
--> statement-breakpoint

ALTER TABLE "public"."conversions"
  ADD CONSTRAINT "conversions_cashback_policy_allocation_check"
  CHECK (
    "cashback_share_bps_snapshot" is null
    or "user_cashback" = floor(
      "network_commission"::numeric * "cashback_share_bps_snapshot" / 10000
    )::bigint
  );
--> statement-breakpoint

ALTER TABLE "public"."reconciliation_run_candidates"
  ADD CONSTRAINT "reconciliation_run_candidates_cashback_bps_range_check"
  CHECK (
    "planned_cashback_share_bps" is null
    or "planned_cashback_share_bps" between 0 and 10000
  );
--> statement-breakpoint

ALTER TABLE "public"."reconciliation_run_candidates"
  ADD CONSTRAINT "reconciliation_run_candidates_cashback_policy_allocation_check"
  CHECK (
    "planned_cashback_share_bps" is null
    or "planned_money_user_cashback" = floor(
      "planned_money_network_commission"::numeric
      * "planned_cashback_share_bps"
      / 10000
    )::bigint
  );
--> statement-breakpoint

ALTER TABLE "public"."reconciliation_audit_events"
  ADD CONSTRAINT "reconciliation_audit_events_cashback_bps_range_check"
  CHECK (
    "cashback_share_bps_snapshot" is null
    or "cashback_share_bps_snapshot" between 0 and 10000
  );
--> statement-breakpoint

ALTER TABLE "public"."reconciliation_audit_events"
  ADD CONSTRAINT "reconciliation_audit_events_cashback_policy_allocation_check"
  CHECK (
    "cashback_share_bps_snapshot" is null
    or "user_cashback" = floor(
      "network_commission"::numeric * "cashback_share_bps_snapshot" / 10000
    )::bigint
  );
