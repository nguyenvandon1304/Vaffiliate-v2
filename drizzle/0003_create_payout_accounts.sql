CREATE TABLE "payout_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"method" text DEFAULT 'bank' NOT NULL,
	"provider" text NOT NULL,
	"account_name" text NOT NULL,
	"account_number" text NOT NULL,
	"status" text DEFAULT 'unverified' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payout_accounts_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "payout_accounts_method_check" CHECK ("payout_accounts"."method" = 'bank'),
	CONSTRAINT "payout_accounts_status_check" CHECK ("payout_accounts"."status" in ('unverified', 'verified', 'rejected', 'disabled'))
);
--> statement-breakpoint
ALTER TABLE "payout_accounts" ADD CONSTRAINT "payout_accounts_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;