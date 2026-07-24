/*
 * Phase 20K checkpoint 4D2 -- durable, resumable run lifecycle
 * with per-candidate processing outcomes.
 *
 * Extends the reconciliation run lifecycle from
 *   draft -> committing -> committed
 * to the closed lifecycle
 *   draft -> committing -> committed
 *           committing -> failed
 * and adds durable, per-candidate processing outcomes to
 * reconciliation_run_candidates so a partial commit can be
 * safely resumed (or marked terminal) without re-running
 * already-completed candidates.
 *
 * Additive only. Existing rows are unaffected.
 */

ALTER TABLE "public"."reconciliation_run_candidates"
  ADD COLUMN IF NOT EXISTS "processing_outcome" text NOT NULL DEFAULT 'pending';
--> statement-breakpoint

ALTER TABLE "public"."reconciliation_run_candidates"
  ADD COLUMN IF NOT EXISTS "processing_completed_at" timestamp with time zone;
--> statement-breakpoint

ALTER TABLE "public"."reconciliation_run_candidates"
  ADD COLUMN IF NOT EXISTS "processing_reason_code" text;
--> statement-breakpoint

ALTER TABLE "public"."reconciliation_run_candidates"
  DROP CONSTRAINT IF EXISTS "reconciliation_run_candidates_processing_outcome_check";
--> statement-breakpoint

ALTER TABLE "public"."reconciliation_run_candidates"
  ADD CONSTRAINT "reconciliation_run_candidates_processing_outcome_check"
  CHECK ("reconciliation_run_candidates"."processing_outcome" in (
    'pending',
    'applied',
    'skipped/idempotent',
    'skipped/stale',
    -- Phase 20K checkpoint 4F1B -- closed outcome for a
    -- hard policy block at commit time. Distinct from
    -- 'skipped/idempotent' (replay / no-op) and
    -- 'skipped/stale' (4B evidence drift). Used when the
    -- commit-time defense-in-depth refuses a transition
    -- whose intended_next_status is 'payable' because no
    -- real durable upstream settlement producer exists;
    -- see the 4F1B guard in
    -- `src/server/reconciliation/reconciliation.repository.ts`.
    -- `processing_reason_code` carries the distinct closed
    -- code `rejected_unverified_settlement_evidence` so
    -- operators can trace the block in audit.
    'skipped/blocked',
    'failed'
  ));
--> statement-breakpoint

ALTER TABLE "public"."reconciliation_runs"
  ADD COLUMN IF NOT EXISTS "failed_at" timestamp with time zone;
--> statement-breakpoint

ALTER TABLE "public"."reconciliation_runs"
  ADD COLUMN IF NOT EXISTS "failed_reason" text;
--> statement-breakpoint

ALTER TABLE "public"."reconciliation_runs"
  DROP CONSTRAINT IF EXISTS "reconciliation_runs_status_check";
--> statement-breakpoint

ALTER TABLE "public"."reconciliation_runs"
  ADD CONSTRAINT "reconciliation_runs_status_check"
  CHECK ("reconciliation_runs"."status" in (
    'draft',
    'committing',
    'committed',
    'failed',
    'superseded'
  ));
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "reconciliation_run_candidates_processing_outcome_idx"
  ON "public"."reconciliation_run_candidates"
  USING btree ("processing_outcome");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "reconciliation_run_candidates_run_id_processing_outcome_idx"
  ON "public"."reconciliation_run_candidates"
  USING btree ("run_id", "processing_outcome");
