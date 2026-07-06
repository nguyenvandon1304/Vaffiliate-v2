import type { ComponentType } from "react";
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import PublicCashbackFlow, {
  buildLoginHref,
  pickEffectiveLoginHref,
} from "./PublicCashbackFlow";

/**
 * Tests cover the FLOW composition (hero -> preview slot -> steps
 * -> trust) and the AUTH-HANDOFF wiring (`loginHref` survival +
 * logged-in CTA copy) without dragging the real
 * `<ShopeeCashbackPreviewForm/>` -- which transitively imports the
 * Shopee `server-only` actions module -- into the test runtime.
 *
 * The preview slot is stubbed to embed every prop the flow passes
 * down as `data-*` attributes on a stable testid. The tests then
 * read those attributes from the rendered HTML, so we can assert:
 *   - the form receives `isAuthenticated` unchanged,
 *   - the form receives `initialProductUrl` pre-filled,
 *   - the form receives the `loginHref` that round-trips the
 *     productUrl through `/login?next=/cashback?productUrl=...`.
 *
 * Reading via `data-*` keeps the test render pure -- no
 * module-level mutable state, so the React `react-hooks/globals`
 * lint rule is satisfied.
 */

interface CapturedPreviewSlotProps {
  isAuthenticated: boolean;
  initialProductUrl?: string;
  initialProductUrlProp: string;
  loginHref?: string;
  loginHrefProp: string;
  isAuthenticatedAttr: string;
}

function readCapturedSlotProps(
  html: string,
): CapturedPreviewSlotProps | null {
  const match = html.match(
    /<div[^>]*data-testid="stub-preview-slot"[^>]*>/,
  );
  if (!match) {
    return null;
  }
  const openingTag = match[0];

  const get = (name: string): string => {
    const attr = new RegExp(`${name}="([^"]*)"`).exec(openingTag);
    return attr ? attr[1] : "";
  };

  const initialProductUrl = get("data-initial-product-url");
  const loginHref = get("data-login-href");
  const isAuthenticatedAttr = get("data-is-authenticated");

  return {
    isAuthenticated: isAuthenticatedAttr === "true",
    initialProductUrl:
      initialProductUrl === "" ? undefined : initialProductUrl,
    initialProductUrlProp: initialProductUrl,
    loginHref: loginHref === "" ? undefined : loginHref,
    loginHrefProp: loginHref,
    isAuthenticatedAttr,
  };
}

function CapturingPreviewSlot(props: {
  isAuthenticated: boolean;
  initialProductUrl?: string;
  loginHref?: string;
}) {
  return (
    <div
      data-testid="stub-preview-slot"
      data-is-authenticated={props.isAuthenticated ? "true" : "false"}
      data-login-href={props.loginHref ?? ""}
      data-initial-product-url={props.initialProductUrl ?? ""}
    >
      <button type="button" disabled aria-disabled="true">
        Mua ngay nhận hoàn tiền
      </button>
      <a
        href={props.loginHref ?? "/login"}
        data-testid="stub-buy-cta-link"
      >
        Đăng nhập để nhận hoàn tiền từ Vaffiliate qua Shopee
      </a>
    </div>
  );
}

const stubPreviewSlot = CapturingPreviewSlot as unknown as ComponentType<{
  isAuthenticated: boolean;
  initialProductUrl?: string;
  loginHref?: string;
}>;

test(
  "Phase 20H.4a public flow composes hero -> preview slot -> steps -> trust notes in order",
  () => {
    const html = renderToStaticMarkup(
      <PublicCashbackFlow
        isAuthenticated={false}
        initialProductUrl={null}
        previewSlot={stubPreviewSlot}
      />,
    );

    const heroIdx = html.indexOf("public-cashback-hero");
    const previewIdx = html.indexOf("stub-preview-slot");
    const stepsIdx = html.indexOf("shopee-cashback-entry-steps");
    const trustIdx = html.indexOf(
      "shopee-cashback-trust-instructions",
    );

    assert.ok(heroIdx >= 0, "hero testid must render");
    assert.ok(
      previewIdx > heroIdx,
      "preview slot must follow hero",
    );
    assert.ok(
      stepsIdx > previewIdx,
      "entry steps must follow preview slot",
    );
    assert.ok(
      trustIdx > stepsIdx,
      "trust instructions must follow entry steps",
    );
  },
);

