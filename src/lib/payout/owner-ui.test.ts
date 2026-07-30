import assert from "node:assert/strict";
import test from "node:test";

import type { DecimalVndString } from "@/types/payout";

import {
  formatPayoutDateTime,
  formatPayoutVnd,
  getPayoutEventLabel,
  getPayoutOwnerReasonLabel,
  getPayoutStatusPresentation,
} from "./owner-ui";

test("owner payout money formatting preserves exact decimal strings", () => {
  const amount = "90071992547409931234567890" as DecimalVndString;
  assert.equal(formatPayoutVnd(amount), "90.071.992.547.409.931.234.567.890 ₫");
});

test("owner payout presentation covers public statuses, events, and reasons", () => {
  assert.equal(getPayoutStatusPresentation("requested").label, "Đã gửi");
  assert.equal(getPayoutStatusPresentation("paid").variant, "success");
  assert.equal(getPayoutEventLabel("outcome_uncertain"), "Chuyển sang kiểm tra");
  assert.equal(
    getPayoutOwnerReasonLabel("payment_not_completed"),
    "Khoản thanh toán không hoàn tất.",
  );
  assert.equal(getPayoutOwnerReasonLabel(null), null);
});

test("owner payout dates render in the product timezone", () => {
  const formatted = formatPayoutDateTime("2026-01-02T03:04:05.000Z");
  assert.match(formatted, /2026/);
  assert.match(formatted, /10:04|10:04:00/);
});
