/**
 * Phase 20I.5 -- admin action audit log foundation.
 *
 * This module is intentionally a thin abstraction with no DB
 * writes. The team has chosen to defer persistent audit log
 * storage to a later phase; what we lock in now is the
 * vocabulary so admin server actions in this phase (and the
 * next) emit consistent records.
 *
 * The emitter is a no-op by default; the import boundary makes
 * it easy to swap in a real sink later (database, log file,
 * Supabase table, etc.) without touching the call sites.
 *
 * Sensitive material (passwords, API keys, raw affiliate URLs,
 * PII beyond the user id) MUST never end up in an `AdminAction`
 * record. The helper does not parse the payload -- callers
 * forward a pre-sanitised object.
 *
 * NOTE: This module deliberately does NOT import `server-only`
 * because the test runner does not load it as a React Server
 * Component. The server-side guards that call this emitter
 * (`requireAdmin()` in `./server-guard`) already run only on
 * the server.
 */

import { isAdmin, type AppRole } from "./roles";

/**
 * Stable set of admin action types. New values must be added
 * here, not inlined, so the audit vocabulary stays auditable.
 */
export type AdminActionKind =
  | "admin.addlivetag.import"
  | "admin.role.grant"
  | "admin.role.revoke"
  | "admin.payout.execute"
  | "admin.conversion.refund"
  | "admin.config.update";

export interface AdminAction {
  readonly kind: AdminActionKind;
  readonly actorUserId: string;
  readonly actorRole: AppRole;
  readonly targetType?: string;
  readonly targetId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

export type AdminActionSink = (record: AdminAction) => void | Promise<void>;

/**
 * No-op sink. The default emitter uses this so production code
 * that has not yet wired a real sink still type-checks and runs.
 * Tests can override the sink via {@link setAdminActionSink} or
 * the local `emitAdminAction(sink, ...)` helper.
 */
let activeSink: AdminActionSink = () => {
  /* no-op until a real sink is wired */
};

/**
 * Replace the default sink. Reserved for tests and for the
 * future wiring of a persistent sink.
 */
export function setAdminActionSink(sink: AdminActionSink): void {
  activeSink = sink;
}

export function getAdminActionSink(): AdminActionSink {
  return activeSink;
}

/**
 * Build an {@link AdminAction} record. The function does NOT
 * touch the network; it just stamps `createdAt` and forwards.
 *
 * `actorRole` is validated server-side: a `null` or `user` role
 * is refused (we never persist an audit record stamped by a
 * non-admin actor, even if a future caller forgets to guard).
 */
export function buildAdminAction(input: {
  readonly kind: AdminActionKind;
  readonly actorUserId: string;
  readonly actorRole: AppRole | null;
  readonly targetType?: string;
  readonly targetId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}): AdminAction | null {
  if (!isAdmin(input.actorRole)) return null;
  if (typeof input.actorUserId !== "string" || input.actorUserId.length === 0) {
    return null;
  }
  const record: AdminAction = {
    kind: input.kind,
    actorUserId: input.actorUserId,
    actorRole: input.actorRole as AppRole,
    targetType: input.targetType,
    targetId: input.targetId,
    metadata: input.metadata,
    createdAt: new Date().toISOString(),
  };
  return record;
}

/**
 * Fire-and-forget emit. Failures are swallowed: audit log MUST
 * NOT take down the user-facing action. Production wiring can
 * upgrade this to a queue / batch sink without touching the
 * call site.
 */
export function emitAdminAction(record: AdminAction): void {
  try {
    const result = activeSink(record);
    if (result && typeof (result as Promise<void>).catch === "function") {
      (result as Promise<void>).catch(() => {
        /* swallow */
      });
    }
  } catch {
    /* swallow */
  }
}

/**
 * Convenience helper: build + emit in one call. Returns the
 * record that was emitted, or `null` if the build refused it
 * (e.g. the caller forgot to authenticate as admin).
 */
export function recordAdminAction(
  input: Parameters<typeof buildAdminAction>[0],
): AdminAction | null {
  const record = buildAdminAction(input);
  if (record) {
    emitAdminAction(record);
  }
  return record;
}
