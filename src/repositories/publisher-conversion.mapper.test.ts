/**
 * Unit tests for the pure conversions database-row mapping.
 *
 * Run with:
 *
 *     npx tsx --test src/repositories/publisher-conversion.mapper.test.ts
 *
 * or through npm test once the file is added to that script.
 *
 * The mapper is intentionally split out of publisher-conversion.repository.ts
 * so it can be exercised without pulling in the server-only Supabase client.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { CONVERSION_STATUSES } from "@/types/affiliate";

import {
  InvalidConversionIdentifierError,
  InvalidConversionIngestionEventIdError,
  InvalidConversionMoneyError,
  InvalidConversionRejectedReasonError,
  InvalidConversionSettlementStatusError,
  InvalidConversionSourceKeyError,
  InvalidConversionStatusError,
  InvalidConversionTimestampError,
  InvalidConversionValidationStatusError,
  mapConversionRow,
  parseConversionMoneyAmount,
  parseConversionRejectedReason,
  parseConversionStatus,
  type ConversionDatabaseRow,
} from "./publisher-conversion.mapper";

const ANCHOR_ISO_UTC = "2026-05-12T08:30:00.000Z";
const ANCHOR_VN_DATE = "2026-05-12";

function buildBaseRow(
  overrides: Partial<ConversionDatabaseRow> = {},
): ConversionDatabaseRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    external_order_id: "shopee-order-001",
    publisher_id: "22222222-2222-4222-8222-222222222222",
    advertiser_id: "adv-1",
    campaign_id: "camp-1",
    offer_id: "offer-1",
    tracking_link_id: "tl-1",
    status: "pending",
    order_amount: 250_000,
    network_commission: 25_000,
    user_cashback: 15_000,
    platform_profit: 10_000,
    occurred_at: ANCHOR_ISO_UTC,
    approved_at: null,
    payable_at: null,
    paid_at: null,
    rejected_at: null,
    rejected_reason: null,
    source_conversion_key: null,
    validation_status: null,
    settlement_status: null,
    ingestion_event_id: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Canonical status coverage
// ---------------------------------------------------------------------------

test("CONVERSION_STATUSES contains exactly the five canonical statuses in order", () => {
  assert.deepEqual(
    [...CONVERSION_STATUSES],
    ["pending", "approved", "rejected", "payable", "paid"],
  );
});

test("parseConversionStatus accepts every canonical status", () => {
  for (const status of CONVERSION_STATUSES) {
    assert.equal(parseConversionStatus(status), status);
  }
});

test("parseConversionStatus rejects an unknown status string", () => {
  assert.throws(
    () => parseConversionStatus("recorded"),
    InvalidConversionStatusError,
  );
});

test("parseConversionStatus rejects non-string values", () => {
  assert.throws(
    () => parseConversionStatus(42),
    InvalidConversionStatusError,
  );
  assert.throws(
    () => parseConversionStatus(null),
    InvalidConversionStatusError,
  );
  assert.throws(
    () => parseConversionStatus(undefined),
    InvalidConversionStatusError,
  );
});

test("mapConversionRow maps every canonical status with structured fields intact", () => {
  for (const status of CONVERSION_STATUSES) {
    const mapped = mapConversionRow(buildBaseRow({ status }));
    assert.equal(mapped.status, status);
    assert.equal(mapped.id, "11111111-1111-4111-8111-111111111111");
    assert.equal(mapped.orderId, "shopee-order-001");
    assert.equal(
      mapped.publisherId,
      "22222222-2222-4222-8222-222222222222",
    );
    assert.equal(mapped.advertiserId, "adv-1");
    assert.equal(mapped.campaignId, "camp-1");
    assert.equal(mapped.offerId, "offer-1");
    assert.equal(mapped.trackingLinkId, "tl-1");
  }
});

// ---------------------------------------------------------------------------
// Money mapping
// ---------------------------------------------------------------------------

test("mapConversionRow maps the four money columns into Money with VND currency", () => {
  const mapped = mapConversionRow(buildBaseRow());
  assert.deepEqual(mapped.orderAmount, {
    amount: 250_000,
    currency: "VND",
  });
  assert.deepEqual(mapped.networkCommission, {
    amount: 25_000,
    currency: "VND",
  });
  assert.deepEqual(mapped.userCashback, {
    amount: 15_000,
    currency: "VND",
  });
  assert.deepEqual(mapped.platformProfit, {
    amount: 10_000,
    currency: "VND",
  });
});

test("mapConversionRow accepts zero money amounts", () => {
  const mapped = mapConversionRow(
    buildBaseRow({
      order_amount: 0,
      network_commission: 0,
      user_cashback: 0,
      platform_profit: 0,
    }),
  );
  assert.equal(mapped.orderAmount.amount, 0);
  assert.equal(mapped.networkCommission.amount, 0);
  assert.equal(mapped.userCashback.amount, 0);
  assert.equal(mapped.platformProfit.amount, 0);
});

test("mapConversionRow accepts stringified money values that parse as integers", () => {
  const mapped = mapConversionRow(
    buildBaseRow({
      order_amount: "123456",
      network_commission: "60000",
      user_cashback: "40000",
      platform_profit: "20000",
    }),
  );
  assert.equal(mapped.orderAmount.amount, 123_456);
  assert.equal(mapped.networkCommission.amount, 60_000);
  assert.equal(mapped.userCashback.amount, 40_000);
  assert.equal(mapped.platformProfit.amount, 20_000);
});

test("parseConversionMoneyAmount rejects negative numbers", () => {
  assert.throws(
    () => parseConversionMoneyAmount(-1, "order_amount"),
    InvalidConversionMoneyError,
  );
  assert.throws(
    () => parseConversionMoneyAmount("-1", "order_amount"),
    InvalidConversionMoneyError,
  );
});

test("parseConversionMoneyAmount rejects empty and whitespace-only strings", () => {
  // Regression: Number("") and Number("   ") both produce 0, which used to
  // let invalid database values silently land in the domain as a 0 VND
  // amount. The boundary must surface them as typed errors instead.
  assert.throws(
    () => parseConversionMoneyAmount("", "order_amount"),
    InvalidConversionMoneyError,
  );
  assert.throws(
    () => parseConversionMoneyAmount("   ", "order_amount"),
    InvalidConversionMoneyError,
  );
  assert.throws(
    () => parseConversionMoneyAmount("\t\n", "order_amount"),
    InvalidConversionMoneyError,
  );
});

test("parseConversionMoneyAmount rejects strings outside the safe-integer range", () => {
  // Anything above Number.MAX_SAFE_INTEGER must not silently round through
  // Number(); the parser must raise InvalidConversionMoneyError.
  const tooLarge = String(Number.MAX_SAFE_INTEGER + 1);
  assert.throws(
    () => parseConversionMoneyAmount(tooLarge, "order_amount"),
    InvalidConversionMoneyError,
  );
  assert.throws(
    () =>
      parseConversionMoneyAmount(
        Number.MAX_SAFE_INTEGER + 1,
        "order_amount",
      ),
    InvalidConversionMoneyError,
  );
});

test("parseConversionMoneyAmount rejects stringified values that are not decimal integers", () => {
  // Hex, exponential, padded, signed, and fractional stringified forms
  // must all be rejected so the database boundary stays strict.
  assert.throws(
    () => parseConversionMoneyAmount("0x10", "order_amount"),
    InvalidConversionMoneyError,
  );
  assert.throws(
    () => parseConversionMoneyAmount("1e3", "order_amount"),
    InvalidConversionMoneyError,
  );
  assert.throws(
    () => parseConversionMoneyAmount("1.5", "order_amount"),
    InvalidConversionMoneyError,
  );
  assert.throws(
    () => parseConversionMoneyAmount(" 123", "order_amount"),
    InvalidConversionMoneyError,
  );
  assert.throws(
    () => parseConversionMoneyAmount("+1", "order_amount"),
    InvalidConversionMoneyError,
  );
});

test("parseConversionMoneyAmount rejects non-string non-number values", () => {
  assert.throws(
    () =>
      parseConversionMoneyAmount(
        true as unknown as number,
        "order_amount",
      ),
    InvalidConversionMoneyError,
  );
  assert.throws(
    () =>
      parseConversionMoneyAmount(
        {} as unknown as number,
        "order_amount",
      ),
    InvalidConversionMoneyError,
  );
  assert.throws(
    () =>
      parseConversionMoneyAmount(
        null as unknown as number,
        "order_amount",
      ),
    InvalidConversionMoneyError,
  );
  assert.throws(
    () =>
      parseConversionMoneyAmount(
        undefined as unknown as number,
        "order_amount",
      ),
    InvalidConversionMoneyError,
  );
});

test("parseConversionMoneyAmount rejects non-integer numbers", () => {
  assert.throws(
    () => parseConversionMoneyAmount(1.5, "order_amount"),
    InvalidConversionMoneyError,
  );
  assert.throws(
    () => parseConversionMoneyAmount(Number.NaN, "order_amount"),
    InvalidConversionMoneyError,
  );
  // Number.POSITIVE_INFINITY is rejected by Number.isSafeInteger; the
  // explicit Number.isFinite / Number.isInteger guards document that
  // non-finite amounts can never reach the domain.
  assert.throws(
    () =>
      parseConversionMoneyAmount(
        Number.POSITIVE_INFINITY,
        "order_amount",
      ),
    InvalidConversionMoneyError,
  );
});

test("mapConversionRow rejects a money column that violates the non-negative safe-integer contract", () => {
  assert.throws(
    () => mapConversionRow(buildBaseRow({ order_amount: -100 })),
    InvalidConversionMoneyError,
  );
  assert.throws(
    () =>
      mapConversionRow(
        buildBaseRow({ network_commission: "not-a-number" }),
      ),
    InvalidConversionMoneyError,
  );
  assert.throws(
    () => mapConversionRow(buildBaseRow({ user_cashback: 1.25 })),
    InvalidConversionMoneyError,
  );
  assert.throws(
    () =>
      mapConversionRow(
        buildBaseRow({ platform_profit: Number.NaN }),
      ),
    InvalidConversionMoneyError,
  );
});

// ---------------------------------------------------------------------------
// Required timestamp (occurred_at) mapping
// ---------------------------------------------------------------------------

test("mapConversionRow converts occurred_at to the Asia/Ho_Chi_Minh YYYY-MM-DD date", () => {
  const mapped = mapConversionRow(buildBaseRow());
  assert.equal(mapped.occurredAt, ANCHOR_VN_DATE);
});

test("mapConversionRow rejects occurred_at when it is null", () => {
  assert.throws(
    () =>
      mapConversionRow(
        buildBaseRow({ occurred_at: null as unknown as string }),
      ),
    InvalidConversionTimestampError,
  );
});

test("mapConversionRow rejects occurred_at when it is undefined", () => {
  assert.throws(
    () =>
      mapConversionRow(
        buildBaseRow({ occurred_at: undefined as unknown as string }),
      ),
    InvalidConversionTimestampError,
  );
});

test("mapConversionRow rejects occurred_at when it is empty", () => {
  assert.throws(
    () => mapConversionRow(buildBaseRow({ occurred_at: "" })),
    InvalidConversionTimestampError,
  );
});

test("mapConversionRow rejects occurred_at when it is whitespace only", () => {
  assert.throws(
    () => mapConversionRow(buildBaseRow({ occurred_at: "   " })),
    InvalidConversionTimestampError,
  );
});

test("mapConversionRow rejects occurred_at when it is non-string", () => {
  assert.throws(
    () => mapConversionRow(buildBaseRow({ occurred_at: 123 as unknown })),
    InvalidConversionTimestampError,
  );
  assert.throws(
    () =>
      mapConversionRow(
        buildBaseRow({ occurred_at: {} as unknown }),
      ),
    InvalidConversionTimestampError,
  );
  assert.throws(
    () =>
      mapConversionRow(
        buildBaseRow({ occurred_at: true as unknown }),
      ),
    InvalidConversionTimestampError,
  );
});

test("mapConversionRow rejects occurred_at when it does not parse", () => {
  assert.throws(
    () => mapConversionRow(buildBaseRow({ occurred_at: "not-a-date" })),
    InvalidConversionTimestampError,
  );
});

// ---------------------------------------------------------------------------
// Optional timestamp mapping
// ---------------------------------------------------------------------------

test("mapConversionRow leaves optional timestamps undefined when null", () => {
  const mapped = mapConversionRow(buildBaseRow({ status: "pending" }));
  assert.equal(mapped.approvedAt, undefined);
  assert.equal(mapped.payableAt, undefined);
  assert.equal(mapped.paidAt, undefined);
  assert.equal(mapped.rejectedAt, undefined);
  assert.equal(mapped.rejectedReason, undefined);
});

test("mapConversionRow formats approved, payable, and paid timestamps", () => {
  const mapped = mapConversionRow(
    buildBaseRow({
      status: "paid",
      approved_at: "2026-05-12T10:00:00.000Z",
      payable_at: "2026-05-13T10:00:00.000Z",
      paid_at: "2026-05-14T10:00:00.000Z",
    }),
  );
  assert.equal(mapped.approvedAt, "2026-05-12");
  assert.equal(mapped.payableAt, "2026-05-13");
  assert.equal(mapped.paidAt, "2026-05-14");
});

test("mapConversionRow rejects optional timestamps when they are empty strings", () => {
  assert.throws(
    () =>
      mapConversionRow(
        buildBaseRow({ status: "approved", approved_at: "" }),
      ),
    InvalidConversionTimestampError,
  );
  assert.throws(
    () =>
      mapConversionRow(
        buildBaseRow({ status: "payable", payable_at: "   " }),
      ),
    InvalidConversionTimestampError,
  );
  assert.throws(
    () =>
      mapConversionRow(
        buildBaseRow({ status: "paid", paid_at: "" }),
      ),
    InvalidConversionTimestampError,
  );
  assert.throws(
    () =>
      mapConversionRow(
        buildBaseRow({ status: "rejected", rejected_at: "   " }),
      ),
    InvalidConversionTimestampError,
  );
});

test("mapConversionRow rejects optional timestamps when they are non-string", () => {
  assert.throws(
    () =>
      mapConversionRow(
        buildBaseRow({
          status: "approved",
          approved_at: 123 as unknown,
        }),
      ),
    InvalidConversionTimestampError,
  );
  assert.throws(
    () =>
      mapConversionRow(
        buildBaseRow({
          status: "payable",
          payable_at: true as unknown,
        }),
      ),
    InvalidConversionTimestampError,
  );
  assert.throws(
    () =>
      mapConversionRow(
        buildBaseRow({
          status: "paid",
          paid_at: {} as unknown,
        }),
      ),
    InvalidConversionTimestampError,
  );
  assert.throws(
    () =>
      mapConversionRow(
        buildBaseRow({
          status: "rejected",
          rejected_at: 0 as unknown,
        }),
      ),
    InvalidConversionTimestampError,
  );
});

test("mapConversionRow rejects optional timestamps when they do not parse", () => {
  assert.throws(
    () =>
      mapConversionRow(
        buildBaseRow({
          status: "approved",
          approved_at: "not-a-date",
        }),
      ),
    InvalidConversionTimestampError,
  );
});

// ---------------------------------------------------------------------------
// Rejected conversion handling
// ---------------------------------------------------------------------------

test("mapConversionRow maps rejected conversions with rejectedAt and reason intact", () => {
  const mapped = mapConversionRow(
    buildBaseRow({
      status: "rejected",
      rejected_at: "2026-05-12T11:00:00.000Z",
      rejected_reason: "Returned before shipping window closed",
    }),
  );
  assert.equal(mapped.status, "rejected");
  assert.equal(mapped.rejectedAt, "2026-05-12");
  assert.equal(
    mapped.rejectedReason,
    "Returned before shipping window closed",
  );
});

test("mapConversionRow drops a null rejected_reason to undefined", () => {
  const mapped = mapConversionRow(
    buildBaseRow({ status: "rejected" }),
  );
  assert.equal(mapped.rejectedReason, undefined);
});

test("parseConversionRejectedReason maps null to undefined", () => {
  assert.equal(parseConversionRejectedReason(null), undefined);
});

test("parseConversionRejectedReason preserves a non-empty string", () => {
  assert.equal(
    parseConversionRejectedReason("Returned before shipping window closed"),
    "Returned before shipping window closed",
  );
});

test("parseConversionRejectedReason preserves an empty string as empty string", () => {
  // An empty string is still a string-shaped database value; the parser
  // must keep it rather than coerce it to undefined. The mapped domain
  // field stays string-typed so callers can distinguish "no reason" from
  // "empty reason" when the database stored the empty string explicitly.
  assert.equal(parseConversionRejectedReason(""), "");
});

test("parseConversionRejectedReason throws on undefined", () => {
  assert.throws(
    () => parseConversionRejectedReason(undefined),
    InvalidConversionRejectedReasonError,
  );
});

test("parseConversionRejectedReason throws on non-string non-null values", () => {
  assert.throws(
    () => parseConversionRejectedReason(42),
    InvalidConversionRejectedReasonError,
  );
  assert.throws(
    () => parseConversionRejectedReason(true),
    InvalidConversionRejectedReasonError,
  );
  assert.throws(
    () => parseConversionRejectedReason({ reason: "x" }),
    InvalidConversionRejectedReasonError,
  );
  assert.throws(
    () => parseConversionRejectedReason(["x"]),
    InvalidConversionRejectedReasonError,
  );
});

test("mapConversionRow propagates a non-string non-null rejected_reason as a typed error", () => {
  // Regression: the previous implementation silently coerced non-string
  // rejected_reason values to undefined. The mapper must surface the
  // database-side type drift through InvalidConversionRejectedReasonError.
  assert.throws(
    () =>
      mapConversionRow(
        buildBaseRow({
          status: "rejected",
          rejected_reason: 42 as unknown,
        }),
      ),
    InvalidConversionRejectedReasonError,
  );
  assert.throws(
    () =>
      mapConversionRow(
        buildBaseRow({
          status: "rejected",
          rejected_reason: { reason: "x" } as unknown,
        }),
      ),
    InvalidConversionRejectedReasonError,
  );
  assert.throws(
    () =>
      mapConversionRow(
        buildBaseRow({
          status: "rejected",
          rejected_reason: true as unknown,
        }),
      ),
    InvalidConversionRejectedReasonError,
  );
});

// ---------------------------------------------------------------------------
// Identifier validation
// ---------------------------------------------------------------------------

test("mapConversionRow rejects an empty identifier", () => {
  const fields = [
    "id",
    "external_order_id",
    "publisher_id",
    "advertiser_id",
    "campaign_id",
    "offer_id",
    "tracking_link_id",
  ] as const;
  for (const fieldName of fields) {
    assert.throws(
      () => mapConversionRow(buildBaseRow({ [fieldName]: "" })),
      InvalidConversionIdentifierError,
    );
    assert.throws(
      () => mapConversionRow(buildBaseRow({ [fieldName]: "   " })),
      InvalidConversionIdentifierError,
    );
  }
});

test("mapConversionRow rejects a null identifier", () => {
  for (const fieldName of [
    "id",
    "external_order_id",
    "publisher_id",
    "advertiser_id",
    "campaign_id",
    "offer_id",
    "tracking_link_id",
  ] as const) {
    assert.throws(
      () =>
        mapConversionRow(
          buildBaseRow({
            [fieldName]: null as unknown as string,
          }),
        ),
      InvalidConversionIdentifierError,
    );
  }
});

test("mapConversionRow rejects a non-string identifier", () => {
  assert.throws(
    () => mapConversionRow(buildBaseRow({ id: 42 as unknown })),
    InvalidConversionIdentifierError,
  );
  assert.throws(
    () => mapConversionRow(buildBaseRow({ campaign_id: {} as unknown })),
    InvalidConversionIdentifierError,
  );
});

test("InvalidConversionTimestampError does not treat null occurred_at as an identifier", () => {
  // Regression: occurred_at must not be classified as an identifier.
  // If it were, this row would raise InvalidConversionIdentifierError.
  try {
    mapConversionRow(
      buildBaseRow({ occurred_at: null as unknown as string }),
    );
    assert.fail("should have thrown");
  } catch (err) {
    assert.ok(!(err instanceof InvalidConversionIdentifierError));
    assert.ok(err instanceof InvalidConversionTimestampError);
  }
});

// ---------------------------------------------------------------------------
// Phase 20G.2a additive foundation: optional split-status + ingestion mapping
// ---------------------------------------------------------------------------

test("mapConversionRow returns a base Conversion when all new optional columns are null (legacy shape)", () => {
  const mapped = mapConversionRow(buildBaseRow());
  assert.equal(mapped.status, "pending");
  assert.equal(mapped.sourceConversionKey, undefined);
  assert.equal(mapped.validationStatus, undefined);
  assert.equal(mapped.settlementStatus, undefined);
  assert.equal(mapped.ingestionEventId, undefined);
});

test("mapConversionRow maps the additive source_conversion_key when present", () => {
  const mapped = mapConversionRow(
    buildBaseRow({
      source_conversion_key:
        "1111111111111111111111111111111111111111111111111111111111111111",
    }),
  );
  assert.equal(
    mapped.sourceConversionKey,
    "1111111111111111111111111111111111111111111111111111111111111111",
  );
});

test("mapConversionRow maps the additive validation_status when present", () => {
  const mapped = mapConversionRow(
    buildBaseRow({ validation_status: "recorded" }),
  );
  assert.equal(mapped.validationStatus, "recorded");
});

test("mapConversionRow maps the additive settlement_status when present", () => {
  const mapped = mapConversionRow(
    buildBaseRow({ settlement_status: "not_payable" }),
  );
  assert.equal(mapped.settlementStatus, "not_payable");
});

test("mapConversionRow maps the additive ingestion_event_id when present", () => {
  const mapped = mapConversionRow(
    buildBaseRow({
      ingestion_event_id:
        "11111111-1111-4111-8111-111111111111",
    }),
  );
  assert.equal(
    mapped.ingestionEventId,
    "11111111-1111-4111-8111-111111111111",
  );
});

test("mapConversionRow trims surrounding whitespace on source_conversion_key", () => {
  const mapped = mapConversionRow(
    buildBaseRow({
      source_conversion_key:
        "  1111111111111111111111111111111111111111111111111111111111111111  ",
    }),
  );
  assert.equal(
    mapped.sourceConversionKey,
    "1111111111111111111111111111111111111111111111111111111111111111",
  );
});

test("mapConversionRow rejects an empty source_conversion_key", () => {
  assert.throws(
    () =>
      mapConversionRow(
        buildBaseRow({ source_conversion_key: "" }),
      ),
    InvalidConversionSourceKeyError,
  );
  assert.throws(
    () =>
      mapConversionRow(
        buildBaseRow({ source_conversion_key: "   " }),
      ),
    InvalidConversionSourceKeyError,
  );
});

test("mapConversionRow rejects a non-string source_conversion_key", () => {
  assert.throws(
    () =>
      mapConversionRow(
        buildBaseRow({
          source_conversion_key: 42 as unknown,
        }),
      ),
    InvalidConversionSourceKeyError,
  );
});

test("mapConversionRow rejects a malformed non-empty source_conversion_key", () => {
  // Each entry is non-empty, trimmed, but not a 64-char lowercase hex digest.
  const malformed = [
    "abc",
    "NOT_HEX",
    "111",
    "111111111111111111111111111111111111111111111111111111111111111G",
    "111111111111111111111111111111111111111111111111111111111111111", // 63 chars
    "11111111111111111111111111111111111111111111111111111111111111111", // 65 chars
    "11111111111111111111111111111111111111111111111111111111111111FF",
  ];
  for (const value of malformed) {
    assert.throws(
      () =>
        mapConversionRow(
          buildBaseRow({ source_conversion_key: value }),
        ),
      InvalidConversionSourceKeyError,
    );
  }
});

test("mapConversionRow rejects an unknown validation_status", () => {
  assert.throws(
    () =>
      mapConversionRow(
        buildBaseRow({ validation_status: "bogus" }),
      ),
    InvalidConversionValidationStatusError,
  );
});

test("mapConversionRow rejects a non-string validation_status", () => {
  assert.throws(
    () =>
      mapConversionRow(
        buildBaseRow({ validation_status: 1 as unknown }),
      ),
    InvalidConversionValidationStatusError,
  );
});

test("mapConversionRow rejects an unknown settlement_status", () => {
  assert.throws(
    () =>
      mapConversionRow(
        buildBaseRow({ settlement_status: "bogus" }),
      ),
    InvalidConversionSettlementStatusError,
  );
});

test("mapConversionRow rejects a non-string settlement_status", () => {
  assert.throws(
    () =>
      mapConversionRow(
        buildBaseRow({ settlement_status: 1 as unknown }),
      ),
    InvalidConversionSettlementStatusError,
  );
});

test("mapConversionRow accepts every canonical validation_status", () => {
  for (const validationStatus of [
    "recorded",
    "reconciling",
    "approved",
    "rejected",
    "reversed",
  ] as const) {
    const mapped = mapConversionRow(
      buildBaseRow({ validation_status: validationStatus }),
    );
    assert.equal(mapped.validationStatus, validationStatus);
  }
});

test("mapConversionRow accepts every canonical settlement_status", () => {
  for (const settlementStatus of [
    "not_payable",
    "payable",
    "paid",
  ] as const) {
    const mapped = mapConversionRow(
      buildBaseRow({ settlement_status: settlementStatus }),
    );
    assert.equal(mapped.settlementStatus, settlementStatus);
  }
});

test("mapConversionRow rejects an empty ingestion_event_id", () => {
  assert.throws(
    () =>
      mapConversionRow(
        buildBaseRow({ ingestion_event_id: "" }),
      ),
    InvalidConversionIngestionEventIdError,
  );
  assert.throws(
    () =>
      mapConversionRow(
        buildBaseRow({ ingestion_event_id: "   " }),
      ),
    InvalidConversionIngestionEventIdError,
  );
});

test("mapConversionRow rejects a non-string ingestion_event_id", () => {
  assert.throws(
    () =>
      mapConversionRow(
        buildBaseRow({
          ingestion_event_id: 42 as unknown,
        }),
      ),
    InvalidConversionIngestionEventIdError,
  );
});

test("mapConversionRow rejects a malformed non-empty ingestion_event_id", () => {
  const malformed = [
    "not-a-uuid",
    "11111111-1111-1111-1111-11111111111Z",
    "11111111111111111111111111111111",
    "11111111-1111-1111-1111",
    "G1111111-1111-1111-1111-111111111111",
    "11111111-1111-1111-1111-1111111111111",
  ];
  for (const value of malformed) {
    assert.throws(
      () =>
        mapConversionRow(
          buildBaseRow({ ingestion_event_id: value }),
        ),
      InvalidConversionIngestionEventIdError,
    );
  }
});

test("mapConversionRow trims surrounding whitespace on ingestion_event_id", () => {
  const mapped = mapConversionRow(
    buildBaseRow({
      ingestion_event_id:
        "  11111111-1111-4111-8111-111111111111  ",
    }),
  );
  assert.equal(
    mapped.ingestionEventId,
    "11111111-1111-4111-8111-111111111111",
  );
});
