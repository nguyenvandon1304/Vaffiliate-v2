/**
 * Phase 20K -- reconciliation actor model.
 *
 * Centralises the two closed actor kinds Phase 20K can stamp on
 * an audit row. The actor is NEVER sourced from FormData; it is
 * always derived from `requireAdmin()` server-side (admin kind) or
 * from a closed system sentinel (system kind, reserved for the
 * future settlement pipeline).
 *
 * This module is intentionally pure (no DB / no `server-only`) so
 * the existing pure-layer unit tests can import it without
 * tripping the server-only boundary.
 */

import type { AppRole } from "@/lib/auth/roles";

/**
 * Closed enumeration of actor kinds Phase 20K can stamp on a
 * reconciliation audit event. Mirrors the
 * `reconciliation_audit_events_actor_kind_check` DB CHECK.
 */
export type ReconciliationActorKind = "admin" | "system";

/**
 * The closed sentinel UUID used by future settlement / payout
 * pipelines when a reconciliation transition is triggered by
 * something other than an authenticated admin click. The value is
 * the all-zero UUID because the actor for `system` rows is
 * intentionally NULL in the audit row -- this constant exists so
 * call sites that need to detect a system actor can compare
 * against a single, named value.
 *
 * Phase 20K only ever inserts `'admin'` rows; `'system'` is
 * reserved.
 */
export const SYSTEM_ACTOR_USER_ID =
  "00000000-0000-4000-8000-000000000000";

/**
 * Server-derived actor handle for reconciliation audit events.
 *
 * `actorKind = 'admin'` requires a non-empty `actorUserId` and an
 * admin or super_admin `actorRole`. `actorKind = 'system'` requires
 * BOTH `actorUserId` and `actorRole` to be absent; the call site
 * is responsible for asserting that the actor is genuinely
 * system-triggered (Phase 20K only ever constructs `'admin'`).
 */
export interface ReconciliationActor {
  readonly actorKind: ReconciliationActorKind;
  readonly actorUserId: string | null;
  readonly actorRole: AppRole | null;
}

export class ReconciliationActorError extends Error {
  constructor(
    public readonly reason:
      | "missing_admin_user_id"
      | "non_admin_role"
      | "invalid_user_id_shape"
      | "system_with_user_id"
      | "system_with_role"
      | "unknown_actor_kind",
    message: string,
  ) {
    super(message);
    this.name = "ReconciliationActorError";
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Build the `ReconciliationActor` record that will be stamped on
 * an audit row. The function REFUSES to construct a valid actor
 * from anything other than a non-empty user id paired with an
 * `admin` or `super_admin` role.
 *
 * The signature deliberately has no `actorId`/`actorName`/
 * `actorEmail` field -- the actor identity is a single opaque
 * user id, never anything that can be spoofed from FormData.
 */
export function buildReconciliationAdminActor(input: {
  readonly actorUserId: string;
  readonly actorRole: AppRole;
}): ReconciliationActor {
  if (typeof input.actorUserId !== "string" || input.actorUserId.length === 0) {
    throw new ReconciliationActorError(
      "missing_admin_user_id",
      "actorUserId must be a non-empty string",
    );
  }
  if (!UUID_PATTERN.test(input.actorUserId)) {
    throw new ReconciliationActorError(
      "invalid_user_id_shape",
      "actorUserId must be a UUID-shaped string",
    );
  }
  if (input.actorRole !== "admin" && input.actorRole !== "super_admin") {
    throw new ReconciliationActorError(
      "non_admin_role",
      "Reconciliation admin actor requires role 'admin' or 'super_admin' (got '" +
        String(input.actorRole) +
        "')",
    );
  }
  return {
    actorKind: "admin",
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
  };
}

/**
 * Build a closed `'system'` actor. Phase 20K never calls this in
 * production code paths; it exists for future settlement / payout
 * pipelines and for unit tests that need to construct a system
 * actor.
 */
export function buildReconciliationSystemActor(): ReconciliationActor {
  return {
    actorKind: "system",
    actorUserId: null,
    actorRole: null,
  };
}