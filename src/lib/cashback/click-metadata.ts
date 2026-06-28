import "server-only";

import { createHmac } from "node:crypto";

const MAX_REFERRER_LENGTH = 2048;
const MAX_USER_AGENT_LENGTH = 1024;
const MAX_IP_LENGTH = 128;
const MAX_FORWARDED_FOR_LENGTH = 512;

export interface CashbackClickRequestMetadata {
  referrer: string | null;
  userAgentHash: string | null;
  ipHash: string | null;
  fingerprintHash: string | null;
}

function getHashSecret(): string {
  const secret = process.env.CASHBACK_CLICK_HASH_SECRET?.trim();

  if (!secret) {
    throw new Error("CASHBACK_CLICK_HASH_SECRET is required");
  }

  return secret;
}

function normalizeHeader(
  value: string | null,
  maxLength: number,
): string | null {
  const normalized = value?.trim();

  if (!normalized) {
    return null;
  }

  return normalized.slice(0, maxLength);
}

function createMetadataHash(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value, "utf8").digest("hex");
}

function readClientIp(headers: Headers): string | null {
  const forwardedFor = normalizeHeader(
    headers.get("x-forwarded-for"),
    MAX_FORWARDED_FOR_LENGTH,
  );

  const firstForwardedIp =
    forwardedFor
      ?.split(",")
      .map((value) => value.trim())
      .find(Boolean) ?? null;

  return normalizeHeader(
    firstForwardedIp ?? headers.get("x-real-ip"),
    MAX_IP_LENGTH,
  );
}

export function buildCashbackClickRequestMetadata(
  headers: Headers,
  userId: string,
): CashbackClickRequestMetadata {
  const normalizedUserId = userId.trim();

  if (!normalizedUserId) {
    throw new Error("Authenticated user ID is required");
  }

  const secret = getHashSecret();

  const referrer = normalizeHeader(headers.get("referer"), MAX_REFERRER_LENGTH);

  const userAgent = normalizeHeader(
    headers.get("user-agent"),
    MAX_USER_AGENT_LENGTH,
  );

  const clientIp = readClientIp(headers);

  const userAgentHash = userAgent
    ? createMetadataHash(userAgent, secret)
    : null;

  const ipHash = clientIp ? createMetadataHash(clientIp, secret) : null;

  const fingerprintHash =
    userAgent || clientIp
      ? createMetadataHash(
          [normalizedUserId, clientIp ?? "", userAgent ?? ""].join("\n"),
          secret,
        )
      : null;

  return {
    referrer,
    userAgentHash,
    ipHash,
    fingerprintHash,
  };
}
