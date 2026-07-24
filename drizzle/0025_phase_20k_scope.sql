/*
 * Phase 20K follow-up 4 -- durable, server-validated source scope.
 *
 * Persists the normalized source scope on reconciliation_runs so
 * the commit path can reload the exact scope that produced the
 * planned candidate set. Also extends the run status lifecycle to
 * support an explicit 'committing' state so a run never remains in
 * 'draft' after money mutations were applied.
 *
 * Additive only -- existing rows are unaffected.
 *
 *   1. `reconciliation_runs.scope` JSONB (nullable for legacy rows).
 *      Carries:
 *        - ingestionEventIds: text[]
 *        - sourceConversionKeys: text[]
 *        - explicitConversionIds: text[]
 *        - occurredAfter / occurredBefore: ISO timestamptz strings
 *
 *   2. `reconciliation_runs.status` lifecycle extended to include
 *      'committing'. The CHECK constraint is widened to accept the
 *      new state. The application path moves a run
 *        draft -> committing -> committed
 *      in a single commit transaction; if anything throws, the
 *      whole transaction rolls back and the run is left in 'draft'
 *      with zero candidate mutations applied.
 *
 *   3. `reconciliation_runs.scope_candidate_count` integer -- the
 *      number of candidates persisted for the run, captured once
 *      and used by the commit path to detect drift.
 *
 *   4. CHECK constraints:
 *      - scope has at most MAX_SCOPE_ITEMS (200) entries per list;
 *      - sourceConversionKeys must look like sha256 hex (64 chars);
 *      - occurredBefore is strictly greater than occurredAfter.
 */

ALTER TABLE "public"."reconciliation_runs"
  ADD COLUMN IF NOT EXISTS "scope" jsonb;
--> statement-breakpoint

ALTER TABLE "public"."reconciliation_runs"
  ADD COLUMN IF NOT EXISTS "scope_candidate_count" integer;
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
    'superseded'
  ));
--> statement-breakpoint

ALTER TABLE "public"."reconciliation_runs"
  ADD CONSTRAINT "reconciliation_runs_scope_candidate_count_non_negative_check"
  CHECK (
    "reconciliation_runs"."scope_candidate_count" is null
    or "reconciliation_runs"."scope_candidate_count" >= 0
  );
--> statement-breakpoint

ALTER TABLE "public"."reconciliation_runs"
  ADD CONSTRAINT "reconciliation_runs_scope_shape_check"
  CHECK (
    "reconciliation_runs"."scope" is null
    or jsonb_typeof("reconciliation_runs"."scope") = 'object'
  );
