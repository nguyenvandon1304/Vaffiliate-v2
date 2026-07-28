/*
 * Phase 20M.0 -- payout domain foundation.
 *
 * Money remains integer VND in PostgreSQL. Every authenticated JSON/view
 * projection casts money to decimal text before serialization.
 */

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
--> statement-breakpoint

CREATE TABLE "public"."payout_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "payout_account_id" uuid NOT NULL,
  "status" text DEFAULT 'requested' NOT NULL,
  "currency" text DEFAULT 'VND' NOT NULL,
  "idempotency_key" uuid NOT NULL,
  "idempotency_operation" text DEFAULT 'create' NOT NULL,
  "request_payload_fingerprint" text NOT NULL,
  "requested_amount" bigint NOT NULL,
  "reserved_amount" bigint NOT NULL,
  "approved_amount" bigint DEFAULT 0 NOT NULL,
  "paid_amount" bigint DEFAULT 0 NOT NULL,
  "released_amount" bigint DEFAULT 0 NOT NULL,
  "item_count" integer NOT NULL,
  "payout_method_snapshot" text NOT NULL,
  "provider_snapshot" text NOT NULL,
  "account_name_snapshot" text NOT NULL,
  "account_number_snapshot" text NOT NULL,
  "account_number_last4_snapshot" text NOT NULL,
  "payout_account_status_snapshot" text NOT NULL,
  "destination_fingerprint" text NOT NULL,
  "processor_reference" text,
  "outcome_reference" text,
  "payment_reference" text,
  "nonpayment_reference" text,
  "owner_reason_code" text,
  "internal_reason_code" text,
  "internal_reason" text,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "approved_at" timestamp with time zone,
  "processing_at" timestamp with time zone,
  "review_required_at" timestamp with time zone,
  "paid_at" timestamp with time zone,
  "rejected_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "failed_at" timestamp with time zone,
  CONSTRAINT "payout_requests_user_operation_idempotency_key_unique" UNIQUE("user_id", "idempotency_operation", "idempotency_key"),
  CONSTRAINT "payout_requests_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE restrict,
  CONSTRAINT "payout_requests_payout_account_id_payout_accounts_id_fk" FOREIGN KEY ("payout_account_id") REFERENCES "public"."payout_accounts"("id") ON DELETE restrict,
  CONSTRAINT "payout_requests_status_check" CHECK ("status" in ('requested', 'approved', 'processing', 'review_required', 'paid', 'rejected', 'cancelled', 'failed')),
  CONSTRAINT "payout_requests_currency_check" CHECK ("currency" = 'VND'),
  CONSTRAINT "payout_requests_idempotency_operation_check" CHECK ("idempotency_operation" = 'create'),
  CONSTRAINT "payout_requests_amounts_check" CHECK (
    "requested_amount" > 0
    and "reserved_amount" = "requested_amount"
    and "approved_amount" >= 0
    and "paid_amount" >= 0
    and "released_amount" >= 0
    and "paid_amount" + "released_amount" <= "reserved_amount"
    and not ("paid_amount" > 0 and "released_amount" > 0)
  ),
  CONSTRAINT "payout_requests_item_count_check" CHECK ("item_count" between 1 and 200),
  CONSTRAINT "payout_requests_snapshot_check" CHECK (
    "payout_method_snapshot" = 'bank'
    and "payout_account_status_snapshot" = 'verified'
    and char_length(trim("provider_snapshot")) > 0
    and char_length(trim("account_name_snapshot")) > 0
    and char_length(trim("account_number_snapshot")) > 0
    and char_length("account_number_last4_snapshot") between 1 and 4
  ),
  CONSTRAINT "payout_requests_fingerprint_check" CHECK (
    "request_payload_fingerprint" ~ '^[a-f0-9]{64}$'
    and "destination_fingerprint" ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT "payout_requests_version_check" CHECK ("version" > 0),
  CONSTRAINT "payout_requests_owner_reason_code_check" CHECK (
    "owner_reason_code" is null
    or "owner_reason_code" in ('user_cancelled', 'request_rejected', 'payment_under_review', 'payment_not_completed')
  ),
  CONSTRAINT "payout_requests_reference_shape_check" CHECK (
    ("processor_reference" is null or (char_length(trim("processor_reference")) between 1 and 200 and "processor_reference" !~ '[[:cntrl:]]'))
    and ("outcome_reference" is null or (char_length(trim("outcome_reference")) between 1 and 200 and "outcome_reference" !~ '[[:cntrl:]]'))
    and ("payment_reference" is null or (char_length(trim("payment_reference")) between 1 and 200 and "payment_reference" !~ '[[:cntrl:]]'))
    and ("nonpayment_reference" is null or (char_length(trim("nonpayment_reference")) between 1 and 200 and "nonpayment_reference" !~ '[[:cntrl:]]'))
  ),
  CONSTRAINT "payout_requests_state_amount_check" CHECK (
    ("status" in ('requested', 'approved', 'processing', 'review_required') and "paid_amount" = 0 and "released_amount" = 0)
    or ("status" = 'paid' and "paid_amount" = "reserved_amount" and "released_amount" = 0)
    or ("status" in ('rejected', 'cancelled', 'failed') and "paid_amount" = 0 and "released_amount" = "reserved_amount")
  ),
  CONSTRAINT "payout_requests_approved_amount_check" CHECK (
    ("status" in ('requested', 'cancelled') and "approved_amount" = 0)
    or ("status" in ('approved', 'processing', 'review_required', 'paid', 'failed') and "approved_amount" = "reserved_amount")
    or ("status" = 'rejected' and "approved_amount" in (0, "reserved_amount"))
  ),
  CONSTRAINT "payout_requests_state_metadata_check" CHECK (
    ("status" = 'requested' and "owner_reason_code" is null and "approved_at" is null and "processing_at" is null and "review_required_at" is null and "paid_at" is null and "rejected_at" is null and "cancelled_at" is null and "failed_at" is null)
    or ("status" = 'approved' and "owner_reason_code" is null and "approved_at" is not null and "processing_at" is null and "review_required_at" is null and "paid_at" is null and "rejected_at" is null and "cancelled_at" is null and "failed_at" is null)
    or ("status" = 'processing' and "owner_reason_code" is null and "approved_at" is not null and "processing_at" is not null and "review_required_at" is null and "paid_at" is null and "rejected_at" is null and "cancelled_at" is null and "failed_at" is null and "processor_reference" is not null)
    or ("status" = 'review_required' and "owner_reason_code" = 'payment_under_review' and "approved_at" is not null and "processing_at" is not null and "review_required_at" is not null and "paid_at" is null and "rejected_at" is null and "cancelled_at" is null and "failed_at" is null and "processor_reference" is not null and "outcome_reference" is not null)
    or ("status" = 'paid' and "owner_reason_code" is null and "approved_at" is not null and "processing_at" is not null and "paid_at" is not null and "rejected_at" is null and "cancelled_at" is null and "failed_at" is null and "processor_reference" is not null and "payment_reference" is not null)
    or ("status" = 'rejected' and "owner_reason_code" = 'request_rejected' and "processing_at" is null and "review_required_at" is null and "paid_at" is null and "rejected_at" is not null and "cancelled_at" is null and "failed_at" is null)
    or ("status" = 'cancelled' and "owner_reason_code" = 'user_cancelled' and "approved_at" is null and "processing_at" is null and "review_required_at" is null and "paid_at" is null and "rejected_at" is null and "cancelled_at" is not null and "failed_at" is null)
    or ("status" = 'failed' and "owner_reason_code" = 'payment_not_completed' and "approved_at" is not null and "processing_at" is not null and "paid_at" is null and "rejected_at" is null and "cancelled_at" is null and "failed_at" is not null and "processor_reference" is not null and "nonpayment_reference" is not null)
  ),
  CONSTRAINT "payout_requests_timestamp_order_check" CHECK (
    ("approved_at" is null or "approved_at" >= "created_at")
    and ("processing_at" is null or ("approved_at" is not null and "processing_at" >= "approved_at"))
    and ("review_required_at" is null or ("processing_at" is not null and "review_required_at" >= "processing_at"))
    and ("paid_at" is null or ("processing_at" is not null and "paid_at" >= "processing_at"))
    and ("rejected_at" is null or "rejected_at" >= "created_at")
    and ("cancelled_at" is null or "cancelled_at" >= "created_at")
    and ("failed_at" is null or ("processing_at" is not null and "failed_at" >= "processing_at"))
  )
);
--> statement-breakpoint