test(
  "Phase 20H.4a public flow renders the public hero copy (logged-out)",
  () => {
    const html = renderToStaticMarkup(
      <PublicCashbackFlow
        isAuthenticated={false}
        initialProductUrl={null}
        previewSlot={stubPreviewSlot}
      />,
    );

    assert.match(
      html,
      /Dán link Shopee để kiểm tra hoàn tiền\./,
      "headline must call for pasting a Shopee link",
    );
    assert.match(
      html,
      /Mua sắm hoàn tiền Shopee/,
      "eyebrow must read 'Mua sắm hoàn tiền Shopee'",
    );
    assert.match(
      html,
      /theo hoa hồng Shopee/,
      "copy must reference hoa hồng Shopee (cashback basis)",
    );
  },
);

test(
  "Phase 20H.4a public flow pre-fills the preview slot input from initialProductUrl",
  () => {
    const html = renderToStaticMarkup(
      <PublicCashbackFlow
        isAuthenticated={false}
        initialProductUrl="https://shopee.vn/product/1408027998/44812498433"
        previewSlot={stubPreviewSlot}
      />,
    );

    const captured = readCapturedSlotProps(html);
    assert.ok(captured !== null, "preview slot must be rendered");
    assert.equal(
      captured!.initialProductUrlProp,
      "https://shopee.vn/product/1408027998/44812498433",
      "preview slot input must be pre-filled from initialProductUrl",
    );
    assert.equal(
      captured!.isAuthenticated,
      false,
      "isAuthenticated must be forwarded to the preview slot as false",
    );
  },
);

test(
  "Phase 20H.4a public flow forwards a loginHref that round-trips the productUrl through /cashback?productUrl=...",
  () => {
    const productUrl =
      "https://shopee.vn/product/1408027998/44812498433";
    const html = renderToStaticMarkup(
      <PublicCashbackFlow
        isAuthenticated={false}
        initialProductUrl={productUrl}
        previewSlot={stubPreviewSlot}
      />,
    );

    const captured = readCapturedSlotProps(html);
    assert.ok(captured !== null, "preview slot must be rendered");
    assert.ok(
      captured!.loginHrefProp !== "",
      "preview slot must receive a loginHref when initialProductUrl is set",
    );

    // Round-trip the encoded loginHref through both query layers
    // and assert the productUrl comes back exactly. This catches
    // regressions where the inner / outer URLSearchParams encode
    // a Shopee URL incorrectly.
    const loginUrl = new URL(
      `http://placeholder.local${captured!.loginHrefProp}`,
    );
    const next = loginUrl.searchParams.get("next");
    assert.ok(next !== null);
    const cashbackUrl = new URL(`http://placeholder.local${next}`);
    assert.equal(
      cashbackUrl.searchParams.get("productUrl"),
      productUrl,
      "loginHref must round-trip the productUrl through /login -> next -> /cashback?productUrl exactly",
    );
  },
);

test(
  "Phase 20H.4a public flow renders no loginHref when initialProductUrl is null",
  () => {
    const html = renderToStaticMarkup(
      <PublicCashbackFlow
        isAuthenticated={false}
        initialProductUrl={null}
        previewSlot={stubPreviewSlot}
      />,
    );

    const captured = readCapturedSlotProps(html);
    assert.ok(captured !== null, "preview slot must be rendered");
    assert.equal(
      captured!.loginHrefProp,
      "",
      "loginHref data-attr must be empty when initialProductUrl is null",
    );
  },
);

test(
  "Phase 20H.4a public flow surfaces the four trust badges in the hero",
  () => {
    const html = renderToStaticMarkup(
      <PublicCashbackFlow
        isAuthenticated={false}
        initialProductUrl={null}
        previewSlot={stubPreviewSlot}
      />,
    );
    assert.match(
      html,
      /public-cashback-hero-trust-badges/,
      "trust badge list testid must render",
    );
    assert.match(
      html,
      /hoa hồng Shopee, không phải giá sản phẩm/,
      "trust badge 1 (commission not price) must render",
    );
    assert.match(
      html,
      /Giá chỉ để tham khảo/,
      "trust badge 2 (price is reference) must render",
    );
    assert.match(
      html,
      /Không phải sản phẩm nào cũng có hoa hồng/,
      "trust badge 3 (not every product earns) must render",
    );
    assert.match(
      html,
      /Hoàn tiền chỉ xác nhận sau khi Shopee đối soát/,
      "trust badge 4 (post-reconciliation) must render",
    );
  },
);

