import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { TrackingLinkStatus } from "@/types/affiliate";
import type {
  CashbackPlatformCode,
  CashbackTrackingLinkResult,
} from "@/types/cashback";

interface CashbackTrackingLinkDatabaseRow {
  id: string;
  short_code: string;
  destination_url: string;
  platform: string;
  campaign_id: string | null;
  offer_id: string | null;
  status: string;
  created_at: string;
  network_sub_id: string;
  affiliate_url: string | null;
}

const supportedPlatforms =
  new Set<CashbackPlatformCode>([
    "shopee",
    "tiktok",
  ]);

const trackingLinkStatuses =
  new Set<TrackingLinkStatus>([
    "active",
    "paused",
    "disabled",
  ]);

function parsePlatform(
  value: string,
): CashbackPlatformCode {
  if (
    !supportedPlatforms.has(
      value as CashbackPlatformCode,
    )
  ) {
    throw new Error(
      `Unsupported cashback platform: ${value}`,
    );
  }

  return value as CashbackPlatformCode;
}

function parseTrackingLinkStatus(
  value: string,
): TrackingLinkStatus {
  if (
    !trackingLinkStatuses.has(
      value as TrackingLinkStatus,
    )
  ) {
    throw new Error(
      `Unsupported tracking link status: ${value}`,
    );
  }

  return value as TrackingLinkStatus;
}

function mapTrackingLinkRow(
  row: CashbackTrackingLinkDatabaseRow,
): CashbackTrackingLinkResult {
  return {
    id: row.id,
    shortCode: row.short_code,
    destinationUrl: row.destination_url,
    platform: parsePlatform(row.platform),
    campaignId: row.campaign_id,
    offerId: row.offer_id,
    status: parseTrackingLinkStatus(row.status),
    createdAt: row.created_at,
    networkSubId: row.network_sub_id,
    affiliateUrl: row.affiliate_url,
    trackingPath: `/go/${encodeURIComponent(
      row.short_code,
    )}`,
  };
}

export async function createCashbackTrackingLinkAsync(
  platform: CashbackPlatformCode,
  destinationUrl: string,
): Promise<CashbackTrackingLinkResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error(
      "Authentication is required to create a cashback tracking link",
    );
  }

  const { data, error } = await supabase.rpc(
    "create_cashback_tracking_link",
    {
      p_platform: platform,
      p_destination_url: destinationUrl,
    },
  );

  if (error) {
    throw new Error(
      `Unable to create cashback tracking link: ${error.message}`,
    );
  }

  const rows =
    (data ?? []) as unknown as CashbackTrackingLinkDatabaseRow[];

  const row = rows[0];

  if (!row) {
    throw new Error(
      "Cashback tracking link RPC returned no result",
    );
  }

  return mapTrackingLinkRow(row);
}