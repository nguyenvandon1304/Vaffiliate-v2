CREATE TABLE "advertisers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"platform" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "advertisers_platform_check" CHECK ("advertisers"."platform" in ('shopee', 'tiktok')),
	CONSTRAINT "advertisers_status_check" CHECK ("advertisers"."status" in ('active', 'disabled')),
	CONSTRAINT "advertisers_id_not_blank_check" CHECK (char_length(trim("advertisers"."id")) > 0),
	CONSTRAINT "advertisers_name_not_blank_check" CHECK (char_length(trim("advertisers"."name")) > 0)
);
--> statement-breakpoint
ALTER TABLE "advertisers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"advertiser_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaigns_id_not_blank_check" CHECK (char_length(trim("campaigns"."id")) > 0),
	CONSTRAINT "campaigns_name_not_blank_check" CHECK (char_length(trim("campaigns"."name")) > 0),
	CONSTRAINT "campaigns_status_check" CHECK ("campaigns"."status" in ('active', 'paused', 'disabled'))
);
--> statement-breakpoint
ALTER TABLE "campaigns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cashback_policies" (
	"offer_id" text PRIMARY KEY NOT NULL,
	"cashback_share_bps" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cashback_policies_share_bps_range_check" CHECK ("cashback_policies"."cashback_share_bps" between 0 and 10000)
);
--> statement-breakpoint
ALTER TABLE "cashback_policies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "offers" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offers_id_not_blank_check" CHECK (char_length(trim("offers"."id")) > 0),
	CONSTRAINT "offers_name_not_blank_check" CHECK (char_length(trim("offers"."name")) > 0),
	CONSTRAINT "offers_status_check" CHECK ("offers"."status" in ('active', 'paused', 'disabled'))
);
--> statement-breakpoint
ALTER TABLE "offers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_advertiser_id_advertisers_id_fk" FOREIGN KEY ("advertiser_id") REFERENCES "public"."advertisers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashback_policies" ADD CONSTRAINT "cashback_policies_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaigns_advertiser_idx" ON "campaigns" USING btree ("advertiser_id");--> statement-breakpoint
CREATE INDEX "offers_campaign_idx" ON "offers" USING btree ("campaign_id");