import { createHash } from "node:crypto";

export const PHASE20K_ISOLATED_TARGET_ACKNOWLEDGEMENT =
  "PHASE20K_ISOLATED_TARGET_APPROVED" as const;

const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const DIRECT_HOST_PATTERN = /^db\.([a-z0-9]{20})\.supabase\.co$/;
const POOLER_HOST_PATTERN =
  /^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/;
const PASSWORD_PLACEHOLDERS = new Set([
  "[YOUR-PASSWORD]",
  "YOUR_PASSWORD",
  "YOUR-PASSWORD",
  "YOUR PASSWORD",
  "PASSWORD_HERE",
  "PASSWORD-HERE",
  "PASSWORD HERE",
  "YOUR_DB_PASSWORD",
  "YOUR-DATABASE-PASSWORD",
  "DATABASE_PASSWORD",
  "DB_PASSWORD",
  "CHANGEME",
  "REPLACE_ME",
  "REPLACE-ME",
]);
const ANGLE_BRACKET_PLACEHOLDER_PATTERN =
  /^<[a-z0-9]+(?:[ _-][a-z0-9]+)*>$/i;
const SQUARE_BRACKET_PLACEHOLDER_PATTERN =
  /^\[[a-z0-9]+(?:[ _-][a-z0-9]+)*\]$/i;

export type Phase20kTargetConnectionKind = "direct" | "pooler";

export type Phase20kTargetGuardReason =
  | "approved"
  | "missing_database_url"
  | "malformed_database_url"
  | "unsupported_database_url"
  | "ambiguous_project_identity"
  | "missing_expected_target_hash"
  | "invalid_expected_target_hash"
  | "missing_damaged_target_hash"
  | "invalid_damaged_target_hash"
  | "damaged_target_forbidden"
  | "target_not_approved"
  | "invalid_acknowledgement";

export interface Phase20kTargetGuardInput {
  readonly databaseUrl?: string | null;
  readonly expectedTargetProjectRefSha256?: string | null;
  readonly damagedProjectRefSha256?: string | null;
  readonly acknowledgement?: string | null;
}

export type Phase20kTargetGuardResult =
  | {
      readonly approved: true;
      readonly reason: "approved";
      readonly connectionKind: Phase20kTargetConnectionKind;
      readonly identityHash: string;
      readonly identityFingerprint: string;
    }
  | {
      readonly approved: false;
      readonly reason: Exclude<Phase20kTargetGuardReason, "approved">;
    };

interface ExtractedIdentity {
  readonly connectionKind: Phase20kTargetConnectionKind;
  readonly projectRef: string;
}

function denied(
  reason: Exclude<Phase20kTargetGuardReason, "approved">,
): Phase20kTargetGuardResult {
  return Object.freeze({ approved: false, reason });
}

function normalizeHash(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function extractHostedSupabaseIdentity(
  databaseUrl: string,
):
  | ExtractedIdentity
  | Exclude<Phase20kTargetGuardReason, "approved"> {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    return "malformed_database_url";
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    return "unsupported_database_url";
  }

  let password: string;
  let pathname: string;
  try {
    password = decodeURIComponent(parsed.password);
    pathname = decodeURIComponent(parsed.pathname);
  } catch {
    return "malformed_database_url";
  }

  const normalizedPassword = password.trim();
  if (
    normalizedPassword.length === 0 ||
    PASSWORD_PLACEHOLDERS.has(normalizedPassword.toUpperCase()) ||
    ANGLE_BRACKET_PLACEHOLDER_PATTERN.test(normalizedPassword) ||
    SQUARE_BRACKET_PLACEHOLDER_PATTERN.test(normalizedPassword)
  ) {
    return "unsupported_database_url";
  }

  if (pathname !== "/postgres") {
    return "unsupported_database_url";
  }

  let username: string;
  try {
    username = decodeURIComponent(parsed.username).toLowerCase();
  } catch {
    return "malformed_database_url";
  }

  const hostname = parsed.hostname.toLowerCase();
  const directMatch = DIRECT_HOST_PATTERN.exec(hostname);
  if (directMatch) {
    const projectRef = directMatch[1]!;
    const usernameMatch = /^postgres\.([a-z0-9]{20})$/.exec(username);
    if (usernameMatch && usernameMatch[1] !== projectRef) {
      return "ambiguous_project_identity";
    }
    if (username !== "postgres" && !usernameMatch) {
      return "unsupported_database_url";
    }
    return { connectionKind: "direct", projectRef };
  }

  if (POOLER_HOST_PATTERN.test(hostname)) {
    const usernameMatch = /^postgres\.([a-z0-9]{20})$/.exec(username);
    if (!usernameMatch) {
      return "ambiguous_project_identity";
    }
    return {
      connectionKind: "pooler",
      projectRef: usernameMatch[1]!,
    };
  }

  return "unsupported_database_url";
}

export function sha256SupabaseProjectRef(projectRef: string): string {
  const normalized = projectRef.trim().toLowerCase();
  if (!PROJECT_REF_PATTERN.test(normalized)) {
    throw new Error("invalid_project_ref");
  }
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

export function validatePhase20kIntegrationTarget(
  input: Phase20kTargetGuardInput,
): Phase20kTargetGuardResult {
  const databaseUrl = input.databaseUrl?.trim() ?? "";
  if (databaseUrl.length === 0) {
    return denied("missing_database_url");
  }

  const expectedHash = normalizeHash(
    input.expectedTargetProjectRefSha256,
  );
  if (!expectedHash) {
    return denied("missing_expected_target_hash");
  }
  if (!SHA256_PATTERN.test(expectedHash)) {
    return denied("invalid_expected_target_hash");
  }

  const damagedHash = normalizeHash(input.damagedProjectRefSha256);
  if (!damagedHash) {
    return denied("missing_damaged_target_hash");
  }
  if (!SHA256_PATTERN.test(damagedHash)) {
    return denied("invalid_damaged_target_hash");
  }

  if (
    input.acknowledgement !==
    PHASE20K_ISOLATED_TARGET_ACKNOWLEDGEMENT
  ) {
    return denied("invalid_acknowledgement");
  }

  const extracted = extractHostedSupabaseIdentity(databaseUrl);
  if (typeof extracted === "string") {
    return denied(extracted);
  }

  const identityHash = sha256SupabaseProjectRef(extracted.projectRef);
  if (identityHash === damagedHash) {
    return denied("damaged_target_forbidden");
  }
  if (identityHash !== expectedHash) {
    return denied("target_not_approved");
  }

  return Object.freeze({
    approved: true,
    reason: "approved",
    connectionKind: extracted.connectionKind,
    identityHash,
    identityFingerprint: `sha256:${identityHash.slice(0, 12)}`,
  });
}