test(
  "Phase 20H.4a public flow does NOT include any internal identifiers",
  () => {
    const html = renderToStaticMarkup(
      <PublicCashbackFlow
        isAuthenticated={false}
        initialProductUrl={
          "https://shopee.vn/product/1408027998/44812498433"
        }
        previewSlot={stubPreviewSlot}
      />,
    );
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
      "an_redir",
      "141-2-20H.3d",
    ]) {
      assert.ok(
        !html.includes(forbidden),
        `public cashback flow must not leak '${forbidden}'`,
      );
    }
  },
);

test(
  "Phase 20H.4a public flow never renders literal backslash-u escape sequences",
  () => {
    const html = renderToStaticMarkup(
      <PublicCashbackFlow
        isAuthenticated={false}
        initialProductUrl={
          "https://shopee.vn/product/1408027998/44812498433"
        }
        previewSlot={stubPreviewSlot}
      />,
    );
    assert.ok(
      !html.includes("\\u"),
      `public flow must not render literal backslash-u escapes; got: ${html.slice(0, 400)}`,
    );
  },
);

test(
  "Phase 20H.4a public flow copy does NOT imply 60% of the product price as the cashback basis",
  () => {
    const html = renderToStaticMarkup(
      <PublicCashbackFlow
        isAuthenticated={false}
        initialProductUrl={
          "https://shopee.vn/product/1408027998/44812498433"
        }
        previewSlot={stubPreviewSlot}
      />,
    );

    // The hero subhead must explicitly attribute cashback to
    // hoa hồng Shopee. The entry steps contrast the 60% figure
    // with "không phải 60% giá sản phẩm" to disambiguate from a
    // common misconception, so we assert that exact disambiguation
    // pattern is present and the affirmative pattern "60% giá sản
    // phẩm" never appears without the "không phải" prefix.
    assert.match(
      html,
      /không phải 60% giá sản phẩm/,
      "entry steps must contain the 'không phải 60% giá sản phẩm' disambiguation",
    );
    assert.ok(
      !/(?<!không phải )60% giá sản phẩm/.test(html),
      "public flow must never say '60% giá sản phẩm' as an affirmative claim",
    );
    assert.match(
      html,
      /hoa hồng Shopee/,
      "hero subhead must explicitly mention hoa hồng Shopee",
    );
  },
);

test(
  "Phase 20H.4a public flow forwards isAuthenticated=true to the preview slot",
  () => {
    const html = renderToStaticMarkup(
      <PublicCashbackFlow
        isAuthenticated={true}
        initialProductUrl={
          "https://shopee.vn/product/1408027998/44812498433"
        }
        previewSlot={stubPreviewSlot}
      />,
    );
    const captured = readCapturedSlotProps(html);
    assert.ok(captured !== null, "preview slot must be rendered");
    assert.equal(
      captured!.isAuthenticated,
      true,
      "logged-in auth state must be forwarded to the preview slot",
    );
    // The loginHref is still computed and forwarded in case the
    // buyer signs out mid-session; the preview slot is responsible
    // for gating the actual link on auth state.
    assert.ok(
      captured!.loginHrefProp !== "",
      "loginHref is still forwarded when isAuthenticated is true",
    );
  },
);

// --- buildLoginHref unit tests (independent of the flow rendering) ---

test(
  "Phase 20H.4a buildLoginHref round-trips a long Shopee URL through /login?next=/cashback?productUrl=...",
  () => {
    const productUrl =
      "https://shopee.vn/product/1408027998/44812498433";
    const href = buildLoginHref(productUrl);
    assert.ok(href !== undefined);
    // Two-layer encoding: the inner `productUrl=` is encoded once
    // by the inner URLSearchParams, then the whole inner
    // `/cashback?productUrl=...` is encoded again as the outer
    // `next=` value. Verify round-trip equals the original.
    const loginUrl = new URL(`http://placeholder.local${href}`);
    const next = loginUrl.searchParams.get("next");
    assert.ok(next !== null);
    const cashbackUrl = new URL(`http://placeholder.local${next}`);
    assert.equal(
      cashbackUrl.searchParams.get("productUrl"),
      productUrl,
      "long URL must round-trip through the two-layer encoding exactly",
    );
  },
);

test(
  "Phase 20H.4a buildLoginHref round-trips a Shopee short-link URL",
  () => {
    const productUrl = "https://s.shopee.vn/9pcUY7UNn7";
    const href = buildLoginHref(productUrl);
    assert.ok(href !== undefined);
    const loginUrl = new URL(`http://placeholder.local${href}`);
    const next = loginUrl.searchParams.get("next");
    assert.ok(next !== null);
    const cashbackUrl = new URL(`http://placeholder.local${next}`);
    assert.equal(
      cashbackUrl.searchParams.get("productUrl"),
      productUrl,
      "short-link URL must round-trip through the two-layer encoding exactly",
    );
  },
);