CREATE INDEX "payout_requests_user_created_at_idx" ON "public"."payout_requests" USING btree ("user_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX "payout_requests_status_created_at_idx" ON "public"."payout_requests" USING btree ("status", "created_at");
--> statement-breakpoint
CREATE INDEX "payout_requests_payout_account_id_idx" ON "public"."payout_requests" USING btree ("payout_account_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "payout_requests_provider_processor_reference_unique" ON "public"."payout_requests" USING btree ("provider_snapshot", "processor_reference") WHERE "processor_reference" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "payout_requests_provider_payment_reference_unique" ON "public"."payout_requests" USING btree ("provider_snapshot", "payment_reference") WHERE "payment_reference" IS NOT NULL;
--> statement-breakpoint

CREATE TABLE "public"."payout_request_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "payout_request_id" uuid NOT NULL,
  "conversion_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "amount" bigint NOT NULL,
  "currency" text DEFAULT 'VND' NOT NULL,
  "conversion_status_snapshot" text NOT NULL,
  "settlement_status_snapshot" text,
  "source_conversion_key_snapshot" text,
  "cashback_share_bps_snapshot" integer,
  "conversion_payable_at_snapshot" timestamp with time zone NOT NULL,
  "reserved_at" timestamp with time zone DEFAULT now() NOT NULL,
  "released_at" timestamp with time zone,
  "paid_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "payout_request_items_request_conversion_unique" UNIQUE("payout_request_id", "conversion_id"),
  CONSTRAINT "payout_request_items_request_id_fk" FOREIGN KEY ("payout_request_id") REFERENCES "public"."payout_requests"("id") ON DELETE restrict,
  CONSTRAINT "payout_request_items_conversion_id_fk" FOREIGN KEY ("conversion_id") REFERENCES "public"."conversions"("id") ON DELETE restrict,
  CONSTRAINT "payout_request_items_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE restrict,
  CONSTRAINT "payout_request_items_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "payout_request_items_currency_check" CHECK ("currency" = 'VND'),
  CONSTRAINT "payout_request_items_status_snapshot_check" CHECK ("conversion_status_snapshot" = 'payable' and ("settlement_status_snapshot" is null or "settlement_status_snapshot" = 'payable')),
  CONSTRAINT "payout_request_items_source_key_check" CHECK ("source_conversion_key_snapshot" is null or "source_conversion_key_snapshot" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "payout_request_items_bps_check" CHECK ("cashback_share_bps_snapshot" is null or "cashback_share_bps_snapshot" between 0 and 10000),
  CONSTRAINT "payout_request_items_lifecycle_check" CHECK (
    not ("released_at" is not null and "paid_at" is not null)
    and ("released_at" is null or "released_at" >= "reserved_at")
    and ("paid_at" is null or "paid_at" >= "reserved_at")
  )
);
--> statement-breakpoint

CREATE UNIQUE INDEX "payout_request_items_conversion_unreleased_unique" ON "public"."payout_request_items" USING btree ("conversion_id") WHERE "released_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "payout_request_items_request_id_idx" ON "public"."payout_request_items" USING btree ("payout_request_id");
--> statement-breakpoint
CREATE INDEX "payout_request_items_user_created_at_idx" ON "public"."payout_request_items" USING btree ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX "payout_request_items_conversion_id_idx" ON "public"."payout_request_items" USING btree ("conversion_id");
--> statement-breakpoint

CREATE TABLE "public"."payout_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "payout_request_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "sequence_no" integer NOT NULL,
  "event_type" text NOT NULL,
  "previous_status" text,
  "next_status" text NOT NULL,
  "actor_kind" text NOT NULL,
  "actor_user_id" uuid,
  "actor_role" text,
  "idempotency_scope" text NOT NULL,
  "idempotency_key" uuid NOT NULL,
  "payload_fingerprint" text NOT NULL,
  "correlation_id" uuid NOT NULL,
  "request_version" integer NOT NULL,
  "requested_amount" bigint NOT NULL,
  "reserved_amount" bigint NOT NULL,
  "approved_amount" bigint NOT NULL,
  "paid_amount" bigint NOT NULL,
  "released_amount" bigint NOT NULL,
  "before_snapshot" jsonb,
  "after_snapshot" jsonb NOT NULL,
  "owner_reason_code" text,
  "internal_reason_code" text,
  "internal_reason" text,
  "evidence_reference" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "payout_events_request_sequence_unique" UNIQUE("payout_request_id", "sequence_no"),
  CONSTRAINT "payout_events_scope_key_unique" UNIQUE("idempotency_scope", "idempotency_key"),
  CONSTRAINT "payout_events_request_id_fk" FOREIGN KEY ("payout_request_id") REFERENCES "public"."payout_requests"("id") ON DELETE restrict,
  CONSTRAINT "payout_events_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE restrict,
  CONSTRAINT "payout_events_sequence_check" CHECK ("sequence_no" > 0),
  CONSTRAINT "payout_events_event_type_check" CHECK ("event_type" in ('request_created', 'request_approved', 'request_rejected', 'request_cancelled', 'processing_started', 'outcome_uncertain', 'payment_confirmed', 'nonpayment_confirmed')),
  CONSTRAINT "payout_events_status_check" CHECK (
    ("event_type" = 'request_created' and "previous_status" is null and "next_status" = 'requested')
    or ("event_type" = 'request_approved' and "previous_status" = 'requested' and "next_status" = 'approved')
    or ("event_type" = 'request_rejected' and "previous_status" in ('requested', 'approved') and "next_status" = 'rejected')
    or ("event_type" = 'request_cancelled' and "previous_status" = 'requested' and "next_status" = 'cancelled')
    or ("event_type" = 'processing_started' and "previous_status" = 'approved' and "next_status" = 'processing')
    or ("event_type" = 'outcome_uncertain' and "previous_status" = 'processing' and "next_status" = 'review_required')
    or ("event_type" = 'payment_confirmed' and "previous_status" in ('processing', 'review_required') and "next_status" = 'paid')
    or ("event_type" = 'nonpayment_confirmed' and "previous_status" in ('processing', 'review_required') and "next_status" = 'failed')
  ),
  CONSTRAINT "payout_events_actor_check" CHECK (
    ("event_type" in ('request_created', 'request_cancelled') and "actor_kind" = 'user' and "actor_user_id" is not null and "actor_role" is null)
    or ("event_type" in ('request_approved', 'request_rejected') and "actor_kind" = 'admin' and "actor_user_id" is not null and "actor_role" in ('admin', 'super_admin'))
    or ("event_type" in ('processing_started', 'outcome_uncertain', 'payment_confirmed', 'nonpayment_confirmed') and "actor_kind" = 'system' and "actor_user_id" is null and "actor_role" is null)
  ),
  CONSTRAINT "payout_events_idempotency_check" CHECK (char_length(trim("idempotency_scope")) > 0 and "payload_fingerprint" ~ '^[a-f0-9]{64}$' and "correlation_id" = "payout_request_id"),
  CONSTRAINT "payout_events_money_check" CHECK ("requested_amount" > 0 and "reserved_amount" = "requested_amount" and "approved_amount" >= 0 and "paid_amount" >= 0 and "released_amount" >= 0),
  CONSTRAINT "payout_events_snapshot_check" CHECK (jsonb_typeof("after_snapshot") = 'object' and ("before_snapshot" is null or jsonb_typeof("before_snapshot") = 'object')),
  CONSTRAINT "payout_events_owner_reason_code_check" CHECK (
    ("event_type" = 'request_cancelled' and "owner_reason_code" = 'user_cancelled')
    or ("event_type" = 'request_rejected' and "owner_reason_code" = 'request_rejected')
    or ("event_type" = 'outcome_uncertain' and "owner_reason_code" = 'payment_under_review')
    or ("event_type" = 'nonpayment_confirmed' and "owner_reason_code" = 'payment_not_completed')
    or ("event_type" in ('request_created', 'request_approved', 'processing_started', 'payment_confirmed') and "owner_reason_code" is null)
  ),
  CONSTRAINT "payout_events_evidence_reference_check" CHECK ("evidence_reference" is null or (char_length(trim("evidence_reference")) between 1 and 200 and "evidence_reference" !~ '[[:cntrl:]]'))
);
--> statement-breakpoint

CREATE INDEX "payout_events_request_sequence_idx" ON "public"."payout_events" USING btree ("payout_request_id", "sequence_no");
--> statement-breakpoint
CREATE INDEX "payout_events_user_created_at_idx" ON "public"."payout_events" USING btree ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX "payout_events_created_at_idx" ON "public"."payout_events" USING btree ("created_at");
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "public"."phase20m_sha256_text"(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public, extensions
AS $$
  SELECT encode(digest(convert_to(p_value, 'UTF8'), 'sha256'), 'hex')
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "public"."phase20m_destination_fingerprint"(
  p_method text,
  p_provider text,
  p_account_name text,
  p_account_number text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public, extensions
AS $$
  SELECT public.phase20m_sha256_text(
    jsonb_build_array(
      trim(p_method),
      trim(p_provider),
      trim(p_account_name),
      regexp_replace(p_account_number, '[[:space:]]', '', 'g')
    )::text
  )
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "public"."phase20m_clean_reference"(p_value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_value text := trim(p_value);
BEGIN
  IF char_length(v_value) NOT BETWEEN 1 AND 200 OR v_value ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_EVIDENCE_REFERENCE_INVALID';
  END IF;
  RETURN v_value;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "public"."phase20m_request_snapshot"(p_request public.payout_requests)
RETURNS jsonb
LANGUAGE sql
STABLE
STRICT
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'status', p_request.status,
    'version', p_request.version,
    'requestedAmountVnd', p_request.requested_amount::text,
    'reservedAmountVnd', p_request.reserved_amount::text,
    'approvedAmountVnd', p_request.approved_amount::text,
    'paidAmountVnd', p_request.paid_amount::text,
    'releasedAmountVnd', p_request.released_amount::text,
    'ownerReasonCode', p_request.owner_reason_code,
    'processorReference', p_request.processor_reference,
    'outcomeReference', p_request.outcome_reference,
    'paymentReference', p_request.payment_reference,
    'nonpaymentReference', p_request.nonpayment_reference,
    'approvedAt', p_request.approved_at,
    'processingAt', p_request.processing_at,
    'reviewRequiredAt', p_request.review_required_at,
    'paidAt', p_request.paid_at,
    'rejectedAt', p_request.rejected_at,
    'cancelledAt', p_request.cancelled_at,
    'failedAt', p_request.failed_at
  )
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "public"."phase20m_response"(
  p_request_id uuid,
  p_event_id uuid,
  p_replayed boolean
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'requestId', r.id,
    'status', e.next_status,
    'currency', r.currency,
    'requestedAmountVnd', e.requested_amount::text,
    'reservedAmountVnd', e.reserved_amount::text,
    'approvedAmountVnd', e.approved_amount::text,
    'paidAmountVnd', e.paid_amount::text,
    'releasedAmountVnd', e.released_amount::text,
    'itemCount', r.item_count,
    'payoutAccount', jsonb_build_object(
      'method', r.payout_method_snapshot,
      'provider', r.provider_snapshot,
      'accountName', r.account_name_snapshot,
      'accountNumberMasked', repeat('*', greatest(0, 4 - char_length(r.account_number_last4_snapshot))) || r.account_number_last4_snapshot
    ),
    'ownerReasonCode', e.owner_reason_code,
    'eventId', e.id,
    'eventCreatedAt', e.created_at,
    'requestCreatedAt', r.created_at,
    'replayed', p_replayed
  )
  FROM public.payout_requests r
  JOIN public.payout_events e ON e.id = p_event_id AND e.payout_request_id = r.id
  WHERE r.id = p_request_id
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "public"."phase20m_validate_item_insert"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_request public.payout_requests%ROWTYPE;
  v_conversion public.conversions%ROWTYPE;
BEGIN
  SELECT * INTO v_request FROM public.payout_requests WHERE id = NEW.payout_request_id;
  IF NOT FOUND OR v_request.status <> 'requested' OR v_request.user_id <> NEW.user_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PAYOUT_ITEM_REQUEST_INVALID';
  END IF;

  SELECT * INTO v_conversion FROM public.conversions WHERE id = NEW.conversion_id;
  IF NOT FOUND
    OR v_conversion.publisher_id <> NEW.user_id
    OR v_conversion.status <> 'payable'
    OR v_conversion.user_cashback <= 0
    OR (v_conversion.settlement_status is not null and v_conversion.settlement_status <> 'payable')
    OR v_conversion.payable_at is null
    OR v_conversion.user_cashback <> NEW.amount
    OR v_conversion.status <> NEW.conversion_status_snapshot
    OR v_conversion.settlement_status is distinct from NEW.settlement_status_snapshot
    OR v_conversion.source_conversion_key is distinct from NEW.source_conversion_key_snapshot
    OR v_conversion.cashback_share_bps_snapshot is distinct from NEW.cashback_share_bps_snapshot
    OR v_conversion.payable_at is distinct from NEW.conversion_payable_at_snapshot
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PAYOUT_ITEM_CONVERSION_INVALID';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER "payout_request_items_validate_insert"
BEFORE INSERT ON "public"."payout_request_items"
FOR EACH ROW EXECUTE FUNCTION "public"."phase20m_validate_item_insert"();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "public"."phase20m_guard_request_mutation"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'PAYOUT_REQUEST_IMMUTABLE';
  END IF;

  IF ROW(
    NEW.id, NEW.user_id, NEW.payout_account_id, NEW.currency,
    NEW.idempotency_key, NEW.idempotency_operation, NEW.request_payload_fingerprint,
    NEW.requested_amount, NEW.reserved_amount, NEW.item_count,
    NEW.payout_method_snapshot, NEW.provider_snapshot,
    NEW.account_name_snapshot, NEW.account_number_snapshot,
    NEW.account_number_last4_snapshot, NEW.payout_account_status_snapshot,
    NEW.destination_fingerprint, NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.id, OLD.user_id, OLD.payout_account_id, OLD.currency,
    OLD.idempotency_key, OLD.idempotency_operation, OLD.request_payload_fingerprint,
    OLD.requested_amount, OLD.reserved_amount, OLD.item_count,
    OLD.payout_method_snapshot, OLD.provider_snapshot,
    OLD.account_name_snapshot, OLD.account_number_snapshot,
    OLD.account_number_last4_snapshot, OLD.payout_account_status_snapshot,
    OLD.destination_fingerprint, OLD.created_at
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'PAYOUT_REQUEST_CORE_IMMUTABLE';
  END IF;

  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PAYOUT_REQUEST_VERSION_INVALID';
  END IF;

  IF NOT (
    (OLD.status = 'requested' and NEW.status in ('approved', 'rejected', 'cancelled'))
    or (OLD.status = 'approved' and NEW.status in ('processing', 'rejected'))
    or (OLD.status = 'processing' and NEW.status in ('review_required', 'paid', 'failed'))
    or (OLD.status = 'review_required' and NEW.status in ('paid', 'failed'))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PAYOUT_INVALID_TRANSITION';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER "payout_requests_prevent_delete"
BEFORE DELETE ON "public"."payout_requests"
FOR EACH ROW EXECUTE FUNCTION "public"."phase20m_guard_request_mutation"();
--> statement-breakpoint
CREATE TRIGGER "payout_requests_enforce_transition"
BEFORE UPDATE ON "public"."payout_requests"
FOR EACH ROW EXECUTE FUNCTION "public"."phase20m_guard_request_mutation"();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "public"."phase20m_guard_item_mutation"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'PAYOUT_ITEM_IMMUTABLE';
  END IF;

  IF ROW(
    NEW.id, NEW.payout_request_id, NEW.conversion_id, NEW.user_id,
    NEW.amount, NEW.currency, NEW.conversion_status_snapshot,
    NEW.settlement_status_snapshot, NEW.source_conversion_key_snapshot,
    NEW.cashback_share_bps_snapshot, NEW.conversion_payable_at_snapshot,
    NEW.reserved_at, NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.id, OLD.payout_request_id, OLD.conversion_id, OLD.user_id,
    OLD.amount, OLD.currency, OLD.conversion_status_snapshot,
    OLD.settlement_status_snapshot, OLD.source_conversion_key_snapshot,
    OLD.cashback_share_bps_snapshot, OLD.conversion_payable_at_snapshot,
    OLD.reserved_at, OLD.created_at
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'PAYOUT_ITEM_CORE_IMMUTABLE';
  END IF;

  IF OLD.released_at is not null OR OLD.paid_at is not null THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'PAYOUT_ITEM_TERMINAL';
  END IF;
  IF (NEW.released_at is null) = (NEW.paid_at is null) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PAYOUT_ITEM_LIFECYCLE_INVALID';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER "payout_request_items_prevent_delete"
BEFORE DELETE ON "public"."payout_request_items"
FOR EACH ROW EXECUTE FUNCTION "public"."phase20m_guard_item_mutation"();
--> statement-breakpoint
CREATE TRIGGER "payout_request_items_enforce_lifecycle"
BEFORE UPDATE ON "public"."payout_request_items"
FOR EACH ROW EXECUTE FUNCTION "public"."phase20m_guard_item_mutation"();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "public"."phase20m_guard_event_mutation"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'PAYOUT_EVENT_IMMUTABLE';
END;
$$;
--> statement-breakpoint

CREATE TRIGGER "payout_events_prevent_mutation"
BEFORE UPDATE OR DELETE ON "public"."payout_events"
FOR EACH ROW EXECUTE FUNCTION "public"."phase20m_guard_event_mutation"();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "public"."phase20m_assert_request_consistency"(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_request public.payout_requests%ROWTYPE;
  v_count integer;
  v_amount bigint;
  v_bad integer;
BEGIN
  SELECT * INTO v_request FROM public.payout_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT count(*)::integer, coalesce(sum(amount), 0)::bigint
    INTO v_count, v_amount
  FROM public.payout_request_items
  WHERE payout_request_id = p_request_id;

  IF v_count <> v_request.item_count OR v_amount <> v_request.reserved_amount THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PAYOUT_REQUEST_AGGREGATE_MISMATCH';
  END IF;

  SELECT count(*)::integer INTO v_bad
  FROM public.payout_request_items i
  JOIN public.conversions c ON c.id = i.conversion_id
  WHERE i.payout_request_id = p_request_id
    AND (
      i.user_id <> v_request.user_id
      OR c.publisher_id <> v_request.user_id
      OR c.user_cashback <> i.amount
    );
  IF v_bad <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PAYOUT_REQUEST_OWNERSHIP_OR_MONEY_DRIFT';
  END IF;

  IF v_request.status in ('requested', 'approved', 'processing', 'review_required') THEN
    SELECT count(*)::integer INTO v_bad
    FROM public.payout_request_items i
    JOIN public.conversions c ON c.id = i.conversion_id
    WHERE i.payout_request_id = p_request_id
      AND (
        i.released_at is not null
        OR i.paid_at is not null
        OR c.status <> 'payable'
        OR (c.settlement_status is not null and c.settlement_status <> 'payable')
      );
  ELSIF v_request.status = 'paid' THEN
    SELECT count(*)::integer INTO v_bad
    FROM public.payout_request_items i
    JOIN public.conversions c ON c.id = i.conversion_id
    WHERE i.payout_request_id = p_request_id
      AND (
        i.released_at is not null
        OR i.paid_at is distinct from v_request.paid_at
        OR c.status <> 'paid'
        OR c.paid_at is distinct from v_request.paid_at
        OR (c.settlement_status is not null and c.settlement_status <> 'paid')
      );
  ELSE
    SELECT count(*)::integer INTO v_bad
    FROM public.payout_request_items i
    WHERE i.payout_request_id = p_request_id
      AND (i.released_at is null OR i.paid_at is not null);
  END IF;

  IF v_bad <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PAYOUT_REQUEST_LIFECYCLE_MISMATCH';
  END IF;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "public"."phase20m_deferred_consistency_trigger"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_request_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'payout_requests' THEN
    v_request_id := coalesce(NEW.id, OLD.id);
    PERFORM public.phase20m_assert_request_consistency(v_request_id);
  ELSIF TG_TABLE_NAME = 'payout_request_items' THEN
    v_request_id := coalesce(NEW.payout_request_id, OLD.payout_request_id);
    PERFORM public.phase20m_assert_request_consistency(v_request_id);
  ELSE
    FOR v_request_id IN
      SELECT DISTINCT i.payout_request_id
      FROM public.payout_request_items i
      WHERE i.conversion_id = coalesce(NEW.id, OLD.id)
        AND i.released_at is null
    LOOP
      PERFORM public.phase20m_assert_request_consistency(v_request_id);
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint

CREATE CONSTRAINT TRIGGER "payout_requests_deferred_consistency"
AFTER INSERT OR UPDATE OR DELETE ON "public"."payout_requests"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "public"."phase20m_deferred_consistency_trigger"();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "payout_request_items_deferred_consistency"
AFTER INSERT OR UPDATE OR DELETE ON "public"."payout_request_items"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "public"."phase20m_deferred_consistency_trigger"();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "payout_conversions_deferred_consistency"
AFTER UPDATE OR DELETE ON "public"."conversions"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "public"."phase20m_deferred_consistency_trigger"();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "public"."phase20m_assert_current_destination"(p_request public.payout_requests)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_account public.payout_accounts%ROWTYPE;
  v_fingerprint text;
BEGIN
  SELECT * INTO v_account
  FROM public.payout_accounts
  WHERE id = p_request.payout_account_id
  FOR UPDATE;

  IF NOT FOUND OR v_account.user_id <> p_request.user_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_ACCOUNT_NOT_OWNED';
  END IF;
  IF v_account.status <> 'verified' OR v_account.method <> 'bank' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_ACCOUNT_NOT_VERIFIED';
  END IF;

  v_fingerprint := public.phase20m_destination_fingerprint(
    v_account.method,
    v_account.provider,
    v_account.account_name,
    v_account.account_number
  );
  IF v_fingerprint <> p_request.destination_fingerprint THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_DESTINATION_CHANGED';
  END IF;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "public"."phase20m_apply_transition"(
  p_request_id uuid,
  p_idempotency_key uuid,
  p_operation text,
  p_actor_kind text,
  p_actor_user_id uuid,
  p_actor_role text,
  p_internal_reason_code text DEFAULT NULL,
  p_internal_reason text DEFAULT NULL,
  p_evidence_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_request public.payout_requests%ROWTYPE;
  v_before public.payout_requests%ROWTYPE;
  v_event public.payout_events%ROWTYPE;
  v_scope text;
  v_fingerprint text;
  v_reference text;
  v_now timestamptz := clock_timestamp();
  v_previous text;
  v_next text;
  v_event_type text;
  v_owner_reason text;
  v_sequence integer;
  v_updated integer;
BEGIN
  IF p_idempotency_key is null OR p_request_id is null THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_INPUT_INVALID';
  END IF;

  SELECT * INTO v_request
  FROM public.payout_requests
  WHERE id = p_request_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_REQUEST_NOT_FOUND';
  END IF;

  IF p_actor_kind = 'user' THEN
    v_scope := 'user:' || p_actor_user_id::text || ':' || p_operation || ':' || p_request_id::text;
  ELSIF p_actor_kind = 'admin' THEN
    v_scope := 'admin:' || p_actor_user_id::text || ':' || p_operation || ':' || p_request_id::text;
  ELSIF p_actor_kind = 'system' THEN
    v_scope := 'system:payout:' || p_operation || ':' || p_request_id::text;
  ELSE
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_ACTOR_INVALID';
  END IF;

  v_fingerprint := public.phase20m_sha256_text(
    jsonb_build_array(
      'phase20m-v1', p_operation, p_request_id, p_internal_reason_code,
      p_internal_reason, p_evidence_reference
    )::text
  );

  SELECT * INTO v_event
  FROM public.payout_events
  WHERE idempotency_scope = v_scope AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_event.payload_fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_IDEMPOTENCY_KEY_CONFLICT';
    END IF;
    RETURN public.phase20m_response(v_event.payout_request_id, v_event.id, true);
  END IF;

  IF p_actor_kind = 'user' THEN
    IF p_actor_user_id is null OR p_actor_user_id <> v_request.user_id OR p_actor_role is not null THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_REQUEST_NOT_OWNED';
    END IF;
  ELSIF p_actor_kind = 'admin' THEN
    IF p_actor_user_id is null OR p_actor_role not in ('admin', 'super_admin') THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_ACTOR_INVALID';
    END IF;
  ELSIF p_actor_user_id is not null OR p_actor_role is not null THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_ACTOR_INVALID';
  END IF;

  v_before := v_request;
  v_previous := v_request.status;
  v_owner_reason := NULL;

  IF p_operation = 'cancel' THEN
    IF p_actor_kind <> 'user' OR v_request.status <> 'requested' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_INVALID_TRANSITION';
    END IF;
    v_next := 'cancelled'; v_event_type := 'request_cancelled'; v_owner_reason := 'user_cancelled';
    UPDATE public.payout_request_items SET released_at = v_now
      WHERE payout_request_id = p_request_id AND released_at is null AND paid_at is null;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> v_request.item_count THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_CONVERSION_DRIFT'; END IF;
    UPDATE public.payout_requests SET status = v_next, released_amount = reserved_amount,
      owner_reason_code = v_owner_reason, internal_reason_code = 'user_cancelled',
      internal_reason = NULL, cancelled_at = v_now, updated_at = v_now, version = version + 1
      WHERE id = p_request_id RETURNING * INTO v_request;
  ELSIF p_operation = 'approve' THEN
    IF p_actor_kind <> 'admin' OR v_request.status <> 'requested' THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_INVALID_TRANSITION'; END IF;
    PERFORM public.phase20m_assert_current_destination(v_request);
    v_next := 'approved'; v_event_type := 'request_approved';
    UPDATE public.payout_requests SET status = v_next, approved_amount = reserved_amount,
      approved_at = v_now, updated_at = v_now, version = version + 1
      WHERE id = p_request_id RETURNING * INTO v_request;
  ELSIF p_operation = 'reject' THEN
    IF p_actor_kind <> 'admin' OR v_request.status not in ('requested', 'approved') THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_INVALID_TRANSITION'; END IF;
    IF p_internal_reason_code is null OR p_internal_reason is null OR char_length(trim(p_internal_reason)) not between 1 and 500 OR p_internal_reason ~ '[[:cntrl:]]' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_REASON_REQUIRED';
    END IF;
    v_next := 'rejected'; v_event_type := 'request_rejected'; v_owner_reason := 'request_rejected';
    UPDATE public.payout_request_items SET released_at = v_now
      WHERE payout_request_id = p_request_id AND released_at is null AND paid_at is null;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> v_request.item_count THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_CONVERSION_DRIFT'; END IF;
    UPDATE public.payout_requests SET status = v_next, released_amount = reserved_amount,
      owner_reason_code = v_owner_reason, internal_reason_code = trim(p_internal_reason_code),
      internal_reason = trim(p_internal_reason), rejected_at = v_now, updated_at = v_now, version = version + 1
      WHERE id = p_request_id RETURNING * INTO v_request;
  ELSIF p_operation = 'start_processing' THEN
    IF p_actor_kind <> 'system' OR v_request.status <> 'approved' THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_INVALID_TRANSITION'; END IF;
    v_reference := public.phase20m_clean_reference(p_evidence_reference);
    PERFORM public.phase20m_assert_current_destination(v_request);
    v_next := 'processing'; v_event_type := 'processing_started';
    BEGIN
      UPDATE public.payout_requests SET status = v_next, processor_reference = v_reference,
        processing_at = v_now, updated_at = v_now, version = version + 1
        WHERE id = p_request_id RETURNING * INTO v_request;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_PROCESSOR_REFERENCE_CONFLICT';
    END;
  ELSIF p_operation = 'review_required' THEN
    IF p_actor_kind <> 'system' OR v_request.status <> 'processing' THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_INVALID_TRANSITION'; END IF;
    v_reference := public.phase20m_clean_reference(p_evidence_reference);
    IF p_internal_reason_code is null OR trim(p_internal_reason_code) !~ '^[a-z0-9_]{1,64}$' THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_REASON_REQUIRED'; END IF;
    v_next := 'review_required'; v_event_type := 'outcome_uncertain'; v_owner_reason := 'payment_under_review';
    UPDATE public.payout_requests SET status = v_next, outcome_reference = v_reference,
      owner_reason_code = v_owner_reason, internal_reason_code = trim(p_internal_reason_code),
      internal_reason = NULL, review_required_at = v_now, updated_at = v_now, version = version + 1
      WHERE id = p_request_id RETURNING * INTO v_request;
  ELSIF p_operation = 'complete' THEN
    IF p_actor_kind <> 'system' OR v_request.status not in ('processing', 'review_required') THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_INVALID_TRANSITION'; END IF;
    v_reference := public.phase20m_clean_reference(p_evidence_reference);
    v_next := 'paid'; v_event_type := 'payment_confirmed';
    UPDATE public.payout_request_items SET paid_at = v_now
      WHERE payout_request_id = p_request_id AND released_at is null AND paid_at is null;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> v_request.item_count THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_CONVERSION_DRIFT'; END IF;
    UPDATE public.conversions c SET status = 'paid', paid_at = v_now, updated_at = v_now,
      settlement_status = CASE WHEN c.settlement_status = 'payable' THEN 'paid' ELSE c.settlement_status END
    FROM public.payout_request_items i
    WHERE i.payout_request_id = p_request_id AND i.conversion_id = c.id
      AND c.publisher_id = v_request.user_id AND c.status = 'payable' AND c.user_cashback = i.amount;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> v_request.item_count THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_CONVERSION_DRIFT'; END IF;
    BEGIN
      UPDATE public.payout_requests SET status = v_next, paid_amount = reserved_amount,
        payment_reference = v_reference, owner_reason_code = NULL,
        internal_reason_code = NULL, internal_reason = NULL,
        paid_at = v_now, updated_at = v_now, version = version + 1
        WHERE id = p_request_id RETURNING * INTO v_request;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_PAYMENT_REFERENCE_CONFLICT';
    END;
  ELSIF p_operation = 'confirm_nonpayment' THEN
    IF p_actor_kind <> 'system' OR v_request.status not in ('processing', 'review_required') THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_INVALID_TRANSITION'; END IF;
    v_reference := public.phase20m_clean_reference(p_evidence_reference);
    IF p_internal_reason_code is null OR p_internal_reason is null OR char_length(trim(p_internal_reason)) not between 1 and 500 OR p_internal_reason ~ '[[:cntrl:]]' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_REASON_REQUIRED';
    END IF;
    v_next := 'failed'; v_event_type := 'nonpayment_confirmed'; v_owner_reason := 'payment_not_completed';
    UPDATE public.payout_request_items SET released_at = v_now
      WHERE payout_request_id = p_request_id AND released_at is null AND paid_at is null;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> v_request.item_count THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_CONVERSION_DRIFT'; END IF;
    UPDATE public.payout_requests SET status = v_next, released_amount = reserved_amount,
      nonpayment_reference = v_reference, owner_reason_code = v_owner_reason,
      internal_reason_code = trim(p_internal_reason_code), internal_reason = trim(p_internal_reason),
      failed_at = v_now, updated_at = v_now, version = version + 1
      WHERE id = p_request_id RETURNING * INTO v_request;
  ELSE
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_OPERATION_INVALID';
  END IF;

  SELECT coalesce(max(sequence_no), 0) + 1 INTO v_sequence
  FROM public.payout_events WHERE payout_request_id = p_request_id;

  INSERT INTO public.payout_events (
    payout_request_id, user_id, sequence_no, event_type, previous_status, next_status,
    actor_kind, actor_user_id, actor_role, idempotency_scope, idempotency_key,
    payload_fingerprint, correlation_id, request_version,
    requested_amount, reserved_amount, approved_amount, paid_amount, released_amount,
    before_snapshot, after_snapshot, owner_reason_code,
    internal_reason_code, internal_reason, evidence_reference, created_at
  ) VALUES (
    p_request_id, v_request.user_id, v_sequence, v_event_type, v_previous, v_next,
    p_actor_kind, p_actor_user_id, p_actor_role, v_scope, p_idempotency_key,
    v_fingerprint, p_request_id, v_request.version,
    v_request.requested_amount, v_request.reserved_amount, v_request.approved_amount,
    v_request.paid_amount, v_request.released_amount,
    public.phase20m_request_snapshot(v_before), public.phase20m_request_snapshot(v_request),
    v_owner_reason, p_internal_reason_code, p_internal_reason, v_reference, v_now
  ) RETURNING * INTO v_event;

  RETURN public.phase20m_response(p_request_id, v_event.id, false);
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "public"."create_payout_request"(
  p_payout_account_id uuid,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_account public.payout_accounts%ROWTYPE;
  v_existing public.payout_requests%ROWTYPE;
  v_request public.payout_requests%ROWTYPE;
  v_event public.payout_events%ROWTYPE;
  v_ids uuid[];
  v_count integer;
  v_amount bigint;
  v_fingerprint text;
  v_destination_fingerprint text;
  v_account_number text;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF v_user_id is null THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_AUTH_REQUIRED'; END IF;
  IF p_payout_account_id is null OR p_idempotency_key is null THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_INPUT_INVALID'; END IF;

  PERFORM 1 FROM public.profiles WHERE user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_PROFILE_NOT_FOUND'; END IF;

  v_fingerprint := public.phase20m_sha256_text(jsonb_build_array('phase20m-v1', 'create', p_payout_account_id)::text);
  SELECT * INTO v_existing
  FROM public.payout_requests
  WHERE user_id = v_user_id AND idempotency_operation = 'create' AND idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.request_payload_fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_IDEMPOTENCY_KEY_CONFLICT';
    END IF;
    SELECT * INTO v_event FROM public.payout_events
      WHERE payout_request_id = v_existing.id AND event_type = 'request_created';
    RETURN public.phase20m_response(v_existing.id, v_event.id, true);
  END IF;

  SELECT * INTO v_account
  FROM public.payout_accounts
  WHERE id = p_payout_account_id
  FOR UPDATE;
  IF NOT FOUND OR v_account.user_id <> v_user_id THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_ACCOUNT_NOT_OWNED'; END IF;
  IF v_account.status <> 'verified' OR v_account.method <> 'bank' THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_ACCOUNT_NOT_VERIFIED'; END IF;
  IF char_length(trim(v_account.provider)) = 0 OR char_length(trim(v_account.account_name)) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_ACCOUNT_INVALID';
  END IF;
  v_account_number := regexp_replace(v_account.account_number, '[[:space:]]', '', 'g');
  IF char_length(v_account_number) = 0 THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_ACCOUNT_INVALID'; END IF;
  v_destination_fingerprint := public.phase20m_destination_fingerprint(v_account.method, v_account.provider, v_account.account_name, v_account.account_number);

  SELECT array_agg(id ORDER BY payable_at, id), count(*)::integer, coalesce(sum(user_cashback), 0)::bigint
    INTO v_ids, v_count, v_amount
  FROM (
    SELECT c.id, c.payable_at, c.user_cashback
    FROM public.conversions c
    WHERE c.publisher_id = v_user_id
      AND c.status = 'payable'
      AND c.user_cashback > 0
      AND (c.settlement_status is null OR c.settlement_status = 'payable')
      AND NOT EXISTS (
        SELECT 1 FROM public.payout_request_items i
        WHERE i.conversion_id = c.id AND i.released_at is null
      )
    ORDER BY c.payable_at, c.id
    LIMIT 200
    FOR UPDATE OF c
  ) locked;

  IF v_count = 0 THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_NO_WITHDRAWABLE_CONVERSIONS'; END IF;

  INSERT INTO public.payout_requests (
    user_id, payout_account_id, idempotency_key, request_payload_fingerprint,
    requested_amount, reserved_amount, item_count,
    payout_method_snapshot, provider_snapshot, account_name_snapshot,
    account_number_snapshot, account_number_last4_snapshot,
    payout_account_status_snapshot, destination_fingerprint,
    created_at, updated_at
  ) VALUES (
    v_user_id, p_payout_account_id, p_idempotency_key, v_fingerprint,
    v_amount, v_amount, v_count,
    trim(v_account.method), trim(v_account.provider), trim(v_account.account_name),
    v_account_number, right(v_account_number, 4), v_account.status,
    v_destination_fingerprint, v_now, v_now
  ) RETURNING * INTO v_request;

  INSERT INTO public.payout_request_items (
    payout_request_id, conversion_id, user_id, amount,
    conversion_status_snapshot, settlement_status_snapshot,
    source_conversion_key_snapshot, cashback_share_bps_snapshot,
    conversion_payable_at_snapshot, reserved_at, created_at
  )
  SELECT v_request.id, c.id, v_user_id, c.user_cashback,
    c.status, c.settlement_status, c.source_conversion_key,
    c.cashback_share_bps_snapshot, c.payable_at, v_now, v_now
  FROM public.conversions c
  WHERE c.id = ANY(v_ids)
  ORDER BY c.id;

  INSERT INTO public.payout_events (
    payout_request_id, user_id, sequence_no, event_type, previous_status, next_status,
    actor_kind, actor_user_id, actor_role, idempotency_scope, idempotency_key,
    payload_fingerprint, correlation_id, request_version,
    requested_amount, reserved_amount, approved_amount, paid_amount, released_amount,
    before_snapshot, after_snapshot, owner_reason_code, created_at
  ) VALUES (
    v_request.id, v_user_id, 1, 'request_created', NULL, 'requested',
    'user', v_user_id, NULL,
    'user:' || v_user_id::text || ':create:' || v_request.id::text,
    p_idempotency_key, v_fingerprint, v_request.id, v_request.version,
    v_request.requested_amount, v_request.reserved_amount, v_request.approved_amount,
    v_request.paid_amount, v_request.released_amount,
    NULL, public.phase20m_request_snapshot(v_request), NULL, v_now
  ) RETURNING * INTO v_event;

  RETURN public.phase20m_response(v_request.id, v_event.id, false);
EXCEPTION WHEN unique_violation THEN
  SELECT * INTO v_existing FROM public.payout_requests
    WHERE user_id = v_user_id AND idempotency_operation = 'create' AND idempotency_key = p_idempotency_key;
  IF FOUND AND v_existing.request_payload_fingerprint = v_fingerprint THEN
    SELECT * INTO v_event FROM public.payout_events
      WHERE payout_request_id = v_existing.id AND event_type = 'request_created';
    RETURN public.phase20m_response(v_existing.id, v_event.id, true);
  END IF;
  RAISE;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "public"."cancel_payout_request"(p_payout_request_id uuid, p_idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, extensions AS $$
DECLARE v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id is null THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_AUTH_REQUIRED'; END IF;
  RETURN public.phase20m_apply_transition(p_payout_request_id, p_idempotency_key, 'cancel', 'user', v_user_id, NULL);
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "public"."approve_payout_request"(p_payout_request_id uuid, p_idempotency_key uuid, p_actor_user_id uuid, p_actor_role text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, extensions AS $$
  SELECT public.phase20m_apply_transition(p_payout_request_id, p_idempotency_key, 'approve', 'admin', p_actor_user_id, p_actor_role)
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "public"."reject_payout_request"(p_payout_request_id uuid, p_idempotency_key uuid, p_actor_user_id uuid, p_actor_role text, p_reason_code text, p_reason text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, extensions AS $$
  SELECT public.phase20m_apply_transition(p_payout_request_id, p_idempotency_key, 'reject', 'admin', p_actor_user_id, p_actor_role, p_reason_code, p_reason, NULL)
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "public"."start_payout_processing"(p_payout_request_id uuid, p_idempotency_key uuid, p_processor_reference text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, extensions AS $$
  SELECT public.phase20m_apply_transition(p_payout_request_id, p_idempotency_key, 'start_processing', 'system', NULL, NULL, NULL, NULL, p_processor_reference)
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "public"."mark_payout_review_required"(p_payout_request_id uuid, p_idempotency_key uuid, p_uncertainty_code text, p_outcome_reference text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, extensions AS $$
  SELECT public.phase20m_apply_transition(p_payout_request_id, p_idempotency_key, 'review_required', 'system', NULL, NULL, p_uncertainty_code, NULL, p_outcome_reference)
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "public"."complete_payout_request"(p_payout_request_id uuid, p_idempotency_key uuid, p_payment_reference text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, extensions AS $$
  SELECT public.phase20m_apply_transition(p_payout_request_id, p_idempotency_key, 'complete', 'system', NULL, NULL, NULL, NULL, p_payment_reference)
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "public"."confirm_payout_nonpayment"(p_payout_request_id uuid, p_idempotency_key uuid, p_nonpayment_reference text, p_reason_code text, p_reason text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, extensions AS $$
  SELECT public.phase20m_apply_transition(p_payout_request_id, p_idempotency_key, 'confirm_nonpayment', 'system', NULL, NULL, p_reason_code, p_reason, p_nonpayment_reference)
$$;
--> statement-breakpoint

ALTER TABLE "public"."payout_requests" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "public"."payout_request_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "public"."payout_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "payout_requests_select_own" ON "public"."payout_requests" FOR SELECT TO authenticated USING ((SELECT auth.uid()) = "user_id");
--> statement-breakpoint
CREATE POLICY "payout_request_items_select_own" ON "public"."payout_request_items" FOR SELECT TO authenticated USING ((SELECT auth.uid()) = "user_id");
--> statement-breakpoint
CREATE POLICY "payout_events_select_own" ON "public"."payout_events" FOR SELECT TO authenticated USING ((SELECT auth.uid()) = "user_id");
--> statement-breakpoint

CREATE VIEW "public"."payout_requests_owner" WITH (security_barrier = true) AS
SELECT
  id, status, currency,
  requested_amount::text AS requested_amount_vnd,
  reserved_amount::text AS reserved_amount_vnd,
  approved_amount::text AS approved_amount_vnd,
  paid_amount::text AS paid_amount_vnd,
  released_amount::text AS released_amount_vnd,
  item_count, payout_method_snapshot, provider_snapshot, account_name_snapshot,
  repeat('*', greatest(0, 4 - char_length(account_number_last4_snapshot))) || account_number_last4_snapshot AS account_number_masked,
  owner_reason_code, created_at, updated_at, approved_at, processing_at,
  review_required_at, paid_at, rejected_at, cancelled_at, failed_at
FROM public.payout_requests
WHERE user_id = (SELECT auth.uid());
--> statement-breakpoint

CREATE VIEW "public"."payout_request_items_owner" WITH (security_barrier = true) AS
SELECT
  id, payout_request_id, conversion_id, amount::text AS amount_vnd, currency,
  conversion_status_snapshot, reserved_at, released_at, paid_at, created_at
FROM public.payout_request_items
WHERE user_id = (SELECT auth.uid());
--> statement-breakpoint

CREATE VIEW "public"."payout_events_owner" WITH (security_barrier = true) AS
SELECT
  id, payout_request_id, sequence_no, event_type, previous_status, next_status,
  requested_amount::text AS requested_amount_vnd,
  reserved_amount::text AS reserved_amount_vnd,
  approved_amount::text AS approved_amount_vnd,
  paid_amount::text AS paid_amount_vnd,
  released_amount::text AS released_amount_vnd,
  owner_reason_code, created_at
FROM public.payout_events
WHERE user_id = (SELECT auth.uid());
--> statement-breakpoint

REVOKE ALL PRIVILEGES ON TABLE public.payout_requests, public.payout_request_items, public.payout_events FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE public.payout_requests_owner, public.payout_request_items_owner, public.payout_events_owner FROM PUBLIC, anon;
--> statement-breakpoint
GRANT SELECT ON TABLE public.payout_requests_owner, public.payout_request_items_owner, public.payout_events_owner TO authenticated;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.phase20m_sha256_text(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.phase20m_destination_fingerprint(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.phase20m_clean_reference(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.phase20m_request_snapshot(public.payout_requests) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.phase20m_response(uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.phase20m_validate_item_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.phase20m_guard_request_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.phase20m_guard_item_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.phase20m_guard_event_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.phase20m_assert_request_consistency(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.phase20m_deferred_consistency_trigger() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.phase20m_assert_current_destination(public.payout_requests) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.phase20m_apply_transition(uuid, uuid, text, text, uuid, text, text, text, text) FROM PUBLIC;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.create_payout_request(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_payout_request(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_payout_request(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_payout_request(uuid, uuid) TO authenticated;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.approve_payout_request(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_payout_request(uuid, uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.start_payout_processing(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_payout_review_required(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_payout_request(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_payout_nonpayment(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_payout_request(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reject_payout_request(uuid, uuid, uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.start_payout_processing(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_payout_review_required(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_payout_request(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_payout_nonpayment(uuid, uuid, text, text, text) TO service_role;
