CREATE TABLE "clicks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tracking_link_id" uuid NOT NULL,
	"publisher_id" uuid NOT NULL,
	"network_sub_id" text NOT NULL,
	"referrer" text,
	"user_agent_hash" text,
	"ip_hash" text,
	"fingerprint_hash" text,
	"is_unique" boolean DEFAULT true NOT NULL,
	"clicked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clicks_network_sub_id_unique" UNIQUE("network_sub_id"),
	CONSTRAINT "clicks_network_sub_id_not_blank_check" CHECK (char_length(trim("clicks"."network_sub_id")) > 0),
	CONSTRAINT "clicks_user_agent_hash_check" CHECK ("clicks"."user_agent_hash" is null or "clicks"."user_agent_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "clicks_ip_hash_check" CHECK ("clicks"."ip_hash" is null or "clicks"."ip_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "clicks_fingerprint_hash_check" CHECK ("clicks"."fingerprint_hash" is null or "clicks"."fingerprint_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "tracking_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publisher_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"destination_url" text NOT NULL,
	"campaign_id" text NOT NULL,
	"offer_id" text NOT NULL,
	"short_code" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracking_links_short_code_unique" UNIQUE("short_code"),
	CONSTRAINT "tracking_links_id_publisher_unique" UNIQUE("id","publisher_id"),
	CONSTRAINT "tracking_links_platform_check" CHECK ("tracking_links"."platform" in ('shopee', 'tiktok')),
	CONSTRAINT "tracking_links_destination_url_https_check" CHECK ("tracking_links"."destination_url" ~ '^https://'),
	CONSTRAINT "tracking_links_campaign_id_not_blank_check" CHECK (char_length(trim("tracking_links"."campaign_id")) > 0),
	CONSTRAINT "tracking_links_offer_id_not_blank_check" CHECK (char_length(trim("tracking_links"."offer_id")) > 0),
	CONSTRAINT "tracking_links_short_code_check" CHECK ("tracking_links"."short_code" ~ '^[A-Za-z0-9_-]{10,32}$'),
	CONSTRAINT "tracking_links_status_check" CHECK ("tracking_links"."status" in ('active', 'paused', 'disabled'))
);
--> statement-breakpoint
ALTER TABLE "clicks" ADD CONSTRAINT "clicks_publisher_id_profiles_user_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clicks" ADD CONSTRAINT "clicks_tracking_link_publisher_fk" FOREIGN KEY ("tracking_link_id","publisher_id") REFERENCES "public"."tracking_links"("id","publisher_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_links" ADD CONSTRAINT "tracking_links_publisher_id_profiles_user_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clicks_publisher_clicked_at_idx" ON "clicks" USING btree ("publisher_id","clicked_at");--> statement-breakpoint
CREATE INDEX "clicks_tracking_link_clicked_at_idx" ON "clicks" USING btree ("tracking_link_id","clicked_at");--> statement-breakpoint
CREATE INDEX "clicks_fingerprint_clicked_at_idx" ON "clicks" USING btree ("fingerprint_hash","clicked_at");--> statement-breakpoint
CREATE INDEX "tracking_links_publisher_created_at_idx" ON "tracking_links" USING btree ("publisher_id","created_at");