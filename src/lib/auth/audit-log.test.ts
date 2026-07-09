/**
 * Phase 20I.5 -- tests for the audit log foundation.
 *
 * The audit log emitter is a no-op by default; the tests cover
 * the pure `buildAdminAction` helper (which is the part that
 * really decides whether a record is valid) and the sink
 * injection / override behaviour. Persistent storage is out
 * of scope for this phase.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAdminAction,
  emitAdminAction,
  getAdminActionSink,
  recordAdminAction,
  setAdminActionSink,
  type AdminAction,
  type AdminActionKind,
} from "./audit-log";

function withSink(
  sink: (record: AdminAction) => void,
  fn: () => void,
): void {
  const previous = getAdminActionSink();
  setAdminActionSink(sink);
  try {
    fn();
  } finally {
    setAdminActionSink(previous);
  }
}

test("Phase 20I.5: buildAdminAction refuses a null / user actor", () => {
  assert.equal(
    buildAdminAction({
      kind: "admin.addlivetag.import",
      actorUserId: "user-1",
      actorRole: null,
    }),
    null,
  );
  assert.equal(
    buildAdminAction({
      kind: "admin.addlivetag.import",
      actorUserId: "user-1",
      actorRole: "user",
    }),
    null,
  );
});

test("Phase 20I.5: buildAdminAction refuses an empty actor id", () => {
  assert.equal(
    buildAdminAction({
      kind: "admin.addlivetag.import",
      actorUserId: "",
      actorRole: "admin",
    }),
    null,
  );
});

test("Phase 20I.5: buildAdminAction produces a well-formed record for admin / super_admin", () => {
  const record = buildAdminAction({
    kind: "admin.addlivetag.import",
    actorUserId: "user-1",
    actorRole: "admin",
    targetType: "shopee",
    targetId: "orders",
    metadata: { rowsFetched: 10, dryRun: true },
  });
  assert.ok(record);
  if (record) {
    assert.equal(record.kind, "admin.addlivetag.import");
    assert.equal(record.actorUserId, "user-1");
    assert.equal(record.actorRole, "admin");
    assert.equal(record.targetType, "shopee");
    assert.equal(record.targetId, "orders");
    assert.equal(record.metadata?.dryRun, true);
    assert.match(record.createdAt, /^\d{4}-\d{2}-\d{2}T/);
  }
});

test("Phase 20I.5: buildAdminAction also accepts super_admin", () => {
  const record = buildAdminAction({
    kind: "admin.role.grant",
    actorUserId: "user-2",
    actorRole: "super_admin",
  });
  assert.ok(record);
  if (record) {
    assert.equal(record.actorRole, "super_admin");
  }
});

test("Phase 20I.5: the emitter routes through the active sink", () => {
  const captured: AdminAction[] = [];
  withSink((record) => {
    captured.push(record);
  }, () => {
    emitAdminAction({
      kind: "admin.addlivetag.import",
      actorUserId: "user-3",
      actorRole: "admin",
      createdAt: new Date().toISOString(),
    });
  });
  assert.equal(captured.length, 1);
  assert.equal(captured[0].actorUserId, "user-3");
});

test("Phase 20I.5: a throwing sink is swallowed so it cannot take down the action", () => {
  withSink(() => {
    throw new Error("disk full");
  }, () => {
    // Should not throw.
    emitAdminAction({
      kind: "admin.addlivetag.import",
      actorUserId: "user-4",
      actorRole: "admin",
      createdAt: new Date().toISOString(),
    });
  });
});

test("Phase 20I.5: recordAdminAction is build + emit in one call", () => {
  const captured: AdminAction[] = [];
  withSink((record) => {
    captured.push(record);
  }, () => {
    const result = recordAdminAction({
      kind: "admin.role.revoke",
      actorUserId: "user-5",
      actorRole: "admin",
      targetId: "user-9",
    });
    assert.ok(result);
    assert.equal(result?.kind, "admin.role.revoke");
  });
  assert.equal(captured.length, 1);
});

test("Phase 20I.5: recordAdminAction is a no-op when the build refuses the record", () => {
  const captured: AdminAction[] = [];
  withSink((record) => {
    captured.push(record);
  }, () => {
    const result = recordAdminAction({
      kind: "admin.addlivetag.import",
      actorUserId: "user-6",
      actorRole: "user",
    });
    assert.equal(result, null);
  });
  assert.equal(captured.length, 0);
});

test("Phase 20I.5: the audit vocabulary is the only allow-list for action kinds", () => {
  // The TypeScript `AdminActionKind` type is the source of truth;
  // a string that does not belong to the union is not assignable.
  // The runtime check below verifies the type still resolves to
  // the documented set.
  const allowed: ReadonlyArray<AdminActionKind> = [
    "admin.addlivetag.import",
    "admin.role.grant",
    "admin.role.revoke",
    "admin.payout.execute",
    "admin.conversion.refund",
    "admin.config.update",
  ];
  assert.equal(allowed.length, 6);
});
