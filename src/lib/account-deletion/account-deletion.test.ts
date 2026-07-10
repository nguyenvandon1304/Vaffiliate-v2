/**
 * Phase 20I.6 -- tests for the account-deletion request
 * abstraction.
 *
 * Pure tests. No React, no Supabase, no I/O. Covers:
 *
 *   - `validateDeletionRequestForm`: confirmation phrase, reason
 *     length, edge cases (non-string, empty, too long).
 *   - `recordDeletionRequestFoundation` + `listDeletionRequestsFoundation`:
 *     round-trip, ordering, status.
 *   - The queue reset helper clears between tests so the tests
 *     stay independent.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  __resetFoundationQueueForTests,
  buildDeletionSuccessMessage,
  DELETION_CONFIRMATION_PHRASE,
  DELETION_FORM_FIELD_CONFIRM,
  DELETION_FORM_FIELD_REASON,
  DELETION_REASON_MAX_LENGTH,
  listDeletionRequestsFoundation,
  recordDeletionRequestFoundation,
  validateDeletionRequestForm,
} from "./account-deletion";

test.beforeEach(() => {
  __resetFoundationQueueForTests();
});

test("Phase 20I.6: validateDeletionRequestForm accepts the right confirmation phrase", () => {
  const result = validateDeletionRequestForm({
    confirm: DELETION_CONFIRMATION_PHRASE,
    reason: "no longer using the account",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.reason, "no longer using the account");
  }
});

test("Phase 20I.6: validateDeletionRequestForm accepts confirmation in any case", () => {
  const result = validateDeletionRequestForm({
    confirm: "  xoa tai khoan  ",
    reason: "",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.reason, null);
  }
});

test("Phase 20I.6: validateDeletionRequestForm rejects wrong confirmation", () => {
  const result = validateDeletionRequestForm({
    confirm: "DELETE",
    reason: "",
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /cụm từ bảo mật/i);
  }
});

test("Phase 20I.6: validateDeletionRequestForm rejects non-string confirmation", () => {
  const result = validateDeletionRequestForm({
    confirm: 1234,
    reason: "",
  });
  assert.equal(result.ok, false);
});

test("Phase 20I.6: validateDeletionRequestForm rejects reasons above the cap", () => {
  const result = validateDeletionRequestForm({
    confirm: DELETION_CONFIRMATION_PHRASE,
    reason: "a".repeat(DELETION_REASON_MAX_LENGTH + 1),
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, new RegExp(String(DELETION_REASON_MAX_LENGTH)));
  }
});

test("Phase 20I.6: validateDeletionRequestForm rejects non-string reason (non-empty)", () => {
  const result = validateDeletionRequestForm({
    confirm: DELETION_CONFIRMATION_PHRASE,
    reason: { not: "a string" },
  });
  assert.equal(result.ok, false);
});

test("Phase 20I.6: foundation queue starts empty", () => {
  assert.equal(listDeletionRequestsFoundation().length, 0);
});

test("Phase 20I.6: recordDeletionRequestFoundation appends in order", () => {
  const first = recordDeletionRequestFoundation({
    userId: "u1",
    email: "u1@example.com",
    reason: null,
  });
  const second = recordDeletionRequestFoundation({
    userId: "u2",
    email: "u2@example.com",
    reason: "duplicate",
  });
  assert.equal(first.status, "pending");
  assert.equal(second.status, "pending");
  const list = listDeletionRequestsFoundation();
  // Newest-first ordering so the admin page sees fresh on top.
  assert.equal(list.length, 2);
  assert.equal(list[0]?.id, second.id);
  assert.equal(list[1]?.id, first.id);
});

test("Phase 20I.6: recordDeletionRequestFoundation keeps the userId / email from the caller", () => {
  // SECURITY: the function never accepts userId from form data;
  // the action derives it from requireUser() and passes it here.
  // The test guards the contract that the recorded entry reflects
  // the supplied session user, not anything else.
  const request = recordDeletionRequestFoundation({
    userId: "session-user-id",
    email: "session@example.com",
    reason: "test",
  });
  assert.equal(request.userId, "session-user-id");
  assert.equal(request.email, "session@example.com");
  assert.equal(request.reason, "test");
  assert.equal(request.status, "pending");
  assert.ok(request.id.startsWith("fnd-"));
  assert.ok(request.requestedAt instanceof Date);
  assert.equal(request.processedAt, null);
  assert.equal(request.processedBy, null);
  assert.equal(request.adminNote, null);
});

test("Phase 20I.6: buildDeletionSuccessMessage is honest about the foundation state", () => {
  const message = buildDeletionSuccessMessage();
  // Foundation-safe wording: "tiếp nhận trong luồng nền" (received
  // into the foundation flow), not "ghi nhận để xử lý" (recorded for ops).
  assert.match(message, /tiếp nhận trong luồng nền/i);
  // Mentions that persistent storage is connected later.
  assert.match(message, /lưu trữ bền vững/i);
  // Mentions retention so the user is not misled.
  assert.match(message, /lưu giữ/i);
  // Forbidden: "xóa ngay toàn bộ dữ liệu".
  assert.doesNotMatch(message.toLowerCase(), /xóa ngay toàn bộ dữ liệu/);
  // Forbidden: "ghi nhận để xử lý" implies durable production storage.
  assert.doesNotMatch(message.toLowerCase(), /ghi nhận để xử lý/i);
  // Forbidden: "đội ngũ vận hành sẽ xử lý" implies ops pipeline that does not exist.
  assert.doesNotMatch(message.toLowerCase(), /đội ngũ vận hành sẽ xử lý/i);
});

test("Phase 20I.6: form field names are stable constants", () => {
  // Regression guard: the form action reads these exact names.
  // Changing the literal would silently break the action.
  assert.equal(DELETION_FORM_FIELD_CONFIRM, "confirm");
  assert.equal(DELETION_FORM_FIELD_REASON, "reason");
});
