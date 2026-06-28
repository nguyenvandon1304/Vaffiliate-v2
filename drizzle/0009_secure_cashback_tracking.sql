ALTER TABLE "public"."tracking_links"
ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE "public"."clicks"
ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS "tracking_links_select_own"
ON "public"."tracking_links";
--> statement-breakpoint

CREATE POLICY "tracking_links_select_own"
ON "public"."tracking_links"
AS PERMISSIVE
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = "publisher_id");
--> statement-breakpoint

DROP POLICY IF EXISTS "tracking_links_update_own"
ON "public"."tracking_links";
--> statement-breakpoint

CREATE POLICY "tracking_links_update_own"
ON "public"."tracking_links"
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING ((SELECT auth.uid()) = "publisher_id")
WITH CHECK ((SELECT auth.uid()) = "publisher_id");
--> statement-breakpoint

DROP POLICY IF EXISTS "clicks_select_own"
ON "public"."clicks";
--> statement-breakpoint

CREATE POLICY "clicks_select_own"
ON "public"."clicks"
AS PERMISSIVE
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = "publisher_id");
--> statement-breakpoint

REVOKE ALL PRIVILEGES
ON TABLE "public"."tracking_links"
FROM PUBLIC;
--> statement-breakpoint

REVOKE ALL PRIVILEGES
ON TABLE "public"."tracking_links"
FROM anon;
--> statement-breakpoint

REVOKE ALL PRIVILEGES
ON TABLE "public"."tracking_links"
FROM authenticated;
--> statement-breakpoint

REVOKE ALL PRIVILEGES
ON TABLE "public"."clicks"
FROM PUBLIC;
--> statement-breakpoint

REVOKE ALL PRIVILEGES
ON TABLE "public"."clicks"
FROM anon;
--> statement-breakpoint

REVOKE ALL PRIVILEGES
ON TABLE "public"."clicks"
FROM authenticated;
--> statement-breakpoint

GRANT SELECT
ON TABLE "public"."tracking_links"
TO authenticated;
--> statement-breakpoint

GRANT UPDATE (
  "status",
  "updated_at"
)
ON TABLE "public"."tracking_links"
TO authenticated;
--> statement-breakpoint

GRANT SELECT
ON TABLE "public"."clicks"
TO authenticated;-- Custom SQL migration file, put your code below! --