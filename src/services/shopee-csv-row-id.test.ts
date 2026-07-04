/**
 * Unit tests for the deterministic source_conversion_key derivation.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  deriveShopeeSourceConversionKey,
  InvalidShopeeSourceLineError,
  SHOPEE_NETWORK_LABEL,
  type ShopeeCsvSourceLine,
} from "./shopee-csv-row-id";

function buildBaseLine(
  overrides: Partial<ShopeeCsvSourceLine> = {},
): ShopeeCsvSourceLine {
  return {
    network: SHOPEE_NETWORK_LABEL,
    sourceEventId:
      "1111111111111111111111111111111111111111111111111111111111111111",
    externalOrderId: "250110ABCDXYZ",
    checkoutId: "250110ABCDXYZ_c1",
    itemId: "shopee-item-001",
    modelId: "shopee-model-001",
    quantity: 1,
    orderValue: "250000",
    totalProductCommission: "25000",
    refundedAmount: "0",
    linkedProductStatus: "to_confirm",
    ...overrides,
  };
}

const HEX_64_PATTERN = /^[a-f0-9]{64}$/;

test("derivation returns a 64-character lowercase hex SHA-256 digest", () => {
  const key = deriveShopeeSourceConversionKey(buildBaseLine());
  assert.equal(typeof key, "string");
  assert.match(key, HEX_64_PATTERN);
});

test("derivation is deterministic for identical inputs", () => {
  const left = deriveShopeeSourceConversionKey(buildBaseLine());
  const right = deriveShopeeSourceConversionKey(buildBaseLine());
  assert.equal(left, right);
});

test("derivation differs when externalOrderId changes", () => {
  const left = deriveShopeeSourceConversionKey(buildBaseLine());
  const right = deriveShopeeSourceConversionKey(
    buildBaseLine({ externalOrderId: "250110OTHER" }),
  );
  assert.notEqual(left, right);
});

test("derivation differs when checkoutId changes", () => {
  const left = deriveShopeeSourceConversionKey(buildBaseLine());
  const right = deriveShopeeSourceConversionKey(
    buildBaseLine({ checkoutId: "250110ABCDXYZ_c2" }),
  );
  assert.notEqual(left, right);
});

test("derivation differs when itemId changes", () => {
  const left = deriveShopeeSourceConversionKey(buildBaseLine());
  const right = deriveShopeeSourceConversionKey(
    buildBaseLine({ itemId: "shopee-item-002" }),
  );
  assert.notEqual(left, right);
});

test("derivation differs when modelId changes", () => {
  const left = deriveShopeeSourceConversionKey(buildBaseLine());
  const right = deriveShopeeSourceConversionKey(
    buildBaseLine({ modelId: "shopee-model-002" }),
  );
  assert.notEqual(left, right);
});

test("derivation differs when quantity changes", () => {
  const left = deriveShopeeSourceConversionKey(buildBaseLine());
  const right = deriveShopeeSourceConversionKey(
    buildBaseLine({ quantity: 2 }),
  );
  assert.notEqual(left, right);
});

test("derivation differs when refund snapshot changes", () => {
  const left = deriveShopeeSourceConversionKey(buildBaseLine());
  const right = deriveShopeeSourceConversionKey(
    buildBaseLine({ refundedAmount: "50000" }),
  );
  assert.notEqual(left, right);
});

test("derivation differs when commission snapshot changes", () => {
  const left = deriveShopeeSourceConversionKey(buildBaseLine());
  const right = deriveShopeeSourceConversionKey(
    buildBaseLine({ totalProductCommission: "30000" }),
  );
  assert.notEqual(left, right);
});

test("derivation differs when status snapshot changes", () => {
  const left = deriveShopeeSourceConversionKey(buildBaseLine());
  const right = deriveShopeeSourceConversionKey(
    buildBaseLine({ linkedProductStatus: "completed" }),
  );
  assert.notEqual(left, right);
});

test("derivation differs when sourceEventId changes", () => {
  const left = deriveShopeeSourceConversionKey(buildBaseLine());
  const right = deriveShopeeSourceConversionKey(
    buildBaseLine({
      sourceEventId:
        "2222222222222222222222222222222222222222222222222222222222222222",
    }),
  );
  assert.notEqual(left, right);
});

test("derivation rejects an empty network label", () => {
  assert.throws(
    () =>
      deriveShopeeSourceConversionKey(
        buildBaseLine({ network: "  " }),
      ),
    (error) => {
      assert.ok(error instanceof InvalidShopeeSourceLineError);
      assert.equal(error.fieldName, "network");
      return true;
    },
  );
});

test("derivation rejects an empty sourceEventId", () => {
  assert.throws(
    () =>
      deriveShopeeSourceConversionKey(
        buildBaseLine({ sourceEventId: "" }),
      ),
    (error) => {
      assert.ok(error instanceof InvalidShopeeSourceLineError);
      assert.equal(error.fieldName, "sourceEventId");
      return true;
    },
  );
});

test("derivation rejects a negative quantity", () => {
  assert.throws(
    () =>
      deriveShopeeSourceConversionKey(
        buildBaseLine({ quantity: -1 }),
      ),
    (error) => {
      assert.ok(error instanceof InvalidShopeeSourceLineError);
      assert.equal(error.fieldName, "quantity");
      return true;
    },
  );
});

test("derivation rejects a non-integer quantity", () => {
  assert.throws(
    () =>
      deriveShopeeSourceConversionKey(
        buildBaseLine({ quantity: 1.5 }),
      ),
    (error) => {
      assert.ok(error instanceof InvalidShopeeSourceLineError);
      assert.equal(error.fieldName, "quantity");
      return true;
    },
  );
});

test("derivation rejects an unsafe integer quantity", () => {
  assert.throws(
    () =>
      deriveShopeeSourceConversionKey(
        buildBaseLine({
          quantity: Number.MAX_SAFE_INTEGER + 2,
        }),
      ),
    (error) => {
      assert.ok(error instanceof InvalidShopeeSourceLineError);
      assert.equal(error.fieldName, "quantity");
      return true;
    },
  );
});

test("derivation trims surrounding whitespace from string fields", () => {
  const trimmed = deriveShopeeSourceConversionKey(
    buildBaseLine({ externalOrderId: "  250110ABCDXYZ  " }),
  );
  const untrimmed = deriveShopeeSourceConversionKey(
    buildBaseLine({ externalOrderId: "250110ABCDXYZ" }),
  );
  assert.equal(trimmed, untrimmed);
});

test("derivation never accepts whitespace-only equality", () => {
  assert.throws(
    () =>
      deriveShopeeSourceConversionKey(
        buildBaseLine({ externalOrderId: "   " }),
      ),
    (error) => error instanceof InvalidShopeeSourceLineError,
  );
});
