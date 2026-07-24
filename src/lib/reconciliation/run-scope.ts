/**
 * Phase 20K follow-up 2 -- pure run-scope planner.
 *
 * Given a list of `ReconciliationConversionSnapshot` rows + the
 * source-evidence mapper output for each, produce a typed plan
 * that the repository can persist into `reconciliation_runs` +
 * `reconciliation_run_candidates`.
 *
 * The planner is pure: no DB, no clock, no `server-only`. It
 * returns:
 *
 *   1. A per-candidate decision list (apply / skip / reject).
 *   2. A SHA-256 fingerprint of the candidate set (network +
 *      ordered source_conversion_key list + policy version).
 *   3. A typed `plannedIdempotencyKey` per candidate, derived
 *      from `buildReconciliationIdempotencyKey(...)` plus the
 *      `reconciliationRunId` so a same-run replay collides on
 *      the `(run_id, conversion_id)` UNIQUE constraint.
 */

import type { ConversionStatus } from "@/types/affiliate";

import { buildReconciliationIdempotencyKey, RECONCILIATION_POLICY_VERSION } from "./idempotency";
import { MoneySplitError, splitCommissionFloor } from "./money";
import {
  ALLOWED_RECONCILIATION_NETWORKS,
  type ReconciliationNetwork,
  mapSourceEvidenceToDecision,
  type SourceEvidenceReasonCode,
  type SourceEvidenceSnapshot,
} from "./source-evidence";

export interface RunScopeCandidateInput {
  readonly conversionId: string;
  readonly snapshot: SourceEvidenceSnapshot;
  /**
   * The conversion's persisted money split as the source of
   * truth. Phase 20K re-stamps this on every audit row so the
   * commission-allocation invariant
   * (`network = user + platform`) holds.
   */
  readonly commission: {
    readonly networkCommission: number;
    readonly cashbackShareBpsSnapshot: number | null | undefined;
    readonly userCashback: number;
    readonly platformProfit: number;
  };
}

export interface RunScopePlannedApply {
  readonly kind: "apply";
  readonly conversionId: string;
  readonly network: ReconciliationNetwork;
  readonly sourceConversionKey: string;
  readonly previousStatus: ConversionStatus;
  readonly nextStatus: Exclude<ConversionStatus, "paid">;
  readonly reasonCode: SourceEvidenceReasonCode;
  readonly plannedMoneyNetworkCommission: number;
  readonly plannedCashbackShareBps: number;
  readonly plannedMoneyUserCashback: number;
  readonly plannedMoneyPlatformProfit: number;
  readonly plannedIdempotencyKey: string;
  readonly provenanceFingerprint: string;
}

export interface RunScopePlannedReject {
  readonly kind: "reject";
  readonly conversionId: string;
  readonly network: ReconciliationNetwork;
  readonly sourceConversionKey: string;
  readonly previousStatus: ConversionStatus;
  readonly nextStatus: "rejected";
  readonly reasonCode: SourceEvidenceReasonCode;
  readonly plannedMoneyNetworkCommission: number;
  readonly plannedCashbackShareBps: number;
  readonly plannedMoneyUserCashback: number;
  readonly plannedMoneyPlatformProfit: number;
  readonly plannedIdempotencyKey: string;
  readonly provenanceFingerprint: string;
}

export interface RunScopePlannedSkip {
  readonly kind: "skip";
  readonly conversionId: string;
  readonly reasonCode: SourceEvidenceReasonCode;
}

export type RunScopePlanned =
  | RunScopePlannedApply
  | RunScopePlannedReject
  | RunScopePlannedSkip;

export interface RunScopePlan {
  readonly candidates: ReadonlyArray<RunScopePlanned>;
  readonly candidateFingerprint: string;
}

export interface RunScopeFingerprintInput {
  readonly runId: string;
  readonly network: ReconciliationNetwork;
  readonly orderedSourceConversionKeys: ReadonlyArray<string>;
  readonly policyVersion: number;
}

/**
 * Tiny inline SHA-256 (same algorithm as `idempotency.ts`).
 * The planner must stay free of `node:crypto` to keep its
 * purity contract with the existing reconciliation unit tests.
 */