test(
  "Phase 20H.4a buildLoginHref returns undefined when productUrl is null or empty",
  () => {
    assert.equal(buildLoginHref(null), undefined);
    assert.equal(buildLoginHref(undefined), undefined);
    assert.equal(buildLoginHref(""), undefined);
  },
);

test(
  "Phase 20H.4a buildLoginHref round-trip: canonical Shopee product URL survives two-layer encoding",
  () => {
    const productUrl =
      "https://shopee.vn/product/1408027998/44812498433";

    const loginHref = buildLoginHref(productUrl);
    assert.ok(loginHref !== undefined, "loginHref must be defined");

    // Layer 1: /login?next=...
    const loginUrl = new URL(`http://placeholder.local${loginHref}`);
    const next = loginUrl.searchParams.get("next");
    assert.ok(next !== null, "loginHref must carry a next= param");

    // Layer 2: /cashback?productUrl=...
    const cashbackUrl = new URL(`http://placeholder.local${next}`);
    const roundTripped = cashbackUrl.searchParams.get("productUrl");
    assert.equal(
      roundTripped,
      productUrl,
      "the original Shopee productUrl must round-trip through the two-layer encoding exactly",
    );
  },
);

test(
  "Phase 20H.4a buildLoginHref round-trip: Shopee short-link URL survives two-layer encoding",
  () => {
    const productUrl = "https://s.shopee.vn/9pcUY7UNn7";

    const loginHref = buildLoginHref(productUrl);
    assert.ok(loginHref !== undefined);

    const loginUrl = new URL(`http://placeholder.local${loginHref}`);
    const next = loginUrl.searchParams.get("next");
    assert.ok(next !== null);

    const cashbackUrl = new URL(`http://placeholder.local${next}`);
    const roundTripped = cashbackUrl.searchParams.get("productUrl");
    assert.equal(roundTripped, productUrl);
  },
);

test(
  "Phase 20H.4a buildLoginHref round-trip: Shopee URL with query params and ampersand survives two-layer encoding",
  () => {
    const productUrl =
      "https://shopee.vn/product/1408027998/44812498433?sp_atk=abc&x=1";

    const loginHref = buildLoginHref(productUrl);
    assert.ok(loginHref !== undefined);

    const loginUrl = new URL(`http://placeholder.local${loginHref}`);
    const next = loginUrl.searchParams.get("next");
    assert.ok(next !== null);

    const cashbackUrl = new URL(`http://placeholder.local${next}`);
    const roundTripped = cashbackUrl.searchParams.get("productUrl");
    assert.equal(
      roundTripped,
      productUrl,
      "an ampersand-bearing Shopee URL must round-trip exactly through two-layer URLSearchParams",
    );
  },
);

// --- pickEffectiveLoginHref unit tests ---

test(
  "Phase 20H.4b pickEffectiveLoginHref prefers the server-resolved canonical URL after a successful preview",
  () => {
    const productUrl =
      "https://shopee.vn/product/1408027998/44812498433";
    const href = pickEffectiveLoginHref({
      canonicalProductUrl: productUrl,
      lastSubmittedUrl: "",
      pageLevelLoginHref: undefined,
    });
    assert.ok(
      href !== undefined,
      "must produce a loginHref when canonicalProductUrl is set",
    );
    const loginUrl = new URL(`http://placeholder.local${href}`);
    const next = loginUrl.searchParams.get("next");
    assert.ok(next !== null);
    const cashbackUrl = new URL(`http://placeholder.local${next}`);
    assert.equal(
      cashbackUrl.searchParams.get("productUrl"),
      productUrl,
      "canonical productUrl must round-trip through /login -> next -> /cashback?productUrl",
    );
  },
);

test(
  "Phase 20H.4b pickEffectiveLoginHref falls back to lastSubmittedUrl when no canonical URL is available yet",
  () => {
    const productUrl =
      "https://shopee.vn/product/1408027998/44812498433";
    const href = pickEffectiveLoginHref({
      canonicalProductUrl: "",
      lastSubmittedUrl: productUrl,
      pageLevelLoginHref: undefined,
    });
    assert.ok(
      href !== undefined,
      "must produce a loginHref from lastSubmittedUrl when canonicalProductUrl is empty",
    );
    const loginUrl = new URL(`http://placeholder.local${href}`);
    const next = loginUrl.searchParams.get("next");
    const cashbackUrl = new URL(`http://placeholder.local${next}`);
    assert.equal(
      cashbackUrl.searchParams.get("productUrl"),
      productUrl,
    );
  },
);

