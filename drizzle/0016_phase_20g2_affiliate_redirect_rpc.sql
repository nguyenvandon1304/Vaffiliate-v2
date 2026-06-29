/*
 * Replace the click-recording RPC with an explicit affiliate redirect
 * contract.
 *
 * The function records the internal per-click token, but redirects through
 * the network-generated affiliate URL that contains the tracking link's
 * stable Shopee Sub_id1.
 */

DROP FUNCTION public.record_cashback_click(
  text,
  text,
  text,
  text,
  text
);
--> statement-breakpoint

CREATE FUNCTION public.record_cashback_click(
  p_short_code text,
  p_referrer text DEFAULT NULL,
  p_user_agent_hash text DEFAULT NULL,
  p_ip_hash text DEFAULT NULL,
  p_fingerprint_hash text DEFAULT NULL
)
RETURNS TABLE (
  click_id uuid,
  click_token text,
  affiliate_url text,
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
  v_referrer text :=
    nullif(btrim(p_referrer), '');
  v_user_agent_hash text :=
    nullif(lower(btrim(p_user_agent_hash)), '');
  v_ip_hash text :=
    nullif(lower(btrim(p_ip_hash)), '');
  v_fingerprint_hash text :=
    nullif(lower(btrim(p_fingerprint_hash)), '');

  v_tracking_link_id uuid;
  v_affiliate_url text;
  v_destination_url text;
  v_platform text;
  v_affiliate_host text;
  v_click_token text;
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
    tl.affiliate_url,
    tl.destination_url,
    tl.platform
  INTO
    v_tracking_link_id,
    v_affiliate_url,
    v_destination_url,
    v_platform
  FROM public.tracking_links AS tl
  WHERE tl.short_code = v_short_code
    AND tl.publisher_id = v_user_id
    AND tl.status = 'active'
    AND tl.affiliate_url IS NOT NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE =
        'Active affiliate tracking link was not found';
  END IF;

  IF
    v_affiliate_url = ''
    OR length(v_affiliate_url) > 4096
    OR lower(v_affiliate_url) NOT LIKE 'https://%'
    OR v_affiliate_url ~ '[[:space:]]'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Invalid affiliate redirect URL';
  END IF;

  v_affiliate_host := substring(
    lower(v_affiliate_url)
    FROM '^https://([^/:?#]+)'
  );

  IF
    v_platform = 'shopee'
    AND NOT (
      v_affiliate_host = 'shopee.vn'
      OR v_affiliate_host LIKE '%.shopee.vn'
      OR v_affiliate_host = 'shopee.com'
      OR v_affiliate_host LIKE '%.shopee.com'
      OR v_affiliate_host = 'shope.ee'
      OR v_affiliate_host LIKE '%.shope.ee'
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE =
        'Affiliate redirect URL does not belong to Shopee';
  END IF;

  IF
    v_platform = 'tiktok'
    AND NOT (
      v_affiliate_host = 'tiktok.com'
      OR v_affiliate_host LIKE '%.tiktok.com'
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE =
        'Affiliate redirect URL does not belong to TikTok';
  END IF;

  IF v_fingerprint_hash IS NOT NULL THEN
    v_is_unique := NOT EXISTS (
      SELECT 1
      FROM public.clicks AS c
      WHERE c.tracking_link_id =
          v_tracking_link_id
        AND c.publisher_id = v_user_id
        AND c.fingerprint_hash =
          v_fingerprint_hash
        AND c.clicked_at >=
          v_clicked_at - interval '30 minutes'
    );
  END IF;

  FOR v_attempt IN 1..5 LOOP
    v_click_token :=
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
        click_token,
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
        v_click_token,
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
        c.click_token,
        v_affiliate_url,
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
    MESSAGE =
      'Unable to allocate a unique click identifier';
END;
$function$;
--> statement-breakpoint

REVOKE ALL PRIVILEGES
ON FUNCTION public.record_cashback_click(
  text,
  text,
  text,
  text,
  text
)
FROM PUBLIC;
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
