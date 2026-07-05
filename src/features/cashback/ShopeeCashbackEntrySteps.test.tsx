import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import ShopeeCashbackEntrySteps from "./ShopeeCashbackEntrySteps";

test("Phase 20H.3e step guide renders a stable testid", () => {
  const html = renderToStaticMarkup(<ShopeeCashbackEntrySteps />);
  assert.match(html, /data-testid="shopee-cashback-entry-steps"/);
});

test("Phase 20H.3e step guide renders all three buyer steps in order", () => {
  const html = renderToStaticMarkup(<ShopeeCashbackEntrySteps />);
  assert.match(html, /shopee-cashback-entry-steps-1/);
  assert.match(html, /shopee-cashback-entry-steps-2/);
  assert.match(html, /shopee-cashback-entry-steps-3/);

  const idx1 = html.indexOf("shopee-cashback-entry-steps-1");
  const idx2 = html.indexOf("shopee-cashback-entry-steps-2");
  const idx3 = html.indexOf("shopee-cashback-entry-steps-3");
  assert.ok(idx1 >= 0 && idx2 > idx1 && idx3 > idx2, "steps must appear in order");
});

test("Phase 20H.3e step guide includes the three buyer-step titles", () => {
  const html = renderToStaticMarkup(<ShopeeCashbackEntrySteps />);
  assert.match(html, /D\u00e1n link s\u1ea3n ph\u1ea9m Shopee/);
  assert.match(html, /Xem ho\u00e0n ti\u1ec1n d\u1ef1 ki\u1ebfn/);
  assert.match(html, /Mua qua Vaffiliate v\u00e0 ch\u1edd Shopee ghi nh\u1eadn/);
});

test("Phase 20H.3e step guide uses the safer commission-not-price phrase", () => {
  const html = renderToStaticMarkup(<ShopeeCashbackEntrySteps />);
  // Phase 20H.3e correction: explicit assertion that the step copy
  // uses the safer, idiomatic phrasing "kh\u00f4ng ph\u1ea3i 60% gi\u00e1 s\u1ea3n ph\u1ea9m".
  assert.match(
    html,
    /kh\u00f4ng ph\u1ea3i 60% gi\u00e1 s\u1ea3n ph\u1ea9m/,
  );
});

test("Phase 20H.3e step guide does NOT use the old unnatural copy", () => {
  const html = renderToStaticMarkup(<ShopeeCashbackEntrySteps />);
  // The pre-correction wording "kh\u00f4ng l\u00e0 60% gi\u00e1 s\u1ea3n ph\u1ea9m"
  // is grammatically off and must never be rendered to the buyer.
  assert.ok(
    !html.includes("kh\u00f4ng l\u00e0 60% gi\u00e1 s\u1ea3n ph\u1ea9m"),
    "step guide must not render the old 'kh\u00f4ng l\u00e0 60%' copy",
  );
});

test("Phase 20H.3e step guide uses 'tr\u00ean web' (not 'tr\u00e0n web') in step 1", () => {
  const html = renderToStaticMarkup(<ShopeeCashbackEntrySteps />);
  // Step 1 body resolved copy: "Sao ch\u00e9p li\u00ean k\u1ebft s\u1ea3n ph\u1ea9m
  // Shopee g\u1ed1c tr\u00ean \u1ee9ng d\u1ee5ng ho\u1eb7c tr\u00ean web c\u1ee7a Shopee."
  // \u00ea = e with circumflex (tr\u00ean); \u1ee9 = U with horn + acute (\u1ee9ng);
  // \u1ee5 = U with hook below (d\u1ee5ng); \u1eb7 = o with circumflex + dot below (ho\u1eb7c);
  // \u1ea3 = a with question mark / a-breve (s\u1ea3n ph\u1ea9m); \u1eb7 = c-cedilla (c\u1ee7a).
  assert.match(
    html,
    /tr\u00ean \u1ee9ng d\u1ee5ng ho\u1eb7c tr\u00ean web c\u1ee7a Shopee/,
  );
  assert.ok(
    !html.includes("tr\u00e0n web"),
    "step 1 must not use the typo 'tr\u00e0n web'",
  );
});

test("Phase 20H.3e step guide explains that the 60% figure is on commission, not product price", () => {
  const html = renderToStaticMarkup(<ShopeeCashbackEntrySteps />);
  // The buyer-step copy explicitly contrasts commission vs product price
  // to prevent the "60% of price" misreading.
  assert.match(
    html,
    /theo hoa h\u1ed3ng Shopee[\s\S]*?60% gi\u00e1 s\u1ea3n ph\u1ea9m/,
  );
});

test("Phase 20H.3e step guide surfaces the Shopee reconciliation timing footnote", () => {
  const html = renderToStaticMarkup(<ShopeeCashbackEntrySteps />);
  assert.match(
    html,
    /\u0110\u01a1n Shopee th\u01b0\u1eddng c\u1ea7n th\u1eddi gian \u0111\u1ec3 \u0111\u01b0\u1ee3c \u0111\u1ed1i so\u00e1t tr\u01b0\u1edbc khi ghi nh\u1eadn ho\u00e0n ti\u1ec1n\./,
  );
});

test("Phase 20H.3e step guide honours an explicit id", () => {
  const html = renderToStaticMarkup(
    <ShopeeCashbackEntrySteps id="custom-steps" />,
  );
  assert.match(html, /id="custom-steps"/);
  assert.match(html, /id="custom-steps-title"/);
});

test("Phase 20H.3e step guide does not leak internal identifiers", () => {
  const html = renderToStaticMarkup(<ShopeeCashbackEntrySteps />);
  for (const forbidden of [
    "affiliateUrl",
    "networkSubId",
    "campaignId",
    "offerId",
    "shopId",
    "itemId",
    "vaflnk",
    "stack",
    "Error:",
  ]) {
    assert.ok(
      !html.includes(forbidden),
      `step guide must not leak '${forbidden}'`,
    );
  }
});

test("Phase 20H.3e step guide never renders literal \\uXXXX escape sequences", () => {
  // Regression guard: JSX text/attribute strings must use real Vietnamese
  // characters, not JS string escape sequences. JS escapes work inside JS
  // string literals but render literally inside JSX text nodes and JSX
  // attribute strings.
  const html = renderToStaticMarkup(<ShopeeCashbackEntrySteps />);
  assert.ok(
    !html.includes("\\u"),
    `rendered HTML must not contain the literal sequence '\\u' (found in: ${html.slice(Math.max(0, html.indexOf("\\u") - 30), html.indexOf("\\u") + 30)})`,
  );
  assert.ok(
    !html.includes("\u005c\u0075"),
    "rendered HTML must not contain a backslash followed by 'u'",
  );
});
