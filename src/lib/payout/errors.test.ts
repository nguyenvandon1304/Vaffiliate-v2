import assert from "node:assert/strict";
import test from "node:test";

import { mapPayoutError, PayoutApplicationError } from "./errors";

test("stable payout errors are extracted without leaking SQL details", () => {
  const mapped = mapPayoutError({
    code: "P0001",
    message:
      "duplicate detail from SQL: PAYOUT_IDEMPOTENCY_KEY_CONFLICT relation=x",
  });
  assert.equal(mapped.code, "PAYOUT_IDEMPOTENCY_KEY_CONFLICT");
  assert.equal(mapped.message, "PAYOUT_IDEMPOTENCY_KEY_CONFLICT");
  assert.equal(mapped.message.includes("relation=x"), false);
});

test("unknown PostgreSQL failures collapse to a stable safe error", () => {
  const mapped = mapPayoutError({
    message: "password secret relation internal_table",
    details: "raw SQL details",
  });
  assert.equal(mapped.code, "PAYOUT_UNEXPECTED_ERROR");
  assert.equal(mapped.message, "PAYOUT_UNEXPECTED_ERROR");
});

test("application payout errors pass through unchanged", () => {
  const original = new PayoutApplicationError("PAYOUT_RESPONSE_INVALID");
  assert.equal(mapPayoutError(original), original);
});
