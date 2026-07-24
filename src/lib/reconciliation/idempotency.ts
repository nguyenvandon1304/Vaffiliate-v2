/**
 * Phase 20K -- reconciliation idempotency key builder.
 *
 * Stable, deterministic key derived from the immutable source
 * identity that fed a conversion into the canonical
 * `conversions` table. The key is the engine's "did we already
 * decide on this row?" predicate and the database's unique-
 * conflict signal.
 *
 * Inputs:
 *
 *   - `network`: "shopee" / "manual" / "tiktok" (note: tiktok is
 *     explicitly OUT OF SCOPE for Phase 20K; the type accepts
 *     "tiktok" only so a future Phase 20K+ can build the same key
 *     unchanged. The commit path refuses tiktok through the
 *     network-level guard.)
 *   - `sourceConversionKey`: the partial-unique index on the
 *     `conversions` table that Phase 20G.2a introduced. The
 *     canonical Shopee key is a sha256-prefixed fingerprint of the
 *     source CSV row. Non-Shopee networks use other stable
 *     fingerprints defined elsewhere.
 *   - `previousStatus`: the conversion's `conversions.status`
 *     value at planning time. Mixing the previous status in
 *     prevents a "skip then re-approve" race from colliding with
 *     an earlier successful approve.
 *   - `nextStatus`: the target status of the planned transition.
 *     Mixing the next status in prevents "approve" and
 *     "mark_payable" decisions against the same
 *     `(network, sourceConversionKey)` pair from colliding.
 *   - `decision`: the high-level reconciliation decision we
 *     propose to apply (approve / mark_payable / mark_paid /
 *     reject). The decision is also mixed into the key as
 *     defense in depth in case a future migration introduces a
 *     next-status enum wider than the current five-value domain.
 *   - `policyVersion`: the reconciliation policy identifier. The
 *     policy is currently a single integer constant (Phase 20K =
 *     1). Mixing the version in means a future change to the
 *     money-split rules can re-decide on the same conversion
 *     without colliding with the older audit rows.
 *
 * The key is a plain SHA-256 hex digest over the deterministic
 * UTF-8 serialisation
 * `network|sourceConversionKey|previousStatus|nextStatus|decision|policyVersion`.
 * We never include the actor -- a re-run by another admin produces
 * the same key, which is the whole point of idempotency.
 */

import type { ConversionStatus } from "@/types/affiliate";

/**
 * Network label accepted by the idempotency key builder. The
 * builder's `ALLOWED_NETWORKS` allowlist is narrower (only
 * `"shopee"` in Phase 20K); the wider type lets unit tests pass
 * a known-out-of-scope label like `"tiktok"` so the fail-closed
 * behaviour stays exercised at runtime.
 */
export type ReconciliationNetwork = "shopee" | "tiktok" | "manual";

export type ReconciliationDecisionKind =
  | "approve"
  | "mark_payable"
  | "mark_paid"
  | "reject";

/**
 * Reconciliation policy version. Bumped only when the rules that
 * decide money splits or allowed transitions change. Phase 20K
 * ships with version 1.
 */
export const RECONCILIATION_POLICY_VERSION = 1 as const;

const REJECTED_NETWORKS_MESSAGE =
  "Network '" +
  String("__placeholder__") +
  "' is not allowed for reconciliation in Phase 20K (only shopee)";

function utf8Encode(value: string): Uint8Array {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value);
  }
  // Fallback for runtimes without TextEncoder (extremely rare on
  // Node >=18, but the test runner may exercise such an env).
  const out = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) {
    out[i] = value.charCodeAt(i) & 0xff;
  }
  return out;
}

/**
 * Tiny in-module SHA-256 implementation. We intentionally do NOT
 * pull `node:crypto` here because this module must stay callable
 * from pure unit tests (no Node, no database). The implementation
 * is the standard FIPS-180-4 reference, hand-written so we keep
 * the dependency footprint at zero.
 *
 * Returns a 64-character lowercase hex digest.
 */
function sha256Hex(input: string): string {
  // SHA-256 constants
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);

  const bytes = utf8Encode(input);
  const bitLen = bytes.length * 8;
  const padLen = (bytes.length + 9 + 63) & ~63;
  const padded = new Uint8Array(padLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  // Append length as 64-bit big-endian. We only need the low 32
  // bits in practice (length fits in Uint32 for the test inputs we
  // accept), but we still write the high bits as zero so the
  // algorithm matches the spec.
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 4, bitLen, false);

  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ]);

  const W = new Uint32Array(64);
  for (let i = 0; i < padded.length; i += 64) {
    for (let t = 0; t < 16; t++) {
      W[t] = dv.getUint32(i + t * 4, false);
    }
    for (let t = 16; t < 64; t++) {
      const s0 =
        rotr(W[t - 15], 7) ^ rotr(W[t - 15], 18) ^ (W[t - 15] >>> 3);
      const s1 =
        rotr(W[t - 2], 17) ^ rotr(W[t - 2], 19) ^ (W[t - 2] >>> 10);
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
    }

    let a = H[0];
    let b = H[1];
    let c = H[2];
    let d = H[3];
    let e = H[4];
    let f = H[5];
    let g = H[6];
    let h = H[7];

    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const T1 = (h + S1 + ch + K[t] + W[t]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const T2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + T1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (T1 + T2) >>> 0;
    }

    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }

  let hex = "";
  for (let i = 0; i < 8; i++) {
    hex += H[i].toString(16).padStart(8, "0");
  }
  return hex;
}

