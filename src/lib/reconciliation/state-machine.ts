/**
 * Phase 20K -- reconciliation state machine.
 *
 * Drives the explicit `conversions.status` transitions:
 *
 *   pending  -> approved
 *   pending  -> rejected
 *   approved -> payable
 *   approved -> rejected   (allowed only with explicit reason;
 *                           reconciliation never assumes approval
 *                           is irreversible)
 *   payable  -> paid       (only settlement -> paid; Phase 20K does
 *                           not implement the payout channel, this
 *                           path is reserved for a later settlement
 *                           pipeline)
 *   rejected                terminal in this phase (no reversal path
 *                           is shipped)
 *   paid                    terminal in this phase (no reversal path
 *                           is shipped)
 *
 * `paid` and `rejected` are terminal -- the engine refuses any
 * forward transition from them. `pending` is the only entry state.
 *
 * The state machine is intentionally pure. The reconciliation engine
 * passes (current status, proposed next status) into
 * {@link canTransition}; the engine + repository decide whether
 * the resulting transition is also authorised by the surrounding
 * context (FOR UPDATE row lock, audit entry, etc.).
 */

import type { ConversionStatus } from "@/types/affiliate";

export type ReconciliationDecision =
  | "approve"
  | "reject"
  | "mark_payable"
  | "mark_paid"
  | "reverse_to_pending";

export interface TransitionAttempt {
  readonly currentStatus: ConversionStatus;
  readonly nextStatus: ConversionStatus;
}

export class StateTransitionError extends Error {
  constructor(
    public readonly currentStatus: ConversionStatus,
    public readonly nextStatus: ConversionStatus,
    public readonly reason:
      | "terminal_state"
      | "forward_only"
      | "unknown_transition"
      | "invalid_inputs",
    message: string,
  ) {
    super(message);
    this.name = "StateTransitionError";
  }
}

/**
 * Explicit, exhaustive transition table. Every entry is
 * `(current, next) -> boolean`. Defaulting to `false` on lookup
 * keeps the engine from accidentally accepting an unreviewed path.
 */
export const ALLOWED_TRANSITIONS: Readonly<
  Record<ConversionStatus, ReadonlyArray<ConversionStatus>>
> = Object.freeze({
  pending: Object.freeze<ConversionStatus[]>([
    "approved",
    "rejected",
  ]),
  approved: Object.freeze<ConversionStatus[]>([
    "payable",
    "rejected",
  ]),
  payable: Object.freeze<ConversionStatus[]>([
    "paid",
  ]),
  rejected: Object.freeze<ConversionStatus[]>([]),
  paid: Object.freeze<ConversionStatus[]>([]),
});

/**
 * Returns `true` exactly when `(currentStatus -> nextStatus)` is one
 * of the allowed forward transitions. Both terminal states return
 * `false` for everything.
 */
export function canTransition(
  currentStatus: ConversionStatus,
  nextStatus: ConversionStatus,
): boolean {
  if (currentStatus === nextStatus) return false;
  const allowed = ALLOWED_TRANSITIONS[currentStatus];
  return allowed.includes(nextStatus);
}

export function assertCanTransition(
  currentStatus: ConversionStatus,
  nextStatus: ConversionStatus,
): void {
  if (currentStatus === nextStatus) {
    throw new StateTransitionError(
      currentStatus,
      nextStatus,
      "forward_only",
      "No-op transitions are not allowed -- current and next status must differ",
    );
  }
  if (currentStatus === "rejected" || currentStatus === "paid") {
    throw new StateTransitionError(
      currentStatus,
      nextStatus,
      "terminal_state",
      "Conversion status '" + currentStatus + "' is terminal; cannot transition",
    );
  }
  if (!canTransition(currentStatus, nextStatus)) {
    throw new StateTransitionError(
      currentStatus,
      nextStatus,
      "unknown_transition",
      "Conversion cannot move from '" +
        currentStatus +
        "' to '" +
        nextStatus +
        "'",
    );
  }
}

/**
 * Returns `true` when the supplied status is terminal in Phase 20K.
 * Used by the engine to short-circuit retries safely.
 */
export function isTerminalStatus(status: ConversionStatus): boolean {
  return status === "rejected" || status === "paid";
}

/**
 * Returns `true` when `target` is a valid forward destination of
 * `source`. Same as {@link canTransition} but exposed under a more
 * descriptive alias so call sites that talk about "targets" read
 * naturally.
 */
export function isForwardTarget(
  source: ConversionStatus,
  target: ConversionStatus,
): boolean {
  return canTransition(source, target);
}
