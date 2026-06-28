import "server-only";

import type { CashbackClickRequestMetadata } from "@/lib/cashback/click-metadata";
import { createClient } from "@/lib/supabase/server";
import type { CashbackPlatformCode } from "@/types/cashback";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type RecordCashbackClickRow = {
  click_id: string;
  network_sub_id: string;
  destination_url: string;
  platform: string;
  is_unique: boolean;
  clicked_at: string;
};

export interface CashbackClickRecord {
  clickId: string;
  networkSubId: string;
  destinationUrl: string;
  platform: CashbackPlatformCode;
  isUnique: boolean;
  clickedAt: string;
}

export class CashbackTrackingLinkNotFoundError extends Error {
  constructor() {
    super("Active cashback tracking link was not found");
    this.name = "CashbackTrackingLinkNotFoundError";
  }
}

function matchesHostname(hostname: string, expectedDomain: string): boolean {
  return hostname === expectedDomain || hostname.endsWith(`.${expectedDomain}`);
}

function isAllowedDestination(
  platform: CashbackPlatformCode,
  destinationUrl: string,
): boolean {
  try {
    const url = new URL(destinationUrl);

    if (url.protocol !== "https:") {
      return false;
    }

    const hostname = url.hostname.toLowerCase();

    if (platform === "shopee") {
      return (
        matchesHostname(hostname, "shopee.vn") ||
        matchesHostname(hostname, "shopee.com") ||
        matchesHostname(hostname, "shope.ee")
      );
    }

    return matchesHostname(hostname, "tiktok.com");
  } catch {
    return false;
  }
}

function readPlatform(value: string): CashbackPlatformCode {
  if (value === "shopee" || value === "tiktok") {
    return value;
  }

  throw new Error("Cashback click RPC returned an unsupported platform");
}

function mapClickRow(row: RecordCashbackClickRow): CashbackClickRecord {
  const platform = readPlatform(row.platform);

  if (
    !row.click_id ||
    !row.network_sub_id ||
    !row.clicked_at ||
    typeof row.is_unique !== "boolean" ||
    !isAllowedDestination(platform, row.destination_url)
  ) {
    throw new Error("Cashback click RPC returned invalid data");
  }

  return {
    clickId: row.click_id,
    networkSubId: row.network_sub_id,
    destinationUrl: row.destination_url,
    platform,
    isUnique: row.is_unique,
    clickedAt: row.clicked_at,
  };
}

export async function recordCashbackClickAsync(
  supabase: SupabaseServerClient,
  shortCode: string,
  metadata: CashbackClickRequestMetadata,
): Promise<CashbackClickRecord> {
  const normalizedShortCode = shortCode.trim();

  if (!/^[A-Za-z0-9_-]{10,32}$/.test(normalizedShortCode)) {
    throw new CashbackTrackingLinkNotFoundError();
  }

  const { data, error } = await supabase.rpc("record_cashback_click", {
    p_short_code: normalizedShortCode,
    p_referrer: metadata.referrer,
    p_user_agent_hash: metadata.userAgentHash,
    p_ip_hash: metadata.ipHash,
    p_fingerprint_hash: metadata.fingerprintHash,
  });

  if (error) {
    if (error.code === "P0002") {
      throw new CashbackTrackingLinkNotFoundError();
    }

    throw new Error(`Unable to record cashback click: ${error.message}`);
  }

  const row = (data as RecordCashbackClickRow[] | null)?.[0];

  if (!row) {
    throw new Error("Cashback click RPC returned no data");
  }

  return mapClickRow(row);
}
