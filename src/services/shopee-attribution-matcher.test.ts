/**
 * Phase 20H.5 -- unit tests for the pure Shopee attribution matcher.
 *
 * Pure module tests only. No database, no clock, no env, no shared state.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  ATTRIBUTION_TRUSTED_INTENT_STATUSES,
  isValidNetworkSubIdFormat,
  matchShopeeCsvPurchaseIntentAttribution,
  type ShopeeCsvSourceRowForAttribution,
  type ShopeePurchaseIntentForAttribution,
} from "./shopee-attribution-matcher";

// Token anatomy: "vaflnk" (6 chars) + 24 lowercase hex digits = 30 chars.
const T_VALID_A = "vaflnk000000000000000000000001";
const T_VALID_B = "vaflnk000000000000000000000002";
const T_UPPER = "VAFLNK000000000000000000000001";
const T_BAD_PREFIX = "vxxlnk000000000000000000000001";
const T_SHORT_HEX = "vaflnk00000000000000000000001";
const T_LONG_HEX = "vaflnk0000000000000000000000001";
const T_GARBAGE = "vaflnk000000000000000000000!@#";
const T_UPPER_HEX = "vaflnkABCD000000000000000000000001";

const BASE_SOURCE_ROW: ShopeeCsvSourceRowForAttribution = {
  sourceSubId1: T_VALID_A,
};

const BASE_INTENT: ShopeePurchaseIntentForAttribution = {
  id: "00000000-0000-0000-0000-0000000000a1",
  networkSubId: T_VALID_A,
  publisherId: "00000000-0000-0000-0000-0000000000b1",
  trackingLinkId: "00000000-0000-0000-0000-0000000000c1",
  status: "redirect_prepared",
};

function intentWith(overrides: Partial<ShopeePurchaseIntentForAttribution>):
  ShopeePurchaseIntentForAttribution {
  return { ...BASE_INTENT, ...overrides };
}

function sourceRowWith(overrides: Partial<ShopeeCsvSourceRowForAttribution>):
  ShopeeCsvSourceRowForAttribution {
  return { ...BASE_SOURCE_ROW, ...overrides };
}

test("isValidNetworkSubIdFormat accepts canonical lowercase tokens", () => {
  assert.equal(isValidNetworkSubIdFormat(T_VALID_A), true);
  assert.equal(isValidNetworkSubIdFormat(T_VALID_B), true);
  assert.equal(
    isValidNetworkSubIdFormat("vaflnk0123456789abcdef01234567"),
    true,
  );
});

test("isValidNetworkSubIdFormat rejects uppercase prefix", () => {
  assert.equal(isValidNetworkSubIdFormat(T_UPPER), false);
});

test("isValidNetworkSubIdFormat rejects wrong prefix", () => {
  assert.equal(isValidNetworkSubIdFormat(T_BAD_PREFIX), false);
});

test("isValidNetworkSubIdFormat rejects tokens that are too short", () => {
  assert.equal(isValidNetworkSubIdFormat(T_SHORT_HEX), false);
  assert.equal(isValidNetworkSubIdFormat("vaflnk"), false);
});

test("isValidNetworkSubIdFormat rejects tokens that are too long", () => {
  assert.equal(isValidNetworkSubIdFormat(T_LONG_HEX), false);
});

test("isValidNetworkSubIdFormat rejects garbage characters", () => {
  assert.equal(isValidNetworkSubIdFormat(T_GARBAGE), false);
});

test("isValidNetworkSubIdFormat rejects uppercase hex digits", () => {
  assert.equal(isValidNetworkSubIdFormat(T_UPPER_HEX), false);
});

test("isValidNetworkSubIdFormat rejects empty and whitespace", () => {
  assert.equal(isValidNetworkSubIdFormat(""), false);
  assert.equal(isValidNetworkSubIdFormat("   "), false);
  assert.equal(isValidNetworkSubIdFormat("\t"), false);
});

test("ATTRIBUTION_TRUSTED_INTENT_STATUSES is exactly redirect_prepared", () => {
  assert.equal(ATTRIBUTION_TRUSTED_INTENT_STATUSES.length, 1);
  assert.equal(ATTRIBUTION_TRUSTED_INTENT_STATUSES[0], "redirect_prepared");
});

test("match returns matched for valid pair", () => {
  const result = matchShopeeCsvPurchaseIntentAttribution({
    sourceRow: BASE_SOURCE_ROW,
    purchaseIntent: BASE_INTENT,
  });
  assert.equal(result.kind, "matched");
});

test("match returns missing_attribution_field when sourceSubId1 is null", () => {
  const result = matchShopeeCsvPurchaseIntentAttribution({
    sourceRow: sourceRowWith({ sourceSubId1: null }),
    purchaseIntent: BASE_INTENT,
  });
  assert.equal(result.kind, "missing_attribution_field");
  if (result.kind === "missing_attribution_field") {
    assert.equal(result.subKind, "source_sub_id1_null");
  }
});

test("match returns missing_attribution_field when sourceSubId1 is blank", () => {
  const result = matchShopeeCsvPurchaseIntentAttribution({
    sourceRow: sourceRowWith({ sourceSubId1: "" }),
    purchaseIntent: BASE_INTENT,
  });
  assert.equal(result.kind, "missing_attribution_field");
  if (result.kind === "missing_attribution_field") {
    assert.equal(result.subKind, "source_sub_id1_blank");
  }
});

test("match returns missing_attribution_field for whitespace-only sourceSubId1", () => {
  const result = matchShopeeCsvPurchaseIntentAttribution({
    sourceRow: sourceRowWith({ sourceSubId1: "   " }),
    purchaseIntent: BASE_INTENT,
  });
  assert.equal(result.kind, "missing_attribution_field");
  if (result.kind === "missing_attribution_field") {
    assert.equal(result.subKind, "source_sub_id1_blank");
  }
});

test("match returns invalid_attribution_format for malformed tokens", () => {
  for (const malformed of [
    T_UPPER,
    T_BAD_PREFIX,
    T_SHORT_HEX,
    T_LONG_HEX,
    T_GARBAGE,
    T_UPPER_HEX,
  ]) {
    const result = matchShopeeCsvPurchaseIntentAttribution({
      sourceRow: sourceRowWith({ sourceSubId1: malformed }),
      purchaseIntent: BASE_INTENT,
    });
    assert.equal(
      result.kind,
      "invalid_attribution_format",
      `expected invalid_attribution_format for ${malformed}`,
    );
  }
});

test("match returns sub_id_mismatch when tokens differ", () => {
  const result = matchShopeeCsvPurchaseIntentAttribution({
    sourceRow: sourceRowWith({ sourceSubId1: T_VALID_A }),
    purchaseIntent: intentWith({ networkSubId: T_VALID_B }),
  });
  assert.equal(result.kind, "sub_id_mismatch");
});

test("match returns intent_not_redirect_prepared for non-redirect_prepared status", () => {
  for (const badStatus of ["pending", "expired", "consumed", "cancelled", "prepared"]) {
    const result = matchShopeeCsvPurchaseIntentAttribution({
      sourceRow: BASE_SOURCE_ROW,
      purchaseIntent: intentWith({ status: badStatus }),
    });
    assert.equal(
      result.kind,
      "intent_not_redirect_prepared",
      `expected intent_not_redirect_prepared for ${badStatus}`,
    );
    if (result.kind === "intent_not_redirect_prepared") {
      // Safe reason categories -- never the raw status value.
      assert.ok(
        result.reason.startsWith("intent_status_"),
        `expected safe reason category for ${badStatus}, got ${result.reason}`,
      );
    }
  }
});

test("match returns intent_not_redirect_prepared with unknown reason for unrecognised status", () => {
  const result = matchShopeeCsvPurchaseIntentAttribution({
    sourceRow: BASE_SOURCE_ROW,
    purchaseIntent: intentWith({ status: "future_status_we_dont_know_about" }),
  });
  assert.equal(result.kind, "intent_not_redirect_prepared");
  if (result.kind === "intent_not_redirect_prepared") {
    assert.equal(result.reason, "intent_status_unknown");
  }
});

test("match returns intent_missing_required_field when publisherId is blank", () => {
  const result = matchShopeeCsvPurchaseIntentAttribution({
    sourceRow: BASE_SOURCE_ROW,
    purchaseIntent: intentWith({ publisherId: "" }),
  });
  assert.equal(result.kind, "intent_missing_required_field");
  if (result.kind === "intent_missing_required_field") {
    assert.equal(result.subKind, "publisher_id_blank");
  }
});

test("match returns intent_missing_required_field when trackingLinkId is blank", () => {
  const result = matchShopeeCsvPurchaseIntentAttribution({
    sourceRow: BASE_SOURCE_ROW,
    purchaseIntent: intentWith({ trackingLinkId: "" }),
  });
  assert.equal(result.kind, "intent_missing_required_field");
  if (result.kind === "intent_missing_required_field") {
    assert.equal(result.subKind, "tracking_link_id_blank");
  }
});

test("match returns intent_missing_required_field for whitespace-only IDs", () => {
  const result = matchShopeeCsvPurchaseIntentAttribution({
    sourceRow: BASE_SOURCE_ROW,
    purchaseIntent: intentWith({ publisherId: "   " }),
  });
  assert.equal(result.kind, "intent_missing_required_field");
});

test("match trims sourceSubId1 before format check", () => {
  const result = matchShopeeCsvPurchaseIntentAttribution({
    sourceRow: sourceRowWith({ sourceSubId1: "  " + T_VALID_A + "  " }),
    purchaseIntent: BASE_INTENT,
  });
  assert.equal(result.kind, "matched");
});

test("match never throws for any documented failure", () => {
  const cases: Array<{
    label: string;
    sourceRow: ShopeeCsvSourceRowForAttribution;
    purchaseIntent: ShopeePurchaseIntentForAttribution;
  }> = [
    {
      label: "null sub id",
      sourceRow: sourceRowWith({ sourceSubId1: null }),
      purchaseIntent: BASE_INTENT,
    },
    {
      label: "blank sub id",
      sourceRow: sourceRowWith({ sourceSubId1: "" }),
      purchaseIntent: BASE_INTENT,
    },
    {
      label: "malformed sub id",
      sourceRow: sourceRowWith({ sourceSubId1: "not-a-token" }),
      purchaseIntent: BASE_INTENT,
    },
    {
      label: "mismatch sub id",
      sourceRow: sourceRowWith({ sourceSubId1: T_VALID_A }),
      purchaseIntent: intentWith({ networkSubId: T_VALID_B }),
    },
    {
      label: "expired intent",
      sourceRow: BASE_SOURCE_ROW,
      purchaseIntent: intentWith({ status: "expired" }),
    },
    {
      label: "blank publisher",
      sourceRow: BASE_SOURCE_ROW,
      purchaseIntent: intentWith({ publisherId: "" }),
    },
    {
      label: "blank tracking link",
      sourceRow: BASE_SOURCE_ROW,
      purchaseIntent: intentWith({ trackingLinkId: "" }),
    },
  ];
  for (const c of cases) {
    assert.doesNotThrow(
      () => matchShopeeCsvPurchaseIntentAttribution(c),
      `matcher must not throw for ${c.label}`,
    );
  }
});

test("matched outcome carries no internal identifiers", () => {
  const result = matchShopeeCsvPurchaseIntentAttribution({
    sourceRow: BASE_SOURCE_ROW,
    purchaseIntent: BASE_INTENT,
  });
  if (result.kind === "matched") {
    assert.deepEqual(result, { kind: "matched" });
    const keys = Object.keys(result);
    for (const k of keys) {
      assert.ok(
        k === "kind",
        `matched outcome must not carry internal-ID fields, found ${k}`,
      );
    }
  } else {
    assert.fail("expected matched outcome");
  }
});

test("every typed failure outcome carries only safe domain labels", () => {
  const failureOutcomes: Array<{
    label: string;
    result: ReturnType<typeof matchShopeeCsvPurchaseIntentAttribution>;
  }> = [
    {
      label: "missing null",
      result: matchShopeeCsvPurchaseIntentAttribution({
        sourceRow: sourceRowWith({ sourceSubId1: null }),
        purchaseIntent: BASE_INTENT,
      }),
    },
    {
      label: "missing blank",
      result: matchShopeeCsvPurchaseIntentAttribution({
        sourceRow: sourceRowWith({ sourceSubId1: "" }),
        purchaseIntent: BASE_INTENT,
      }),
    },
    {
      label: "invalid format",
      result: matchShopeeCsvPurchaseIntentAttribution({
        sourceRow: sourceRowWith({ sourceSubId1: T_GARBAGE }),
        purchaseIntent: BASE_INTENT,
      }),
    },
    {
      label: "sub id mismatch",
      result: matchShopeeCsvPurchaseIntentAttribution({
        sourceRow: sourceRowWith({ sourceSubId1: T_VALID_A }),
        purchaseIntent: intentWith({ networkSubId: T_VALID_B }),
      }),
    },
    {
      label: "intent not redirect prepared",
      result: matchShopeeCsvPurchaseIntentAttribution({
        sourceRow: BASE_SOURCE_ROW,
        purchaseIntent: intentWith({ status: "pending" }),
      }),
    },
    {
      label: "blank publisher",
      result: matchShopeeCsvPurchaseIntentAttribution({
        sourceRow: BASE_SOURCE_ROW,
        purchaseIntent: intentWith({ publisherId: "" }),
      }),
    },
    {
      label: "blank tracking link",
      result: matchShopeeCsvPurchaseIntentAttribution({
        sourceRow: BASE_SOURCE_ROW,
        purchaseIntent: intentWith({ trackingLinkId: "" }),
      }),
    },
  ];

  const forbiddenKeys = [
    "purchaseIntentId",
    "trackingLinkId",
    "publisherId",
    "networkSubId",
    "shortCode",
    "clickId",
    "trackingPath",
    "an_redir",
    "id",
  ];
  for (const { result } of failureOutcomes) {
    const keys = Object.keys(result);
    for (const forbidden of forbiddenKeys) {
      assert.ok(
        !keys.includes(forbidden),
        `outcome ${result.kind} must not carry ${forbidden}`,
      );
    }
  }
});

test("intent_not_redirect_prepared never returns the raw status string", () => {
  // Even when the status is a known value, the result must carry only
  // the safe reason category, not the raw string.
  for (const badStatus of ["pending", "expired", "consumed", "cancelled"]) {
    const result = matchShopeeCsvPurchaseIntentAttribution({
      sourceRow: BASE_SOURCE_ROW,
      purchaseIntent: intentWith({ status: badStatus }),
    });
    if (result.kind === "intent_not_redirect_prepared") {
      const serialised = JSON.stringify(result);
      assert.ok(
        !serialised.includes('"' + badStatus + '"'),
        `outcome must not carry raw status ${badStatus}, got ${serialised}`,
      );
    }
  }
});
