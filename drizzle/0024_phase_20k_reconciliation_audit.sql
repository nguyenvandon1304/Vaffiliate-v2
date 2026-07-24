/*
 * Phase 20K follow-up 2 -- durable reconciliation audit trail + run
 * scoping (additive only).
 *
 * Introduces three tables required by the follow-up 2 money-safety
 * blockers:
 *
 *   1. `reconciliation_audit_events` (Phase 20K v1, see 0024 v1)
 *      -- extended with `run_candidate_id` and a partial UNIQUE
 *      index on that column.
 *   2. `reconciliation_runs` (Phase 20K follow-up 2) -- a
 *      server-generated bounded candidate set produced by dry-run
 *      and consumed by commit. Carries the closed policy version +
 *      the authenticated actor who created the run + a SHA-256
 *      fingerprint of the candidate set.
 *   3. `reconciliation_run_candidates` (Phase 20K follow-up 2) --
 *      pins the exact candidate set the run plans against. The
 *      UNIQUE constraint on `(run_id, conversion_id)` is the
 *      durable boundary for the "same-run replay is a true no-op"
 *      rule.
 *
 * Strict invariants baked into the schema:
 *
 *   A. `idempotency_key` is the FULL 64-character lowercase SHA-256
 *      hex digest produced by
 *      `buildReconciliationIdempotencyKey(...)`.
 *
 *   B. UNIQUE INDEX `reconciliation_audit_events_network_idempotency_key_unique`
 *      on `(network, idempotency_key)` enforces DB-level idempotency
 *      for the per-decision key.
 *
 *   C. UNIQUE INDEX `reconciliation_audit_events_run_candidate_id_unique`
 *      on `(run_candidate_id)` (partial: WHERE run_candidate_id IS
 *      NOT NULL) enforces DB-level idempotency for "same run
 *      candidate produces at most one applied audit event".
 *
 *   D. UNIQUE INDEX `reconciliation_run_candidates_run_id_conversion_id_unique`
 *      on `(run_id, conversion_id)` is the durable boundary for
 *      "same run cannot plan the same conversion twice".
 *
 *   E. CHECK constraints enforce:
 *      - closed enums for `network` / `decision` / status / actor,
 *      - non-negative money values,
 *      - `network_commission = user_cashback + platform_profit`
 *        (matches the conversion row invariant),
 *      - `previous_status <> next_status` (no-op transitions are
 *        refused at the schema level too),
 *      - `next_status <> 'paid'` and `intended_next_status <>
 *        'paid'` so a Phase 20K run can never stamp the terminal
 *        `paid` state through either table.
 *
 *   F. RLS is enabled on all three tables; no policies are granted
 *      and all privileges are revoked from PUBLIC / anon /
 *      authenticated. The server uses the service-role DB client
 *      which bypasses RLS.
 *
 * Out of scope (explicit):
 *
 *   - payout / wallet / ledger writes.
 *   - external settlement processing.
 *   - a generic "admin_audit_log" merger; the existing
 *     recordAdminAction() sink continues to exist as an
 *     admin-activity surface and remains a no-op until a future
 *     phase replaces it with a real sink.
 */