test(
  "Phase 20H.4b pickEffectiveLoginHref preserves lastSubmittedUrl when page had no initialProductUrl (smoke fix)",
  () => {
    // Smoke scenario: buyer opens /cashback (no ?productUrl=),
    // pastes a Shopee URL into the form, and submits. Without the
    // fix, the trigger renders /login with no next= and the buyer
    // loses their pasted link. With the fix, lastSubmittedUrl is
    // promoted into the loginHref.
    const productUrl =
      "https://shopee.vn/product/1408027998/44812498433";
    const href = pickEffectiveLoginHref({
      canonicalProductUrl: "",
      lastSubmittedUrl: productUrl,
      pageLevelLoginHref: undefined,
    });
    assert.ok(
      href !== undefined && href.includes("next="),
      "must produce a loginHref with next= even when pageLevelLoginHref is undefined",
    );
    const loginUrl = new URL(`http://placeholder.local${href}`);
    const next = loginUrl.searchParams.get("next");
    assert.ok(next !== null);
    const cashbackUrl = new URL(`http://placeholder.local${next}`);
    assert.equal(
      cashbackUrl.searchParams.get("productUrl"),
      productUrl,
      "pasted productUrl must survive the login handoff round-trip",
    );
  },
);

test(
  "Phase 20H.4b pickEffectiveLoginHref canonical URL wins over stale pageLevelLoginHref from initialProductUrl",
  () => {
    // Scenario: buyer opens /cashback?productUrl=OLD, pastes a
    // NEW URL into the form, gets a preview. The canonical URL
    // from the server-resolved preview must win over the
    // page-level loginHref that was built from the old URL.
    const oldUrl =
      "https://shopee.vn/product/OLD/0";
    const newUrl =
      "https://shopee.vn/product/NEW/1";
    const pageLevelLoginHref = buildLoginHref(oldUrl);
    assert.ok(pageLevelLoginHref !== undefined);
    const href = pickEffectiveLoginHref({
      canonicalProductUrl: newUrl,
      lastSubmittedUrl: newUrl,
      pageLevelLoginHref,
    });
    assert.ok(href !== undefined);
    const loginUrl = new URL(`http://placeholder.local${href}`);
    const next = loginUrl.searchParams.get("next");
    const cashbackUrl = new URL(`http://placeholder.local${next}`);
    assert.equal(
      cashbackUrl.searchParams.get("productUrl"),
      newUrl,
      "server-resolved canonical URL must take priority over pageLevelLoginHref",
    );
  },
);

test(
  "Phase 20H.4b pickEffectiveLoginHref round-trips a Shopee URL with query params and ampersand through the smoke-fix path",
  () => {
    const productUrl =
      "https://shopee.vn/product/1408027998/44812498433?sp_atk=abc&x=1";
    const href = pickEffectiveLoginHref({
      canonicalProductUrl: "",
      lastSubmittedUrl: productUrl,
      pageLevelLoginHref: undefined,
    });
    assert.ok(href !== undefined);
    const loginUrl = new URL(`http://placeholder.local${href}`);
    const next = loginUrl.searchParams.get("next");
    const cashbackUrl = new URL(`http://placeholder.local${next}`);
    assert.equal(
      cashbackUrl.searchParams.get("productUrl"),
      productUrl,
      "ampersand-bearing Shopee URL must round-trip through the smoke-fix path",
    );
  },
);

test(
  "Phase 20H.4b pickEffectiveLoginHref returns undefined when no source URL is available (buyer has not pasted yet)",
  () => {
    assert.equal(
      pickEffectiveLoginHref({
        canonicalProductUrl: "",
        lastSubmittedUrl: "",
        pageLevelLoginHref: undefined,
      }),
      undefined,
    );
  },
);

test(
  "Phase 20H.4b pickEffectiveLoginHref forwards pageLevelLoginHref verbatim when no current URL is set",
  () => {
    const initialUrl =
      "https://shopee.vn/product/INITIAL/1";
    const pageLevelLoginHref = buildLoginHref(initialUrl);
    assert.ok(pageLevelLoginHref !== undefined);
    const href = pickEffectiveLoginHref({
      canonicalProductUrl: "",
      lastSubmittedUrl: "",
      pageLevelLoginHref,
    });
    assert.equal(
      href,
      pageLevelLoginHref,
      "page-level loginHref must be preserved verbatim when the form has no current URL",
    );
  },
);
