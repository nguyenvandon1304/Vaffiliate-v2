import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Conversion } from "@/types/affiliate";

import {
  mapConversionRow,
  type ConversionDatabaseRow,
} from "./publisher-conversion.mapper";

export async function getPublisherConversionsAsync(): Promise<
  Conversion[]
> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(
      `Unable to authenticate publisher: ${userError.message}`,
    );
  }

  if (!user) {
    throw new Error(
      "Authentication is required to load conversions",
    );
  }

  const { data, error } = await supabase
    .from("conversions")
    .select(
      [
        "id",
        "external_order_id",
        "publisher_id",
        "advertiser_id",
        "campaign_id",
        "offer_id",
        "tracking_link_id",
        "status",
        "order_amount",
        "network_commission",
        "user_cashback",
        "platform_profit",
        "occurred_at",
        "approved_at",
        "payable_at",
        "paid_at",
        "rejected_at",
        "rejected_reason",
      ].join(","),
    )
    .eq("publisher_id", user.id)
    .order("occurred_at", {
      ascending: false,
    });

  if (error) {
    throw new Error(
      `Unable to load publisher conversions: ${error.message}`,
    );
  }

  const rows =
    (data ?? []) as unknown as ConversionDatabaseRow[];

  return rows.map(mapConversionRow);
}
