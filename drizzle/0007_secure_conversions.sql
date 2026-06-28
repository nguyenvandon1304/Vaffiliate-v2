ALTER TABLE "public"."conversions"
ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS "conversions_select_own"
ON "public"."conversions";
--> statement-breakpoint

CREATE POLICY "conversions_select_own"
ON "public"."conversions"
AS PERMISSIVE
FOR SELECT
TO authenticated
USING ((select auth.uid()) = "publisher_id");
--> statement-breakpoint

REVOKE ALL PRIVILEGES
ON TABLE "public"."conversions"
FROM PUBLIC;
--> statement-breakpoint

REVOKE ALL PRIVILEGES
ON TABLE "public"."conversions"
FROM anon;
--> statement-breakpoint

REVOKE ALL PRIVILEGES
ON TABLE "public"."conversions"
FROM authenticated;
--> statement-breakpoint

GRANT SELECT
ON TABLE "public"."conversions"
TO authenticated;
