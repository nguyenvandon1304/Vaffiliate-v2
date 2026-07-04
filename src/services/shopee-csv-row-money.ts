/**
 * Strict decimal-string to integer-VND conversion for Shopee CSV source rows.
 *
 * Conversion rule (strict, no truncate, no round):
 *
 * 1. The input must be a non-null, non-empty, trimmed decimal string
 *    matching the strict shape:
 *
 *        ^0$                          the literal zero
 *      | ^[0-9]+(.[0-9]*)?$           a non-negative decimal
 *
 *    Anything else -- scientific, hex, internal whitespace, sign,
 *    currency suffix, garbage -- is rejected.
 *
 * 2. The numeric value must be finite and non-negative.
 *
 * 3. The fractional part, after normalization, must be exactly 0.
 *    Any non-zero fractional VND component -- 1000.5, 1000.50000,
 *    1000.99999, 0.00001, 0.1, 0.000001 -- is rejected. There is NO
 *    truncation and NO rounding under any circumstance.
 *
 * 4. Accepted examples:
 *
 *        parseShopeeSourceMoneyVnd("1000")     === 1000
 *        parseShopeeSourceMoneyVnd("1000.0")   === 1000
 *        parseShopeeSourceMoneyVnd("1000.00000") === 1000
 *        parseShopeeSourceMoneyVnd("0")        === 0
 *        parseShopeeSourceMoneyVnd("0.0")      === 0
 *
 * 5. The integer VND amount MUST fit Number.MAX_SAFE_INTEGER.
 *
 * 6. The value originates from the persisted immutable shopee_csv_rows
 *    decimal columns. The conversion does not introduce floating-point
 *    rounding: every accepted digit maps directly to an integer VND unit.
 */

export class InvalidShopeeMoneyValueError extends Error {
  readonly fieldName: string;
  readonly value: unknown;

  constructor(fieldName: string, value: unknown) {
    super(
      "Invalid Shopee CSV source money value for " +
        JSON.stringify(fieldName) +
        ": expected a non-negative decimal string with zero fractional VND, received " +
        JSON.stringify(value),
    );
    this.name = "InvalidShopeeMoneyValueError";
    this.fieldName = fieldName;
    this.value = value;
  }
}

const STRICT_NON_NEGATIVE_DECIMAL_WITH_ZERO_FRACTION =
  /^(?:0|[1-9][0-9]*)(?:\.0+)?$/;

const STRICT_NON_NEGATIVE_DECIMAL_PATTERN = /^[0-9]+(?:\.[0-9]*)?$/;

/**
 * Parse an immutable Shopee CSV source money string into a non-negative
 * integer VND amount.
 */
export function parseShopeeSourceMoneyVnd(
  value: unknown,
  fieldName: string,
): number {
  if (typeof value !== "string") {
    throw new InvalidShopeeMoneyValueError(fieldName, value);
  }

  if (value.length === 0 || value.trim().length === 0) {
    throw new InvalidShopeeMoneyValueError(fieldName, value);
  }

  const trimmed = value.trim();

  // Reject leading sign. The literal "-" or "+" must not appear.
  if (trimmed.startsWith("-") || trimmed.startsWith("+")) {
    throw new InvalidShopeeMoneyValueError(fieldName, value);
  }

  // Reject scientific / hex / general non-decimal shapes.
  if (!STRICT_NON_NEGATIVE_DECIMAL_PATTERN.test(trimmed)) {
    throw new InvalidShopeeMoneyValueError(fieldName, value);
  }

  // Accept only decimal strings whose normalized fractional part is 0.
  if (!STRICT_NON_NEGATIVE_DECIMAL_WITH_ZERO_FRACTION.test(trimmed)) {
    throw new InvalidShopeeMoneyValueError(fieldName, value);
  }

  // Convert via bigint so JS floating-point quirks cannot round away a
  // single VND unit. The regex already guarantees that any decimal point
  // present is followed entirely by zeros ("1000.0", "0.000"). Strip the
  // .0+ suffix so BigInt() never sees a non-integer decimal string.
  const integerLiteral = trimmed.includes(".")
    ? trimmed.slice(0, trimmed.indexOf("."))
    : trimmed;
  let parsed: bigint;
  try {
    parsed = BigInt(integerLiteral);
  } catch {
    throw new InvalidShopeeMoneyValueError(fieldName, value);
  }

  if (parsed < BigInt(0)) {
    throw new InvalidShopeeMoneyValueError(fieldName, value);
  }

  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new InvalidShopeeMoneyValueError(fieldName, value);
  }

  return Number(parsed);
}
