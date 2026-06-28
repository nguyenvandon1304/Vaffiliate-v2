ALTER TABLE "public"."tracking_links"
ADD CONSTRAINT "tracking_links_classification_pair_check"
CHECK (
  (
    "campaign_id" IS NULL
    AND "offer_id" IS NULL
  )
  OR
  (
    "campaign_id" IS NOT NULL
    AND "offer_id" IS NOT NULL
  )
);