/*
 * Normalize stable tracking-link attribution tokens for Shopee Sub_id1.
 *
 * Shopee Custom Link accepts ASCII letters and digits only, so migrate:
 *   vaf_lnk_<24 hex>
 * to:
 *   vaflnk<24 hex>
 */

ALTER TABLE "public"."tracking_links"
DROP CONSTRAINT "tracking_links_network_sub_id_check";
--> statement-breakpoint

UPDATE "public"."tracking_links"
SET "network_sub_id" =
  'vaflnk' ||
  substring(
    "network_sub_id"
    FROM 9
  )
WHERE "network_sub_id"
  ~ '^vaf_lnk_[a-f0-9]{24}$';
--> statement-breakpoint

ALTER TABLE "public"."tracking_links"
ADD CONSTRAINT "tracking_links_network_sub_id_check"
CHECK (
  "network_sub_id" ~ '^vaflnk[a-f0-9]{24}$'
);
--> statement-breakpoint

/*
 * Keep create_cashback_tracking_link aligned with the new Shopee-compatible
 * Sub_id1 format. The function result shape remains unchanged so the current
 * application repository stays backward compatible.
 */
CREATE OR REPLACE FUNCTION public.create_cashback_tracking_link(
  p_platform text,
  p_destination_url text
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
  v_host text;
  v_short_code text;
  v_network_sub_id text;
  v_attempt integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Authentication is required';
  END IF;

  IF
    v_platform IS NULL
    OR v_platform NOT IN ('shopee', 'tiktok')
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Unsupported cashback platform';
  END IF;

  IF
    v_destination_url IS NULL
    OR v_destination_url = ''
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
    AND tl.campaign_id IS NULL
    AND tl.offer_id IS NULL
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

    v_network_sub_id :=
      'vaflnk' ||
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
      INSERT INTO public.tracking_links AS tl (
        publisher_id,
        platform,
        destination_url,
        affiliate_url,
        campaign_id,
        offer_id,
        network_sub_id,
        short_code,
        status
      )
      VALUES (
        v_user_id,
        v_platform,
        v_destination_url,
        NULL,
        NULL,
        NULL,
        v_network_sub_id,
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
    MESSAGE = 'Unable to allocate unique tracking identifiers';
END;
$function$;
