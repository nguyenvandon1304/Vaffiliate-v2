import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  Conversion,
  ConversionStatus,
} from "@/types/affiliate";

type DatabaseMoneyValue = number | string;

interface ConversionDatabaseRow {
  id: string;
  external_order_id: string;
  publisher_id: string;
  advertiser_id: string;
  campaign_id: string;
  offer_id: string;
  tracking_link_id: string;
  status: string;
  order_amount: DatabaseMoneyValue;
  network_commission: DatabaseMoneyValue;
  user_cashback: DatabaseMoneyValue;
  platform_profit: DatabaseMoneyValue;
  occurred_at: string;
  approved_at: string | null;
  payable_at: string | null;
  paid_at: string | null;
  rejected_at: string | null;
  rejected_reason: string | null;
}

const conversionStatuses = new Set<ConversionStatus>([
  "pending",
  "approved",
  "rejected",
  "payable",
  "paid",
]);

function parseConversionStatus(value: string): ConversionStatus {
  if (!conversionStatuses.has(value as ConversionStatus)) {
    throw new Error(`Unsupported conversion status: ${value}`);
  }

  return value as ConversionStatus;
}

function parseMoneyAmount(
  value: DatabaseMoneyValue,
  fieldName: string,
): number {
  const amount =
    typeof value === "number" ? value : Number(value);

  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error(
      `Invalid conversion money value for ${fieldName}`,
    );
  }

  return amount;
}

function toVietnamDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid conversion timestamp: ${value}`);
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find(
    (part) => part.type === "year",
  )?.value;

  const month = parts.find(
    (part) => part.type === "month",
  )?.value;

  const day = parts.find(
    (part) => part.type === "day",
  )?.value;

  if (!year || !month || !day) {
    throw new Error(
      `Unable to format conversion timestamp: ${value}`,
    );
  }

  return `${year}-${month}-${day}`;
}

function toOptionalVietnamDate(
  value: string | null,
): string | undefined {
  return value ? toVietnamDate(value) : undefined;
}

function mapConversionRow(
  row: ConversionDatabaseRow,
): Conversion {
  return {
    id: row.id as Conversion["id"],
    orderId:
      row.external_order_id as Conversion["orderId"],
    publisherId:
      row.publisher_id as Conversion["publisherId"],
    advertiserId:
      row.advertiser_id as Conversion["advertiserId"],
    campaignId:
      row.campaign_id as Conversion["campaignId"],
    offerId: row.offer_id as Conversion["offerId"],
    trackingLinkId:
      row.tracking_link_id as Conversion["trackingLinkId"],

    status: parseConversionStatus(row.status),

    orderAmount: {
      amount: parseMoneyAmount(
        row.order_amount,
        "order_amount",
      ),
      currency: "VND",
    },

    networkCommission: {
      amount: parseMoneyAmount(
        row.network_commission,
        "network_commission",
      ),
      currency: "VND",
    },

    userCashback: {
      amount: parseMoneyAmount(
        row.user_cashback,
        "user_cashback",
      ),
      currency: "VND",
    },

    platformProfit: {
      amount: parseMoneyAmount(
        row.platform_profit,
        "platform_profit",
      ),
      currency: "VND",
    },

    occurredAt: toVietnamDate(row.occurred_at),
    approvedAt: toOptionalVietnamDate(row.approved_at),
    payableAt: toOptionalVietnamDate(row.payable_at),
    paidAt: toOptionalVietnamDate(row.paid_at),
    rejectedAt: toOptionalVietnamDate(row.rejected_at),
    rejectedReason: row.rejected_reason ?? undefined,
  };
}

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
