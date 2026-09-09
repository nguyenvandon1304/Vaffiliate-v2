/*
 * Phase 20M.3A2 -- admin payout read boundary.
 *
 * Read side of the privileged payout surface. Phase 20M.0 shipped the six
 * admin mutation RPCs; those assert the actor role from a caller-supplied
 * `p_actor_role` argument. This migration does NOT repeat that pattern.
 *
 * The two read RPCs below resolve the actor role inside the database from
 * the canonical authority -- `auth.users.raw_app_meta_data ->> 'app_role'`
 * -- so a compromised or buggy server-side caller cannot mint an admin
 * read by passing a role string. Only `app_role` is consulted; the legacy
 * `role` key and the user-writable `raw_user_meta_data` are ignored.
 *
 * Both RPCs are SECURITY DEFINER with a fixed search_path, are revoked
 * from PUBLIC / anon / authenticated, and are granted to service_role
 * only. The projections never expose `account_number_snapshot`,
 * `destination_fingerprint`, `internal_reason_code`, `internal_reason`,
 * or any provider reference; the destination is emitted from the
 * display-safe account name and already-masked last-four column.
 */

CREATE OR REPLACE FUNCTION "public"."phase20m_assert_payout_admin_actor"(p_actor_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_actor_role text;
BEGIN
  IF p_actor_user_id is null THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_ACTOR_INVALID';
  END IF;

  SELECT u.raw_app_meta_data ->> 'app_role'
    INTO v_actor_role
  FROM auth.users AS u
  WHERE u.id = p_actor_user_id;

  IF v_actor_role is null OR v_actor_role not in ('admin', 'super_admin') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_ACTOR_INVALID';
  END IF;

  RETURN v_actor_role;
END;
$$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "payout_requests_admin_created_at_id_idx"
  ON "public"."payout_requests" USING btree ("created_at" DESC, "id" DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "payout_requests_admin_status_created_at_id_idx"
  ON "public"."payout_requests" USING btree ("status", "created_at" DESC, "id" DESC);
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "public"."list_payout_requests_admin"(
  p_actor_user_id uuid,
  p_status text DEFAULT NULL,
  p_cursor_created_at timestamp with time zone DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 25
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_limit integer;
  v_rows jsonb;
BEGIN
  PERFORM public.phase20m_assert_payout_admin_actor(p_actor_user_id);

  IF p_status is not null AND p_status not in (
    'requested', 'approved', 'processing', 'review_required',
    'paid', 'rejected', 'cancelled', 'failed'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_INPUT_INVALID';
  END IF;

  IF p_limit is null THEN
    v_limit := 25;
  ELSIF p_limit < 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_INPUT_INVALID';
  ELSE
    v_limit := least(p_limit, 100);
  END IF;

  -- A cursor is only meaningful when both halves are present; a partial
  -- cursor would silently degrade to an unanchored page.
  IF (p_cursor_created_at is null) <> (p_cursor_id is null) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_INPUT_INVALID';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(page)::jsonb ORDER BY page.created_at DESC, page.id DESC), '[]'::jsonb)
    INTO v_rows
  FROM (
    SELECT
      r.id,
      r.user_id,
      r.status,
      r.currency,
      r.requested_amount::text AS requested_amount_vnd,
      r.reserved_amount::text AS reserved_amount_vnd,
      r.approved_amount::text AS approved_amount_vnd,
      r.paid_amount::text AS paid_amount_vnd,
      r.released_amount::text AS released_amount_vnd,
      r.item_count,
      r.payout_method_snapshot,
      r.provider_snapshot,
      r.account_name_snapshot,
      repeat('*', greatest(0, 4 - char_length(r.account_number_last4_snapshot)))
        || r.account_number_last4_snapshot AS account_number_masked,
      r.owner_reason_code,
      r.created_at,
      r.updated_at
    FROM public.payout_requests AS r
    WHERE (p_status is null OR r.status = p_status)
      AND (
        p_cursor_created_at is null
        OR r.created_at < p_cursor_created_at
        OR (r.created_at = p_cursor_created_at AND r.id < p_cursor_id)
      )
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT v_limit
  ) AS page;

  RETURN jsonb_build_object('items', v_rows);
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "public"."get_payout_request_admin"(
  p_actor_user_id uuid,
  p_payout_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_request jsonb;
  v_items jsonb;
  v_events jsonb;
BEGIN
  PERFORM public.phase20m_assert_payout_admin_actor(p_actor_user_id);

  IF p_payout_request_id is null THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_INPUT_INVALID';
  END IF;

  SELECT to_jsonb(detail) INTO v_request
  FROM (
    SELECT
      r.id,
      r.user_id,
      r.status,
      r.currency,
      r.requested_amount::text AS requested_amount_vnd,
      r.reserved_amount::text AS reserved_amount_vnd,
      r.approved_amount::text AS approved_amount_vnd,
      r.paid_amount::text AS paid_amount_vnd,
      r.released_amount::text AS released_amount_vnd,
      r.item_count,
      r.payout_method_snapshot,
      r.provider_snapshot,
      r.account_name_snapshot,
      repeat('*', greatest(0, 4 - char_length(r.account_number_last4_snapshot)))
        || r.account_number_last4_snapshot AS account_number_masked,
      r.owner_reason_code,
      r.created_at,
      r.updated_at
    FROM public.payout_requests AS r
    WHERE r.id = p_payout_request_id
  ) AS detail;

  IF v_request is null THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYOUT_REQUEST_NOT_FOUND';
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(item) ORDER BY item.created_at, item.id), '[]'::jsonb)
    INTO v_items
  FROM (
    SELECT
      i.id,
      i.payout_request_id,
      i.conversion_id,
      i.amount::text AS amount_vnd,
      i.currency,
      i.conversion_status_snapshot,
      i.reserved_at,
      i.released_at,
      i.paid_at,
      i.created_at
    FROM public.payout_request_items AS i
    WHERE i.payout_request_id = p_payout_request_id
  ) AS item;

  SELECT coalesce(jsonb_agg(to_jsonb(evt) ORDER BY evt.sequence_no), '[]'::jsonb)
    INTO v_events
  FROM (
    SELECT
      e.id,
      e.payout_request_id,
      e.sequence_no,
      e.event_type,
      e.previous_status,
      e.next_status,
      e.requested_amount::text AS requested_amount_vnd,
      e.reserved_amount::text AS reserved_amount_vnd,
      e.approved_amount::text AS approved_amount_vnd,
      e.paid_amount::text AS paid_amount_vnd,
      e.released_amount::text AS released_amount_vnd,
      e.owner_reason_code,
      e.created_at
    FROM public.payout_events AS e
    WHERE e.payout_request_id = p_payout_request_id
  ) AS evt;

  RETURN jsonb_build_object(
    'request', v_request,
    'items', v_items,
    'events', v_events
  );
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.phase20m_assert_payout_admin_actor(uuid) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.list_payout_requests_admin(uuid, text, timestamp with time zone, uuid, integer) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.get_payout_request_admin(uuid, uuid) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.list_payout_requests_admin(uuid, text, timestamp with time zone, uuid, integer) TO service_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.get_payout_request_admin(uuid, uuid) TO service_role;
--> statement-breakpoint