CREATE TABLE "reconciliation_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"network" text NOT NULL,
	"source_conversion_key" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"conversion_id" uuid NOT NULL,
	"previous_status" text NOT NULL,
	"next_status" text NOT NULL,
	"decision" text NOT NULL,
	"reason_code" text NOT NULL,
	"human_reason" text NOT NULL,
	"network_commission" bigint NOT NULL,
	"user_cashback" bigint NOT NULL,
	"platform_profit" bigint NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_user_id" uuid,
	"actor_role" text,
	"reconciliation_run_id" uuid NOT NULL,
	"run_candidate_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reconciliation_audit_events_network_idempotency_key_unique" UNIQUE("network","idempotency_key"),
	CONSTRAINT "reconciliation_audit_events_network_check" CHECK ("reconciliation_audit_events"."network" in (
        'shopee',
        'manual'
      )),
	CONSTRAINT "reconciliation_audit_events_network_not_blank_check" CHECK (char_length(trim("reconciliation_audit_events"."network")) > 0),
	CONSTRAINT "reconciliation_audit_events_source_conversion_key_shape_check" CHECK ("reconciliation_audit_events"."source_conversion_key" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "reconciliation_audit_events_idempotency_key_shape_check" CHECK ("reconciliation_audit_events"."idempotency_key" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "reconciliation_audit_events_conversion_id_not_blank_check" CHECK ("reconciliation_audit_events"."conversion_id" is not null),
	CONSTRAINT "reconciliation_audit_events_previous_status_check" CHECK ("reconciliation_audit_events"."previous_status" in (
        'pending',
        'approved',
        'rejected',
        'payable',
        'paid'
      )),
	CONSTRAINT "reconciliation_audit_events_next_status_check" CHECK ("reconciliation_audit_events"."next_status" in (
        'pending',
        'approved',
        'rejected',
        'payable',
        'paid'
      )),
	CONSTRAINT "reconciliation_audit_events_decision_check" CHECK ("reconciliation_audit_events"."decision" in (
        'approve',
        'reject',
        'mark_payable',
        'mark_paid',
        'reverse_to_pending'
      )),
	CONSTRAINT "reconciliation_audit_events_reason_code_not_blank_check" CHECK (char_length(trim("reconciliation_audit_events"."reason_code")) > 0),
	CONSTRAINT "reconciliation_audit_events_human_reason_not_blank_check" CHECK (char_length(trim("reconciliation_audit_events"."human_reason")) > 0),
	CONSTRAINT "reconciliation_audit_events_no_paid_by_phase_20k_check" CHECK ("reconciliation_audit_events"."next_status" <> 'paid'),
	CONSTRAINT "reconciliation_audit_events_previous_next_status_must_differ_check" CHECK ("reconciliation_audit_events"."previous_status" <> "reconciliation_audit_events"."next_status"),
	CONSTRAINT "reconciliation_audit_events_network_commission_non_negative_check" CHECK ("reconciliation_audit_events"."network_commission" >= 0),
	CONSTRAINT "reconciliation_audit_events_user_cashback_non_negative_check" CHECK ("reconciliation_audit_events"."user_cashback" >= 0),
	CONSTRAINT "reconciliation_audit_events_platform_profit_non_negative_check" CHECK ("reconciliation_audit_events"."platform_profit" >= 0),
	CONSTRAINT "reconciliation_audit_events_commission_allocation_check" CHECK ("reconciliation_audit_events"."network_commission" = "reconciliation_audit_events"."user_cashback" + "reconciliation_audit_events"."platform_profit"),
	CONSTRAINT "reconciliation_audit_events_actor_kind_check" CHECK ("reconciliation_audit_events"."actor_kind" in (
        'admin',
        'system'
      )),
	CONSTRAINT "reconciliation_audit_events_actor_consistency_check" CHECK (
        (
          "reconciliation_audit_events"."actor_kind" = 'admin'
          and "reconciliation_audit_events"."actor_user_id" is not null
          and "reconciliation_audit_events"."actor_role" in ('admin', 'super_admin')
        )
        or
        (
          "reconciliation_audit_events"."actor_kind" = 'system'
          and "reconciliation_audit_events"."actor_user_id" is null
          and "reconciliation_audit_events"."actor_role" is null
        )
      )
);
--> statement-breakpoint

CREATE INDEX "reconciliation_audit_events_conversion_id_idx" ON "reconciliation_audit_events" USING btree ("conversion_id");
--> statement-breakpoint

CREATE INDEX "reconciliation_audit_events_reconciliation_run_id_idx" ON "reconciliation_audit_events" USING btree ("reconciliation_run_id");
--> statement-breakpoint

CREATE INDEX "reconciliation_audit_events_created_at_idx" ON "reconciliation_audit_events" USING btree ("created_at");
--> statement-breakpoint

ALTER TABLE "public"."reconciliation_audit_events" ADD COLUMN IF NOT EXISTS "run_candidate_id" uuid;
--> statement-breakpoint

CREATE UNIQUE INDEX "reconciliation_audit_events_run_candidate_id_unique" ON "reconciliation_audit_events" USING btree ("run_candidate_id") WHERE "reconciliation_audit_events"."run_candidate_id" IS NOT NULL;
--> statement-breakpoint

ALTER TABLE "public"."reconciliation_audit_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

REVOKE ALL PRIVILEGES ON TABLE "public"."reconciliation_audit_events" FROM PUBLIC;
--> statement-breakpoint

REVOKE ALL PRIVILEGES ON TABLE "public"."reconciliation_audit_events" FROM anon;
--> statement-breakpoint

REVOKE ALL PRIVILEGES ON TABLE "public"."reconciliation_audit_events" FROM authenticated;
--> statement-breakpoint

CREATE TABLE "reconciliation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"network" text NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_by_role" text NOT NULL,
	"policy_version" integer NOT NULL,
	"candidate_fingerprint" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"committed_at" timestamp with time zone,
	CONSTRAINT "reconciliation_runs_network_check" CHECK ("reconciliation_runs"."network" in (
        'shopee',
        'manual'
      )),
	CONSTRAINT "reconciliation_runs_status_check" CHECK ("reconciliation_runs"."status" in (
        'draft',
        'committed',
        'superseded'
      )),
	CONSTRAINT "reconciliation_runs_created_by_role_check" CHECK ("reconciliation_runs"."created_by_role" in (
        'admin',
        'super_admin'
      )),
	CONSTRAINT "reconciliation_runs_policy_version_positive_check" CHECK ("reconciliation_runs"."policy_version" > 0),
	CONSTRAINT "reconciliation_runs_candidate_fingerprint_shape_check" CHECK (char_length(trim("reconciliation_runs"."candidate_fingerprint")) > 0)
);
--> statement-breakpoint

