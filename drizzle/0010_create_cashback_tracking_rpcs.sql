CREATE OR REPLACE FUNCTION public.create_cashback_tracking_link(
  p_platform text,
  p_destination_url text,
  p_campaign_id text,
  p_offer_id text
)
RETURNS TABLE (
  id uuid,
  short_code text,
  destination_url text,
  platform text,
  campaign_id text,
  offer_id text,
  status text,
  created_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_platform text := lower(btrim(p_platform));
  v_destination_url text := btrim(p_destination_url);
  v_campaign_id text := btrim(p_campaign_id);
  v_offer_id text := btrim(p_offer_id);
  v_host text;
  v_short_code text;
  v_attempt integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Authentication is required';
  END IF;

  IF v_platform NOT IN ('shopee', 'tiktok') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Unsupported cashback platform';
  END IF;

  IF
    v_destination_url = ''
    OR length(v_destination_url) > 4096
    OR lower(v_destination_url) NOT LIKE 'https://%'
    OR v_destination_url ~ '[[:space:]]'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Invalid cashback destination URL';
  END IF;

  v_host := substring(
    lower(v_destination_url)
    FROM '^https://([^/:?#]+)'
  );

  IF v_host IS NULL OR v_host = '' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Unable to determine destination hostname';
  END IF;

  IF
    v_platform = 'shopee'
    AND NOT (
      v_host = 'shopee.vn'
      OR v_host LIKE '%.shopee.vn'
      OR v_host = 'shopee.com'
      OR v_host LIKE '%.shopee.com'
      OR v_host = 'shope.ee'
      OR v_host LIKE '%.shope.ee'
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Destination URL does not belong to Shopee';
  END IF;

  IF
    v_platform = 'tiktok'
    AND NOT (
      v_host = 'tiktok.com'
      OR v_host LIKE '%.tiktok.com'
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Destination URL does not belong to TikTok';
  END IF;

  IF
    v_campaign_id = ''
    OR length(v_campaign_id) > 120
    OR v_offer_id = ''
    OR length(v_offer_id) > 120
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Invalid cashback campaign or offer';
  END IF;

  IF NOT (
    (
      v_platform = 'shopee'
      AND v_campaign_id = 'cmp-shopee-q2'
      AND v_offer_id IN (
        'off-shopee-fashion',
        'off-shopee-beauty'
      )
    )
    OR
    (
      v_platform = 'tiktok'
      AND v_campaign_id = 'cmp-tiktok-launch'
      AND v_offer_id = 'off-tiktok-home'
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Campaign and offer do not match the platform';
  END IF;

  RETURN QUERY
  SELECT
    tl.id,
    tl.short_code,
    tl.destination_url,
    tl.platform,
    tl.campaign_id,
    tl.offer_id,
    tl.status,
    tl.created_at
  FROM public.tracking_links AS tl
  WHERE tl.publisher_id = v_user_id
    AND tl.platform = v_platform
    AND tl.destination_url = v_destination_url
    AND tl.campaign_id = v_campaign_id
    AND tl.offer_id = v_offer_id
    AND tl.status = 'active'
  ORDER BY tl.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN;
  END IF;

  FOR v_attempt IN 1..5 LOOP
    v_short_code :=
      'vaf_' ||
      substring(
        replace(
          pg_catalog.gen_random_uuid()::text,
          '-',
          ''
        )
        FROM 1 FOR 16
      );

    BEGIN
      RETURN QUERY
      INSERT INTO public.tracking_links AS tl (
        publisher_id,
        platform,
        destination_url,
        campaign_id,
        offer_id,
        short_code,
        status
      )
      VALUES (
        v_user_id,
        v_platform,
        v_destination_url,
        v_campaign_id,
        v_offer_id,
        v_short_code,
        'active'
      )
      RETURNING
        tl.id,
        tl.short_code,
        tl.destination_url,
        tl.platform,
        tl.campaign_id,
        tl.offer_id,
        tl.status,
        tl.created_at;

      RETURN;
    EXCEPTION
      WHEN unique_violation THEN
        NULL;
    END;
  END LOOP;

  RAISE EXCEPTION USING
    ERRCODE = '23505',
    MESSAGE = 'Unable to allocate a unique tracking code';
END;
$function$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.record_cashback_click(
  p_short_code text,
  p_referrer text DEFAULT NULL,
  p_user_agent_hash text DEFAULT NULL,
  p_ip_hash text DEFAULT NULL,
  p_fingerprint_hash text DEFAULT NULL
)
RETURNS TABLE (
  click_id uuid,
  network_sub_id text,
  destination_url text,
  platform text,
  is_unique boolean,
  clicked_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_short_code text := btrim(p_short_code);
  v_referrer text := nullif(btrim(p_referrer), '');
  v_user_agent_hash text :=
    nullif(lower(btrim(p_user_agent_hash)), '');
  v_ip_hash text :=
    nullif(lower(btrim(p_ip_hash)), '');
  v_fingerprint_hash text :=
    nullif(lower(btrim(p_fingerprint_hash)), '');

  v_tracking_link_id uuid;
  v_destination_url text;
  v_platform text;
  v_network_sub_id text;
  v_is_unique boolean := true;
  v_clicked_at timestamp with time zone :=
    clock_timestamp();
  v_attempt integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Authentication is required';
  END IF;

  IF
    v_short_code IS NULL
    OR v_short_code !~ '^[A-Za-z0-9_-]{10,32}$'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Invalid tracking code';
  END IF;

  IF
    v_user_agent_hash IS NOT NULL
    AND v_user_agent_hash !~ '^[a-f0-9]{64}$'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Invalid user-agent hash';
  END IF;

  IF
    v_ip_hash IS NOT NULL
    AND v_ip_hash !~ '^[a-f0-9]{64}$'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Invalid IP hash';
  END IF;

  IF
    v_fingerprint_hash IS NOT NULL
    AND v_fingerprint_hash !~ '^[a-f0-9]{64}$'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Invalid click fingerprint hash';
  END IF;

  SELECT
    tl.id,
    tl.destination_url,
    tl.platform
  INTO
    v_tracking_link_id,
    v_destination_url,
    v_platform
  FROM public.tracking_links AS tl
  WHERE tl.short_code = v_short_code
    AND tl.publisher_id = v_user_id
    AND tl.status = 'active'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'Active tracking link was not found';
  END IF;

  IF v_fingerprint_hash IS NOT NULL THEN
    v_is_unique := NOT EXISTS (
      SELECT 1
      FROM public.clicks AS c
      WHERE c.tracking_link_id = v_tracking_link_id
        AND c.publisher_id = v_user_id
        AND c.fingerprint_hash = v_fingerprint_hash
        AND c.clicked_at >=
          v_clicked_at - interval '30 minutes'
    );
  END IF;

  FOR v_attempt IN 1..5 LOOP
    v_network_sub_id :=
      'vaf_' ||
      substring(
        replace(
          pg_catalog.gen_random_uuid()::text,
          '-',
          ''
        )
        FROM 1 FOR 24
      );

    BEGIN
      RETURN QUERY
      INSERT INTO public.clicks AS c (
        tracking_link_id,
        publisher_id,
        network_sub_id,
        referrer,
        user_agent_hash,
        ip_hash,
        fingerprint_hash,
        is_unique,
        clicked_at
      )
      VALUES (
        v_tracking_link_id,
        v_user_id,
        v_network_sub_id,
        CASE
          WHEN v_referrer IS NULL THEN NULL
          ELSE left(v_referrer, 2048)
        END,
        v_user_agent_hash,
        v_ip_hash,
        v_fingerprint_hash,
        v_is_unique,
        v_clicked_at
      )
      RETURNING
        c.id,
        c.network_sub_id,
        v_destination_url,
        v_platform,
        c.is_unique,
        c.clicked_at;

      RETURN;
    EXCEPTION
      WHEN unique_violation THEN
        NULL;
    END;
  END LOOP;

  RAISE EXCEPTION USING
    ERRCODE = '23505',
    MESSAGE = 'Unable to allocate a unique click identifier';
END;
$function$;
--> statement-breakpoint

REVOKE ALL
ON FUNCTION public.create_cashback_tracking_link(
  text,
  text,
  text,
  text
)
FROM PUBLIC;
--> statement-breakpoint

REVOKE ALL
ON FUNCTION public.create_cashback_tracking_link(
  text,
  text,
  text,
  text
)
FROM anon;
--> statement-breakpoint

REVOKE ALL
ON FUNCTION public.create_cashback_tracking_link(
  text,
  text,
  text,
  text
)
FROM authenticated;
--> statement-breakpoint

GRANT EXECUTE
ON FUNCTION public.create_cashback_tracking_link(
  text,
  text,
  text,
  text
)
TO authenticated;
--> statement-breakpoint

REVOKE ALL
ON FUNCTION public.record_cashback_click(
  text,
  text,
  text,
  text,
  text
)
FROM PUBLIC;
--> statement-breakpoint

REVOKE ALL
ON FUNCTION public.record_cashback_click(
  text,
  text,
  text,
  text,
  text
)
FROM anon;
--> statement-breakpoint

REVOKE ALL
ON FUNCTION public.record_cashback_click(
  text,
  text,
  text,
  text,
  text
)
FROM authenticated;
--> statement-breakpoint

GRANT EXECUTE
ON FUNCTION public.record_cashback_click(
  text,
  text,
  text,
  text,
  text
)
TO authenticated;