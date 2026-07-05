import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import ShopeeCashbackTrustInstructions from "./ShopeeCashbackTrustInstructions";

test("Phase 20H.3e trust instructions surface a stable testid", () => {
  const html = renderToStaticMarkup(<ShopeeCashbackTrustInstructions />);
  assert.match(
    html,
    /data-testid="shopee-cashback-trust-instructions"/,
  );
  assert.match(
    html,
    /data-testid="shopee-cashback-trust-instructions-list"/,
  );
});

test("Phase 20H.3e trust instructions keep all six buyer rules", () => {
  const html = renderToStaticMarkup(<ShopeeCashbackTrustInstructions />);
  for (let i = 1; i <= 6; i += 1) {
    assert.match(
      html,
      new RegExp(`shopee-cashback-trust-instructions-item-${i}`),
    );
  }
  // Spot-check rule bodies (Vietnamese Unicode).
  assert.match(html, /B\u1ea5m mua t\u1eeb Vaffiliate/);
  assert.match(html, /Kh\u00f4ng \u0111\u1ed5i sang link kh\u00e1c/);
  assert.match(html, /Kh\u00f4ng d\u00f9ng s\u1ea3n ph\u1ea9m \u0111\u00e3 c\u00f3 s\u1eb5n trong gi\u1ecf/);
  assert.match(html, /Shopee ghi nh\u1eadn/);
  assert.match(html, /hoa h\u1ed3ng Shopee, kh\u00f4ng ph\u1ea3i t\u1eeb to\u00e0n b\u1ed9 gi\u00e1 tr\u1ecb s\u1ea3n ph\u1ea9m/);
});

test("Phase 20H.3e trust instructions state that cashback is not guaranteed", () => {
  const html = renderToStaticMarkup(<ShopeeCashbackTrustInstructions />);
  assert.match(
    html,
    /S\u1ed1 ti\u1ec1n ho\u00e0n th\u1ef1c t\u1ebf \u0111\u01b0\u1ee3c x\u00e1c \u0111\u1ecbnh theo hoa h\u1ed3ng Shopee ph\u00ea duy\u1ec7t sau khi \u0111\u01a1n h\u00e0ng ho\u00e0n t\u1ea5t\./,
  );
});

test("Phase 20H.3e trust instructions do not leak internal identifiers", () => {
  const html = renderToStaticMarkup(<ShopeeCashbackTrustInstructions />);
  for (const forbidden of [
    "affiliateUrl",
    "networkSubId",
    "campaignId",
    "offerId",
    "shopId",
    "itemId",
    "vaflnk",
    "Error:",
    "stack",
  ]) {
    assert.ok(
      !html.includes(forbidden),
      `trust instructions must not leak '${forbidden}'`,
    );
  }
});

test("Phase 20H.3e trust instructions never render literal \\uXXXX escape sequences", () => {
  // Regression guard: JSX text/attribute strings must use real Vietnamese
  // characters, not JS string escape sequences. JS escapes work inside JS
  // string literals but render literally inside JSX text nodes and JSX
  // attribute strings.
  const html = renderToStaticMarkup(<ShopeeCashbackTrustInstructions />);
  assert.ok(
    !html.includes("\\u"),
    `rendered HTML must not contain the literal sequence '\\u' (found in: ${html.slice(Math.max(0, html.indexOf("\\u") - 30), html.indexOf("\\u") + 30)})`,
  );
  assert.ok(
    !html.includes("\u005c\u0075"),
    "rendered HTML must not contain a backslash followed by 'u'",
  );
});
