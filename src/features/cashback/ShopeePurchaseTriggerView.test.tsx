import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import ShopeePurchaseTriggerView, {
  type ShopeePurchaseTriggerViewState,
} from "./ShopeePurchaseTriggerView";

// Phase 20H.4b: buyer handoff hardening, no-leak surface.
//
// The view is pure and server-renderable: it takes a discriminated
// `state` and an optional `onPurchase` handler, and renders the
// correct tree. None of the internal tracking identifiers
// (shortCode, productUrl, networkSubId, clickId, purchaseIntentId,
// campaignId, offerId) ever appear in the render output, because
// the view does not receive them as props.
//
// These tests assert EXACT buyer-facing Vietnamese copy -- never
// ASCII transliteration -- and include a strict mojibake-marker
// check that fails if any common UTF-8 mojibake sequence appears in
// the rendered output.

const PROMINENT_LOGIN_HREF =
  "/login?next=" +
  encodeURIComponent(
    "/cashback?productUrl=" +
      encodeURIComponent(
        "https://shopee.vn/product/1408027998/44812498433",
      ),
  );

// Exact Vietnamese copy used by the public /cashback handoff.
// Source must match the literals in:
//   - ShopeePurchaseTriggerView.tsx (hardcoded button label,
//     sentence, link text, redirecting status)
//   - initiateShopeePurchaseAction error messages (the safe
//     Vietnamese sentence below is the buyer-facing fallback)
const CTA_COPY = "Mua ngay nhận hoàn tiền";
const PENDING_BUTTON_LABEL = "Đang xử lý...";
const LOGGED_OUT_SENTENCE =
  "Đăng nhập để nhận hoàn tiền từ Vaffiliate qua Shopee.";
const LOGGED_OUT_LINK_LABEL = "Đăng nhập";
const REDIRECTING_LABEL = "Đang chuyển bạn sang Shopee...";
const ERROR_COPY =
  "Không thể tạo link hoàn tiền lúc này. Vui lòng thử lại.";

// Strict mojibake-marker check.
//
// These markers are derived from common single-byte-codepage
// misinterpretation of UTF-8 bytes (Latin-1 / Windows-1252 /
// CP1258 / mojibake chains). They are intentionally expressed as
// numeric codepoints via String.fromCodePoint so that the test
// source file itself remains free of those exact byte sequences.
//
// The marker set mirrors the brief's checklist:
//   A-tilde (U+00C3), A-umlaut (U+00C4), A-circumflex (U+00C2),
//   a-ogonek (U+00E1 0xBA frag), a-ogonek-2 (U+00E1 0xBB frag),
//   C-cedilla / NBSP neighbour (U+00C7 joined glyph),
//   eszett (U+00DF), box-drawing horizontal (U+2500),
//   box-drawing double down-left (U+251C), box-drawing double
//   down-right (U+2557), box-drawing double vertical (U+2551),
//   Unicode replacement char (U+FFFD).
const MOJIBAKE_MARKERS: readonly string[] = Object.freeze([
  String.fromCodePoint(0x00c3),        // A-tilde fragment
  String.fromCodePoint(0x00c4),        // A-umlaut fragment
  String.fromCodePoint(0x00c2),        // A-circumflex fragment
  String.fromCodePoint(0x00e1) +       // a-ogonek fragment 1
    String.fromCodePoint(0x00ba),
  String.fromCodePoint(0x00e1) +       // a-ogonek fragment 2
    String.fromCodePoint(0x00bb),
  String.fromCodePoint(0x00c7),        // C-cedilla / NBSP neighbour
  String.fromCodePoint(0x00df),        // eszett
  String.fromCodePoint(0x2500),        // box-drawing horizontal
  String.fromCodePoint(0x251c),        // box-drawing double down-left
  String.fromCodePoint(0x2557),        // box-drawing double down-right
  String.fromCodePoint(0x2551),        // box-drawing double vertical bar
  String.fromCodePoint(0xfffd),        // replacement char
]);

function assertNoMojibake(html: string, label: string): void {
  for (const marker of MOJIBAKE_MARKERS) {
    assert.ok(
      !html.includes(marker),
      `${label}: rendered output must not contain mojibake marker U+${marker.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`,
    );
  }
}

