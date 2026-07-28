import { pathToFileURL } from "node:url";

import {
  sha256SupabaseProjectRef,
  validatePhase20kIntegrationTarget,
} from "./phase20k-integration-target-guard";

export interface Phase20mSafetyResult {
  readonly targetFingerprint: string;
  readonly apiFingerprint: string;
}

function apiProjectRef(apiUrl: string): string {
  let hostname: string;
  try {
    hostname = new URL(apiUrl).hostname.toLowerCase();
  } catch {
    throw new Error("phase20m_api_url_invalid");
  }
  const match = /^([a-z0-9]{20})\.supabase\.co$/.exec(hostname);
  if (!match) throw new Error("phase20m_api_project_identity_unsupported");
  return match[1]!;
}

export function validatePhase20mIntegrationSafety(): Phase20mSafetyResult {
  const guard = validatePhase20kIntegrationTarget({
    databaseUrl: process.env.DATABASE_URL,
    expectedTargetProjectRefSha256:
      process.env.PHASE20K_TARGET_PROJECT_REF_SHA256,
    damagedProjectRefSha256:
      process.env.PHASE20K_DAMAGED_PROJECT_REF_SHA256,
    noDamagedProjectAcknowledgement:
      process.env.PHASE20K_NO_DAMAGED_PROJECT_ACK,
    acknowledgement: process.env.PHASE20K_ISOLATED_TARGET_ACK,
  });
  if (!guard.approved) {
    throw new Error(`phase20m_target_guard_rejected:${guard.reason}`);
  }

  const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  if (!apiUrl) throw new Error("phase20m_api_url_missing");
  const apiHash = sha256SupabaseProjectRef(apiProjectRef(apiUrl));
  if (apiHash !== guard.identityHash) {
    throw new Error("phase20m_database_api_project_mismatch");
  }

  return Object.freeze({
    targetFingerprint: guard.identityFingerprint,
    apiFingerprint: `sha256:${apiHash.slice(0, 12)}`,
  });
}

const invokedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : "";
if (import.meta.url === invokedPath) {
  const result = validatePhase20mIntegrationSafety();
  process.stdout.write(
    `TARGET_GUARD_RESULT=PASS\nDATABASE_AND_API_PROJECT_MATCH=PASS\nTARGET_FINGERPRINT=${result.targetFingerprint}\nAPI_FINGERPRINT=${result.apiFingerprint}\n`,
  );
}
