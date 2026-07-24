/**
 * Phase 20K -- reconciliation actor tests.
 *
 * Locks the contract that the actor on a reconciliation audit row
 * is ALWAYS derived from `requireAdmin()` server-side and is
 * NEVER taken from FormData or any other client-supplied input.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildReconciliationAdminActor,
  buildReconciliationSystemActor,
  ReconciliationActorError,
  SYSTEM_ACTOR_USER_ID,
} from "./actor";

const ADMIN_UUID = "11111111-1111-4111-8111-111111111111";

test("Phase 20K actor: buildReconciliationAdminActor accepts admin role", () => {
  const actor = buildReconciliationAdminActor({
    actorUserId: ADMIN_UUID,
    actorRole: "admin",
  });
  assert.equal(actor.actorKind, "admin");
  assert.equal(actor.actorUserId, ADMIN_UUID);
  assert.equal(actor.actorRole, "admin");
});

test("Phase 20K actor: buildReconciliationAdminActor accepts super_admin role", () => {
  const actor = buildReconciliationAdminActor({
    actorUserId: ADMIN_UUID,
    actorRole: "super_admin",
  });
  assert.equal(actor.actorKind, "admin");
  assert.equal(actor.actorUserId, ADMIN_UUID);
  assert.equal(actor.actorRole, "super_admin");
});

test("Phase 20K actor: buildReconciliationAdminActor refuses empty user id", () => {
  assert.throws(
    () =>
      buildReconciliationAdminActor({
        actorUserId: "",
        actorRole: "admin",
      }),
    (err: unknown) =>
      err instanceof ReconciliationActorError &&
      err.reason === "missing_admin_user_id",
  );
});

test("Phase 20K actor: buildReconciliationAdminActor refuses non-UUID user id", () => {
  assert.throws(
    () =>
      buildReconciliationAdminActor({
        actorUserId: "not-a-uuid",
        actorRole: "admin",
      }),
    (err: unknown) =>
      err instanceof ReconciliationActorError &&
      err.reason === "invalid_user_id_shape",
  );
});

test("Phase 20K actor: buildReconciliationAdminActor refuses non-admin role", () => {
  // The actor module's type union is `admin | super_admin`. We
  // bypass it with a deliberate cast to exercise the runtime
  // refusal of any other role string.
  assert.throws(
    () =>
      buildReconciliationAdminActor({
        actorUserId: ADMIN_UUID,
        actorRole: "user" as unknown as "admin",
      }),
    (err: unknown) =>
      err instanceof ReconciliationActorError &&
      err.reason === "non_admin_role",
  );
});

test("Phase 20K actor: buildReconciliationSystemActor returns closed 'system' sentinel", () => {
  const actor = buildReconciliationSystemActor();
  assert.equal(actor.actorKind, "system");
  assert.equal(actor.actorUserId, null);
  assert.equal(actor.actorRole, null);
});

test("Phase 20K actor: SYSTEM_ACTOR_USER_ID sentinel is the all-zero UUID", () => {
  // The constant exists so future settlement / payout pipelines
  // can compare against a single named value. The DB schema
  // actually stores NULL for system actors; this constant is a
  // marker for log / debug surfaces only.
  assert.equal(SYSTEM_ACTOR_USER_ID, "00000000-0000-4000-8000-000000000000");
});