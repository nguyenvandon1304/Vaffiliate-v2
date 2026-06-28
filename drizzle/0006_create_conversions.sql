CREATE TABLE "conversions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"network" text NOT NULL,
	"external_order_id" text NOT NULL,
	"publisher_id" uuid NOT NULL,
	"advertiser_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"offer_id" text NOT NULL,
	"tracking_link_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"order_amount" bigint NOT NULL,
	"network_commission" bigint NOT NULL,
	"user_cashback" bigint NOT NULL,
	"platform_profit" bigint NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"approved_at" timestamp with time zone,
	"payable_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"rejected_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversions_network_external_order_unique" UNIQUE("network","external_order_id"),
	CONSTRAINT "conversions_network_not_blank_check" CHECK (char_length(trim("conversions"."network")) > 0),
	CONSTRAINT "conversions_external_order_id_not_blank_check" CHECK (char_length(trim("conversions"."external_order_id")) > 0),
	CONSTRAINT "conversions_advertiser_id_not_blank_check" CHECK (char_length(trim("conversions"."advertiser_id")) > 0),
	CONSTRAINT "conversions_campaign_id_not_blank_check" CHECK (char_length(trim("conversions"."campaign_id")) > 0),
	CONSTRAINT "conversions_offer_id_not_blank_check" CHECK (char_length(trim("conversions"."offer_id")) > 0),
	CONSTRAINT "conversions_tracking_link_id_not_blank_check" CHECK (char_length(trim("conversions"."tracking_link_id")) > 0),
	CONSTRAINT "conversions_status_check" CHECK ("conversions"."status" in (
        'pending',
        'approved',
        'rejected',
        'payable',
        'paid'
      )),
	CONSTRAINT "conversions_order_amount_non_negative_check" CHECK ("conversions"."order_amount" >= 0),
	CONSTRAINT "conversions_network_commission_non_negative_check" CHECK ("conversions"."network_commission" >= 0),
	CONSTRAINT "conversions_user_cashback_non_negative_check" CHECK ("conversions"."user_cashback" >= 0),
	CONSTRAINT "conversions_platform_profit_non_negative_check" CHECK ("conversions"."platform_profit" >= 0),
	CONSTRAINT "conversions_commission_allocation_check" CHECK ("conversions"."network_commission" = "conversions"."user_cashback" + "conversions"."platform_profit"),
	CONSTRAINT "conversions_rejection_metadata_check" CHECK (
        (
          "conversions"."status" = 'rejected'
          and "conversions"."rejected_at" is not null
          and nullif(trim("conversions"."rejected_reason"), '') is not null
        )
        or
        (
          "conversions"."status" <> 'rejected'
          and "conversions"."rejected_at" is null
          and "conversions"."rejected_reason" is null
        )
      ),
	CONSTRAINT "conversions_approved_at_check" CHECK (
        (
          "conversions"."status" in ('approved', 'payable', 'paid')
          and "conversions"."approved_at" is not null
        )
        or
        (
          "conversions"."status" in ('pending', 'rejected')
          and "conversions"."approved_at" is null
        )
      ),
	CONSTRAINT "conversions_payable_at_check" CHECK (
        (
          "conversions"."status" in ('payable', 'paid')
          and "conversions"."payable_at" is not null
        )
        or
        (
          "conversions"."status" in ('pending', 'approved', 'rejected')
          and "conversions"."payable_at" is null
        )
      ),
	CONSTRAINT "conversions_paid_at_check" CHECK (
        (
          "conversions"."status" = 'paid'
          and "conversions"."paid_at" is not null
        )
        or
        (
          "conversions"."status" <> 'paid'
          and "conversions"."paid_at" is null
        )
      ),
	CONSTRAINT "conversions_lifecycle_timestamp_order_check" CHECK (
        ("conversions"."approved_at" is null or "conversions"."approved_at" >= "conversions"."occurred_at")
        and
        (
          "conversions"."payable_at" is null
          or (
            "conversions"."approved_at" is not null
            and "conversions"."payable_at" >= "conversions"."approved_at"
          )
        )
        and
        (
          "conversions"."paid_at" is null
          or (
            "conversions"."payable_at" is not null
            and "conversions"."paid_at" >= "conversions"."payable_at"
          )
        )
        and
        (
          "conversions"."rejected_at" is null
          or "conversions"."rejected_at" >= "conversions"."occurred_at"
        )
      )
);
--> statement-breakpoint
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_publisher_id_profiles_user_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversions_publisher_occurred_at_idx" ON "conversions" USING btree ("publisher_id","occurred_at");