test(
  "Phase 20H.4b logged-out view renders a disabled CTA with the exact Vietnamese sentence and login link",
  () => {
    const state: ShopeePurchaseTriggerViewState = {
      kind: "logged_out",
      loginHref: PROMINENT_LOGIN_HREF,
      buttonText: CTA_COPY,
      variant: "prominent",
    };
    const html = renderToStaticMarkup(
      <ShopeePurchaseTriggerView state={state} />,
    );

    // Buy CTA must be hard-disabled and aria-disabled.
    assert.match(html, /<button[^>]*type="button"[^>]*disabled/);
    assert.match(html, /<button[^>]*aria-disabled="true"[^>]*>/);

    // Exact Vietnamese sentence -- no transliteration tolerated.
    assert.ok(
      html.includes(LOGGED_OUT_SENTENCE),
      `logged-out view must render the exact sentence ${JSON.stringify(LOGGED_OUT_SENTENCE)}`,
    );
    // Exact Vietnamese login link label.
    assert.ok(
      html.includes(LOGGED_OUT_LINK_LABEL),
      `logged-out view must render the exact link label ${JSON.stringify(LOGGED_OUT_LINK_LABEL)}`,
    );

    // Login link must carry the propagated next= handoff, not the bare /login.
    assert.match(html, /href="\/login\?next=/);
    assert.ok(html.includes(encodeURIComponent("/cashback?productUrl=")));

    // The pending label and the redirecting label must NOT leak into
    // the logged-out branch.
    assert.ok(!html.includes(PENDING_BUTTON_LABEL));
    assert.ok(!html.includes(REDIRECTING_LABEL));

    assertNoMojibake(html, "logged_out view");
  },
);

test(
  "Phase 20H.4b logged-in idle view renders the exact prominent CTA copy with no aria-busy and no error",
  () => {
    const state: ShopeePurchaseTriggerViewState = {
      kind: "logged_in_idle",
      buttonText: CTA_COPY,
      variant: "prominent",
    };
    const html = renderToStaticMarkup(
      <ShopeePurchaseTriggerView state={state} onPurchase={() => {}} />,
    );
    assert.ok(
      html.includes(CTA_COPY),
      `logged-in idle view must render the exact CTA copy ${JSON.stringify(CTA_COPY)}`,
    );
    assert.ok(!html.includes("aria-busy="));
    assert.ok(!html.includes('role="alert"'));

    assertNoMojibake(html, "logged_in_idle view");
  },
);

test(
  "Phase 20H.4b logged-in pending view renders aria-busy=true and the exact Vietnamese in-flight label",
  () => {
    const state: ShopeePurchaseTriggerViewState = {
      kind: "logged_in_pending",
      buttonText: CTA_COPY,
      variant: "prominent",
    };
    const html = renderToStaticMarkup(
      <ShopeePurchaseTriggerView state={state} />,
    );
    assert.match(html, /aria-busy="true"/);
    assert.match(html, /<button[^>]*type="button"[^>]*disabled/);
    // Exact Vietnamese copy -- the view hardcodes this label, never
    // the prop value. No transliteration allowed.
    assert.ok(
      html.includes(PENDING_BUTTON_LABEL),
      `logged-in pending view must render the exact label ${JSON.stringify(PENDING_BUTTON_LABEL)}`,
    );
    assert.ok(!html.includes(CTA_COPY));

    assertNoMojibake(html, "logged_in_pending view");
  },
);

test(
  "Phase 20H.4b logged-in error view renders role=alert with the exact Vietnamese error message and the CTA stays clickable",
  () => {
    const state: ShopeePurchaseTriggerViewState = {
      kind: "logged_in_error",
      buttonText: CTA_COPY,
      variant: "prominent",
      errorMessage: ERROR_COPY,
    };
    let clickCount = 0;
    const html = renderToStaticMarkup(
      <ShopeePurchaseTriggerView
        state={state}
        onPurchase={() => {
          clickCount += 1;
        }}
      />,
    );
    assert.match(html, /role="alert"/);
    // The prop is rendered verbatim, so exact-Vietnamese copy
    // round-trips. We assert the EXACT Vietnamese -- no ASCII
    // transliteration is permitted.
    assert.ok(
      html.includes(ERROR_COPY),
      `logged-in error view must render the exact message ${JSON.stringify(ERROR_COPY)}`,
    );
    // The CTA must NOT be disabled on error -- the buyer can retry.
    // Use a word-boundary check so the `disabled:` Tailwind variants
    // in the className do not trigger a false positive.
    assert.ok(
      !html.match(
        /<button[^>]*type="button"(?:\s+[^=>\s]+(?:="[^"]*")?)*?\sdisabled(?:[\s>])/,
      ),
    );
    assert.equal(clickCount, 0);

    assertNoMojibake(html, "logged_in_error view");
  },
);

test(
  "Phase 20H.4b redirecting view renders a polite live region with the exact Vietnamese label",
  () => {
    const html = renderToStaticMarkup(
      <ShopeePurchaseTriggerView state={{ kind: "redirecting" }} />,
    );
    assert.match(html, /aria-live="polite"/);
    assert.match(html, /role="status"/);
    // Exact Vietnamese copy -- the view hardcodes this label.
    assert.ok(
      html.includes(REDIRECTING_LABEL),
      `redirecting view must render the exact label ${JSON.stringify(REDIRECTING_LABEL)}`,
    );
    // No buy button should be clickable.
    assert.ok(!html.includes("<button"));

    assertNoMojibake(html, "redirecting view");
  },
);

test(
  "Phase 20H.4b view never leaks internal identifiers, literal backslash-u escapes, or UTF-8 mojibake in any state",
  () => {
    const samples: ShopeePurchaseTriggerViewState[] = [
      {
        kind: "logged_out",
        loginHref: PROMINENT_LOGIN_HREF,
        buttonText: CTA_COPY,
        variant: "prominent",
      },
      { kind: "logged_in_idle", buttonText: CTA_COPY, variant: "prominent" },
      { kind: "logged_in_pending", buttonText: CTA_COPY, variant: "prominent" },
      {
        kind: "logged_in_error",
        buttonText: CTA_COPY,
        variant: "prominent",
        errorMessage: ERROR_COPY,
      },
      { kind: "redirecting" },
    ];
    for (const state of samples) {
      const html = renderToStaticMarkup(
        <ShopeePurchaseTriggerView state={state} />,
      );
      for (const forbidden of [
        "affiliateUrl",
        "networkSubId",
        "clickId",
        "purchaseIntentId",
        "campaignId",
        "offerId",
        "an_redir",
        "trackingPath",
        "trackingLinkId",
        "shortCode",
      ]) {
        assert.ok(
          !html.includes(forbidden),
          `view state ${state.kind} must not leak '${forbidden}'`,
        );
      }
      assert.ok(
        !html.includes("\\u"),
        `view state ${state.kind} must not contain literal backslash-u escapes`,
      );

      assertNoMojibake(html, `state ${state.kind} no-leak sweep`);
    }
  },
);