CREATE INDEX "reconciliation_runs_created_at_idx" ON "reconciliation_runs" USING btree ("created_at");
--> statement-breakpoint

CREATE INDEX "reconciliation_runs_status_idx" ON "reconciliation_runs" USING btree ("status");
--> statement-breakpoint

ALTER TABLE "public"."reconciliation_runs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

REVOKE ALL PRIVILEGES ON TABLE "public"."reconciliation_runs" FROM PUBLIC;
--> statement-breakpoint

REVOKE ALL PRIVILEGES ON TABLE "public"."reconciliation_runs" FROM anon;
--> statement-breakpoint

REVOKE ALL PRIVILEGES ON TABLE "public"."reconciliation_runs" FROM authenticated;
--> statement-breakpoint

CREATE TABLE "reconciliation_run_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"conversion_id" uuid NOT NULL,
	"source_conversion_key" text,
	"network" text NOT NULL,
	"expected_previous_status" text NOT NULL,
	"intended_next_status" text NOT NULL,
	"planned_reason_code" text NOT NULL,
	"planned_money_network_commission" bigint NOT NULL,
	"planned_money_user_cashback" bigint NOT NULL,
	"planned_money_platform_profit" bigint NOT NULL,
	"planned_idempotency_key" text NOT NULL,
	"provenance_fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reconciliation_run_candidates_run_id_conversion_id_unique" UNIQUE("run_id","conversion_id"),
	CONSTRAINT "reconciliation_run_candidates_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."reconciliation_runs"("id") ON DELETE cascade,
	CONSTRAINT "reconciliation_run_candidates_network_check" CHECK ("reconciliation_run_candidates"."network" in (
        'shopee',
        'manual'
      )),
	CONSTRAINT "reconciliation_run_candidates_expected_previous_status_check" CHECK ("reconciliation_run_candidates"."expected_previous_status" in (
        'pending',
        'approved',
        'rejected',
        'payable',
        'paid'
      )),
	CONSTRAINT "reconciliation_run_candidates_intended_next_status_check" CHECK ("reconciliation_run_candidates"."intended_next_status" in (
        'pending',
        'approved',
        'rejected',
        'payable',
        'paid'
      )),
	CONSTRAINT "reconciliation_run_candidates_previous_next_differ_check" CHECK ("reconciliation_run_candidates"."expected_previous_status" <> "reconciliation_run_candidates"."intended_next_status"),
	CONSTRAINT "reconciliation_run_candidates_intended_next_status_not_paid_by_phase_20k_check" CHECK ("reconciliation_run_candidates"."intended_next_status" <> 'paid'),
	CONSTRAINT "reconciliation_run_candidates_planned_money_non_negative_check" CHECK ("reconciliation_run_candidates"."planned_money_network_commission" >= 0),
	CONSTRAINT "reconciliation_run_candidates_planned_idempotency_key_shape_check" CHECK ("reconciliation_run_candidates"."planned_idempotency_key" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "reconciliation_run_candidates_provenance_fingerprint_shape_check" CHECK (char_length(trim("reconciliation_run_candidates"."provenance_fingerprint")) > 0)
);
--> statement-breakpoint

CREATE INDEX "reconciliation_run_candidates_conversion_id_idx" ON "reconciliation_run_candidates" USING btree ("conversion_id");
--> statement-breakpoint

ALTER TABLE "public"."reconciliation_run_candidates" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

REVOKE ALL PRIVILEGES ON TABLE "public"."reconciliation_run_candidates" FROM PUBLIC;
--> statement-breakpoint

REVOKE ALL PRIVILEGES ON TABLE "public"."reconciliation_run_candidates" FROM anon;
--> statement-breakpoint

REVOKE ALL PRIVILEGES ON TABLE "public"."reconciliation_run_candidates" FROM authenticated;
--> statement-breakpoint
