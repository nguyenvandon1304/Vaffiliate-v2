CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"full_name" text,
	"phone" text,
	"avatar_url" text,
	"member_tier" text DEFAULT 'standard' NOT NULL,
	"preferred_platforms" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "profiles"
ADD CONSTRAINT "profiles_user_id_auth_users_id_fk"
FOREIGN KEY ("user_id")
REFERENCES "auth"."users"("id")
ON DELETE CASCADE;

ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own"
ON "profiles"
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = "user_id");

CREATE POLICY "profiles_insert_own"
ON "profiles"
FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) = "user_id");

CREATE POLICY "profiles_update_own"
ON "profiles"
FOR UPDATE
TO authenticated
USING ((SELECT auth.uid()) = "user_id")
WITH CHECK ((SELECT auth.uid()) = "user_id");