function rotr(n: number, k: number): number {
  return ((n >>> k) | (n << (32 - k))) >>> 0;
}

export interface BuildIdempotencyKeyInput {
  readonly network: ReconciliationNetwork;
  readonly sourceConversionKey: string;
  readonly previousStatus: ConversionStatus;
  readonly nextStatus: ConversionStatus;
  readonly decision: ReconciliationDecisionKind;
  readonly policyVersion?: number;
}

export class IdempotencyKeyError extends Error {
  constructor(
    public readonly reason:
      | "blank_source_key"
      | "forbidden_network"
      | "unknown_decision"
      | "same_status_transition"
      | "non_integer_policy_version"
      | "missing_previous_status"
      | "missing_next_status",
    message: string,
  ) {
    super(message);
    this.name = "IdempotencyKeyError";
  }
}

const ALLOWED_NETWORKS: ReadonlyArray<ReconciliationNetwork> = Object.freeze([
  "shopee",
]);

const ALLOWED_DECISIONS: ReadonlyArray<ReconciliationDecisionKind> =
  Object.freeze([
    "approve",
    "mark_payable",
    "mark_paid",
    "reject",
  ]);

export function buildReconciliationIdempotencyKey(
  input: BuildIdempotencyKeyInput,
): string {
  if (typeof input.sourceConversionKey !== "string") {
    throw new IdempotencyKeyError(
      "blank_source_key",
      "sourceConversionKey must be a non-empty string",
    );
  }
  const trimmedKey = input.sourceConversionKey.trim();
  if (trimmedKey.length === 0) {
    throw new IdempotencyKeyError(
      "blank_source_key",
      "sourceConversionKey must be a non-empty string",
    );
  }
  if (!ALLOWED_NETWORKS.includes(input.network)) {
    // Refuse tiktok outright in Phase 20K. The error message uses
    // a placeholder so the literal network name only appears in
    // the bound variable, never in a string we author ahead of
    // time (defense in depth so we never accidentally hard-code
    // TikTok copy).
    throw new IdempotencyKeyError(
      "forbidden_network",
      REJECTED_NETWORKS_MESSAGE.replace("__placeholder__", input.network),
    );
  }
  if (!ALLOWED_DECISIONS.includes(input.decision)) {
    throw new IdempotencyKeyError(
      "unknown_decision",
      "Unknown reconciliation decision kind: " + String(input.decision),
    );
  }
  if (
    typeof input.previousStatus !== "string" ||
    input.previousStatus.length === 0
  ) {
    throw new IdempotencyKeyError(
      "missing_previous_status",
      "previousStatus must be a non-empty ConversionStatus string",
    );
  }
  if (
    typeof input.nextStatus !== "string" ||
    input.nextStatus.length === 0
  ) {
    throw new IdempotencyKeyError(
      "missing_next_status",
      "nextStatus must be a non-empty ConversionStatus string",
    );
  }
  if (input.previousStatus === input.nextStatus) {
    throw new IdempotencyKeyError(
      "same_status_transition",
      "previousStatus and nextStatus must differ -- no-op transitions are refused",
    );
  }
  const policyVersion =
    typeof input.policyVersion === "number"
      ? input.policyVersion
      : RECONCILIATION_POLICY_VERSION;
  if (!Number.isInteger(policyVersion) || policyVersion < 1) {
    throw new IdempotencyKeyError(
      "non_integer_policy_version",
      "policyVersion must be a positive integer (got " +
        String(policyVersion) +
        ")",
    );
  }
  return sha256Hex(
    input.network +
      "|" +
      trimmedKey +
      "|" +
      input.previousStatus +
      "|" +
      input.nextStatus +
      "|" +
      input.decision +
      "|" +
      String(policyVersion),
  );
}

/**
 * Lowercase, alphabetical, network-only stable fingerprint of a
 * conversion key + decision. Used in audit metadata to keep
 * internal identifiers trimmed to a single envelope. The full
 * 64-char hash is still available via
 * {@link buildReconciliationIdempotencyKey} when the engine needs
 * the canonical sha256 to write into the audit row.
 */
export function buildReconciliationShortId(
  input: BuildIdempotencyKeyInput,
): string {
  return buildReconciliationIdempotencyKey(input).slice(0, 16);
}
