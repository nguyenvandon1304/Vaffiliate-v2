/**
 * Unit tests for the strict Shopee CSV source money converter.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  InvalidShopeeMoneyValueError,
  parseShopeeSourceMoneyVnd,
} from "./shopee-csv-row-money";

test("parseShopeeSourceMoneyVnd accepts an integer-only VND string", () => {
  assert.equal(parseShopeeSourceMoneyVnd("1000", "value"), 1000);
});

test("parseShopeeSourceMoneyVnd accepts a decimal string with zero fractional part", () => {
  assert.equal(parseShopeeSourceMoneyVnd("1000.0", "value"), 1000);
  assert.equal(parseShopeeSourceMoneyVnd("1000.00000", "value"), 1000);
  assert.equal(parseShopeeSourceMoneyVnd("1000.00", "value"), 1000);
});

test("parseShopeeSourceMoneyVnd accepts the literal zero", () => {
  assert.equal(parseShopeeSourceMoneyVnd("0", "value"), 0);
  assert.equal(parseShopeeSourceMoneyVnd("0.0", "value"), 0);
  assert.equal(parseShopeeSourceMoneyVnd("0.00000", "value"), 0);
});

test("parseShopeeSourceMoneyVnd accepts the largest safe integer", () => {
  assert.equal(
    parseShopeeSourceMoneyVnd(
      String(Number.MAX_SAFE_INTEGER),
      "value",
    ),
    Number.MAX_SAFE_INTEGER,
  );
});

test("parseShopeeSourceMoneyVnd trims surrounding whitespace before parsing", () => {
  assert.equal(parseShopeeSourceMoneyVnd("  1000  ", "value"), 1000);
});

test("parseShopeeSourceMoneyVnd rejects whitespace-only strings", () => {
  assert.throws(
    () => parseShopeeSourceMoneyVnd("   ", "value"),
    (error) => error instanceof InvalidShopeeMoneyValueError,
  );
});

test("parseShopeeSourceMoneyVnd rejects empty strings", () => {
  assert.throws(
    () => parseShopeeSourceMoneyVnd("", "value"),
    (error) => error instanceof InvalidShopeeMoneyValueError,
  );
});

test("parseShopeeSourceMoneyVnd rejects negative numbers", () => {
  assert.throws(
    () => parseShopeeSourceMoneyVnd("-1000", "value"),
    (error) => error instanceof InvalidShopeeMoneyValueError,
  );
  assert.throws(
    () => parseShopeeSourceMoneyVnd("-1000.0", "value"),
    (error) => error instanceof InvalidShopeeMoneyValueError,
  );
  assert.throws(
    () => parseShopeeSourceMoneyVnd("-0.00000", "value"),
    (error) => error instanceof InvalidShopeeMoneyValueError,
  );
});

test("parseShopeeSourceMoneyVnd rejects leading-plus signs", () => {
  assert.throws(
    () => parseShopeeSourceMoneyVnd("+1000", "value"),
    (error) => error instanceof InvalidShopeeMoneyValueError,
  );
});

test("parseShopeeSourceMoneyVnd rejects scientific notation", () => {
  assert.throws(
    () => parseShopeeSourceMoneyVnd("1e3", "value"),
    (error) => error instanceof InvalidShopeeMoneyValueError,
  );
  assert.throws(
    () => parseShopeeSourceMoneyVnd("1E3", "value"),
    (error) => error instanceof InvalidShopeeMoneyValueError,
  );
});

test("parseShopeeSourceMoneyVnd rejects hex notation", () => {
  assert.throws(
    () => parseShopeeSourceMoneyVnd("0x10", "value"),
    (error) => error instanceof InvalidShopeeMoneyValueError,
  );
});

test("parseShopeeSourceMoneyVnd rejects strings with trailing garbage", () => {
  assert.throws(
    () => parseShopeeSourceMoneyVnd("1000 VND", "value"),
    (error) => error instanceof InvalidShopeeMoneyValueError,
  );
  assert.throws(
    () => parseShopeeSourceMoneyVnd("1000abc", "value"),
    (error) => error instanceof InvalidShopeeMoneyValueError,
  );
});

test("parseShopeeSourceMoneyVnd rejects strings with internal whitespace", () => {
  assert.throws(
    () => parseShopeeSourceMoneyVnd("1 000", "value"),
    (error) => error instanceof InvalidShopeeMoneyValueError,
  );
});

test("parseShopeeSourceMoneyVnd rejects a fractional VND value of 0.5 (no truncate)", () => {
  assert.throws(
    () => parseShopeeSourceMoneyVnd("1000.5", "value"),
    (error) => {
      assert.ok(error instanceof InvalidShopeeMoneyValueError);
      assert.equal(error.fieldName, "value");
      return true;
    },
  );
});

test("parseShopeeSourceMoneyVnd rejects 1000.50000 (no truncate)", () => {
  assert.throws(
    () => parseShopeeSourceMoneyVnd("1000.50000", "value"),
    (error) => error instanceof InvalidShopeeMoneyValueError,
  );
});

test("parseShopeeSourceMoneyVnd rejects 1000.99999 (no round)", () => {
  assert.throws(
    () => parseShopeeSourceMoneyVnd("1000.99999", "value"),
    (error) => error instanceof InvalidShopeeMoneyValueError,
  );
});

test("parseShopeeSourceMoneyVnd rejects 0.00001 (no truncate)", () => {
  assert.throws(
    () => parseShopeeSourceMoneyVnd("0.00001", "value"),
    (error) => error instanceof InvalidShopeeMoneyValueError,
  );
});

test("parseShopeeSourceMoneyVnd rejects 0.1 (no truncate)", () => {
  assert.throws(
    () => parseShopeeSourceMoneyVnd("0.1", "value"),
    (error) => error instanceof InvalidShopeeMoneyValueError,
  );
});

test("parseShopeeSourceMoneyVnd rejects 0.000001 (no truncate)", () => {
  assert.throws(
    () => parseShopeeSourceMoneyVnd("0.000001", "value"),
    (error) => error instanceof InvalidShopeeMoneyValueError,
  );
});

test("parseShopeeSourceMoneyVnd rejects unsafe large values", () => {
  assert.throws(
    () =>
      parseShopeeSourceMoneyVnd(
        (BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1)).toString(),
        "value",
      ),
    (error) => error instanceof InvalidShopeeMoneyValueError,
  );
});

test("parseShopeeSourceMoneyVnd rejects non-string input types", () => {
  for (const badInput of [
    null,
    undefined,
    1000,
    1000.5,
    true,
    false,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    [],
    {},
  ] as unknown[]) {
    assert.throws(
      () => parseShopeeSourceMoneyVnd(badInput, "value"),
      (error) => {
        assert.ok(error instanceof InvalidShopeeMoneyValueError);
        return true;
      },
    );
  }
});

test("parseShopeeSourceMoneyVnd never accepts a number type even for integer shapes", () => {
  assert.throws(
    () => parseShopeeSourceMoneyVnd(1000, "value"),
    (error) => error instanceof InvalidShopeeMoneyValueError,
  );
});

test("parseShopeeSourceMoneyVnd field name propagates into the typed error", () => {
  assert.throws(
    () => parseShopeeSourceMoneyVnd("1000.5", "order_value"),
    (error) => {
      assert.ok(error instanceof InvalidShopeeMoneyValueError);
      assert.equal(error.fieldName, "order_value");
      return true;
    },
  );
  assert.throws(
    () => parseShopeeSourceMoneyVnd("1000.5", "refunded_amount"),
    (error) => {
      assert.ok(error instanceof InvalidShopeeMoneyValueError);
      assert.equal(error.fieldName, "refunded_amount");
      return true;
    },
  );
});