function utf8Encode(value: string): Uint8Array {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value);
  }
  const out = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) {
    out[i] = value.charCodeAt(i) & 0xff;
  }
  return out;
}

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

function rotr(n: number, k: number): number {
  return ((n >>> k) | (n << (32 - k))) >>> 0;
}

function sha256Hex(input: string): string {
  const bytes = utf8Encode(input);
  const bitLen = bytes.length * 8;
  const padLen = (bytes.length + 9 + 63) & ~63;
  const padded = new Uint8Array(padLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
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

export function buildRunCandidateFingerprint(
  input: RunScopeFingerprintInput,
): string {
  if (!ALLOWED_RECONCILIATION_NETWORKS.includes(input.network)) {
    throw new Error(
      "run-scope: unknown network '" + String(input.network) + "'",
    );
  }
  const ordered = [...input.orderedSourceConversionKeys].sort();
  // The fingerprint deliberately EXCLUDES `runId` so two runs
  // over the same candidate set share the same fingerprint.
  // The durable identity of a run is its primary key id; this
  // fingerprint is a metadata summary that an analyst can use
  // to compare candidate sets across runs.
  return sha256Hex(
    input.network +
      "|" +
      ordered.join(",") +
      "|" +
      String(input.policyVersion),
  );
}

/**
 * Per-candidate provenance fingerprint. Binds the audit row to
 * the persisted source evidence so a future re-ingestion of the
 * same `sourceConversionKey` cannot silently produce a different
 * transition.
 */
export function buildProvenanceFingerprint(
  snapshot: SourceEvidenceSnapshot,
  plannedIdempotencyKey: string,
  cashbackShareBpsSnapshot: number,
): string {
  return sha256Hex(
    String(snapshot.network ?? "null") +
      "|" +
      String(snapshot.sourceConversionKey ?? "null") +
      "|" +
      String(snapshot.ingestionEventId ?? "null") +
      "|" +
      String(snapshot.validationStatus ?? "null") +
      "|" +
      String(snapshot.settlementStatus ?? "null") +
      "|" +
      String(snapshot.currentStatus) +
      "|" +
      String(snapshot.sourceStatus ?? "null") +
      "|" +
      String(snapshot.persistedLinkKind ?? "null") +
      "|" +
      String(cashbackShareBpsSnapshot) +
      "|" +
      plannedIdempotencyKey,
  );
}

export interface RunScopePlanInput {
  readonly network: ReconciliationNetwork;
  readonly runId: string;
  readonly candidates: ReadonlyArray<RunScopeCandidateInput>;
  readonly policyVersion?: number;
}

/**
 * Plan a single reconciliation run. Pure: input -> typed plan.
 *
 * The plan's `candidates` array is the candidate set the
 * repository will persist to `reconciliation_run_candidates` +
 * the candidate set commit will reload and apply. Candidates the
 * source-evidence mapper refuses are still recorded (so the run
 * can be queried later) but they carry a `skip` decision and the
 * repository never issues an UPDATE for them.
 */
export function planRunScope(input: RunScopePlanInput): RunScopePlan {
  if (!ALLOWED_RECONCILIATION_NETWORKS.includes(input.network)) {
    throw new Error(
      "run-scope: unknown network '" + String(input.network) + "'",
    );
  }
  const policyVersion = input.policyVersion ?? RECONCILIATION_POLICY_VERSION;

  const planned: RunScopePlanned[] = input.candidates.map((candidate) => {
    const decision = mapSourceEvidenceToDecision(candidate.snapshot);
    const sourceConversionKey =
      candidate.snapshot.sourceConversionKey ?? "";

    if (decision.kind === "skip") {
      return {
        kind: "skip",
        conversionId: candidate.conversionId,
        reasonCode: decision.reasonCode,
      };
    }

    let policySplit;
    try {
      policySplit = splitCommissionFloor(
        candidate.commission.networkCommission,
        candidate.commission.cashbackShareBpsSnapshot,
      );
    } catch (error) {
      const reasonCode: SourceEvidenceReasonCode =
        error instanceof MoneySplitError && error.reason === "missing_bps"
          ? "rejected_missing_cashback_policy"
          : "rejected_invalid_cashback_policy";
      return {
        kind: "skip",
        conversionId: candidate.conversionId,
        reasonCode,
      };
    }
    if (
      policySplit.userCashback !== candidate.commission.userCashback ||
      policySplit.platformProfit !== candidate.commission.platformProfit
    ) {
      return {
        kind: "skip",
        conversionId: candidate.conversionId,
        reasonCode: "rejected_cashback_policy_money_mismatch",
      };
    }

    const previousStatus = candidate.snapshot.currentStatus;
    const nextStatus = decision.nextStatus;
    const decisionKind =
      decision.kind === "apply"
        ? nextStatus === "approved"
          ? "approve"
          : nextStatus === "payable"
            ? "mark_payable"
            : "reject"
        : "reject";

    const plannedIdempotencyKey = buildReconciliationIdempotencyKey({
      network: input.network,
      sourceConversionKey,
      previousStatus,
      nextStatus,
      decision: decisionKind,
      policyVersion,
    });

    const provenanceFingerprint = buildProvenanceFingerprint(
      candidate.snapshot,
      plannedIdempotencyKey,
      policySplit.userCashbackBpsApplied,
    );

    // Phase 20K checkpoint 4E1 -- money policy for rejected
    // transitions. The previously-documented "zero/zero/zero
    // rejected split" was unsound: it silently replaced the
    // conversion's existing reconciled commission fields with
    // contradictory zero values and broke the commission
    // allocation invariant when (e.g.) the existing split was
    // a legitimate reconciliation of a CANCELLED order. The
    // policy in this checkpoint is: PRESERVE the conversion's
    // existing reconciled commission fields on a rejected
    // transition. The conversion UPDATE keeps the existing
    // `network_commission`, `user_cashback`, `platform_profit`
    // unchanged and only stamps `status = 'rejected'`,
    // `rejected_at`, and `rejected_reason`. This satisfies
    // the commission-allocation invariant
    // (`network = user + platform`) because the existing split
    // already satisfies it -- the rejection only changes the
    // status + audit + reconciliation markers, NOT the money.
    // No wallet, ledger, payout, or paid write is performed.
    const moneySplit = candidate.commission;

    if (decision.kind === "apply") {
      return {
        kind: "apply",
        conversionId: candidate.conversionId,
        network: decision.requiresNetwork,
        sourceConversionKey,
        previousStatus,
        nextStatus: decision.nextStatus,
        reasonCode: decision.reasonCode,
        plannedMoneyNetworkCommission: moneySplit.networkCommission,
        plannedCashbackShareBps: policySplit.userCashbackBpsApplied,
        plannedMoneyUserCashback: moneySplit.userCashback,
        plannedMoneyPlatformProfit: moneySplit.platformProfit,
        plannedIdempotencyKey,
        provenanceFingerprint,
      };
    }
    return {
      kind: "reject",
      conversionId: candidate.conversionId,
      network: input.network,
      sourceConversionKey,
      previousStatus,
      nextStatus: "rejected",
      reasonCode: decision.reasonCode,
      plannedMoneyNetworkCommission: moneySplit.networkCommission,
      plannedCashbackShareBps: policySplit.userCashbackBpsApplied,
      plannedMoneyUserCashback: moneySplit.userCashback,
      plannedMoneyPlatformProfit: moneySplit.platformProfit,
      plannedIdempotencyKey,
      provenanceFingerprint,
    };
  });

  const orderedKeys = planned
    .filter(
      (p): p is RunScopePlannedApply | RunScopePlannedReject =>
        p.kind !== "skip",
    )
    .map((p) => p.sourceConversionKey);
  const candidateFingerprint = buildRunCandidateFingerprint({
    runId: input.runId,
    network: input.network,
    orderedSourceConversionKeys: orderedKeys,
    policyVersion,
  });

  return { candidates: planned, candidateFingerprint };
}
