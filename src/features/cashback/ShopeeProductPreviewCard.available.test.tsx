import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import ShopeeProductPreviewCardView from "./ShopeeProductPreviewCardView";
import {
  FIXTURE_AVAILABLE,
  FIXTURE_PRODUCT,
} from "./ShopeeProductPreviewCard.fixtures";

const STUB_CTA = (
  <button type="button">Mua ngay nhận hoàn tiền</button>
);

// ─── Phase 20H.3g hierarchy: price row + cashback box + note + CTA ──────

test(
  "Phase 20H.3g available-quote card renders the price row label 'Giá tham khảo từ Shopee'",
  () => {
    const html = renderToStaticMarkup(
      <ShopeeProductPreviewCardView
        quote={FIXTURE_AVAILABLE}
        ctaSlot={STUB_CTA}
      />,
    );
    assert.match(html, /Giá tham khảo từ Shopee/);
  },
);

test(
  "Phase 20H.3g available-quote card renders the formatted product price",
  () => {
    const html = renderToStaticMarkup(
      <ShopeeProductPreviewCardView
        quote={FIXTURE_AVAILABLE}
        ctaSlot={STUB_CTA}
      />,
    );
    assert.match(html, /161\.500\s*đ/);
  },
);

test(
  "Phase 20H.3g available-quote card renders the cashback label",
  () => {
    const html = renderToStaticMarkup(
      <ShopeeProductPreviewCardView
        quote={FIXTURE_AVAILABLE}
        ctaSlot={STUB_CTA}
      />,
    );
    assert.match(html, /Hoàn tiền dự kiến/);
  },
);

test(
  "Phase 20H.3g available-quote card renders the canonical cashback amount",
  () => {
    const html = renderToStaticMarkup(
      <ShopeeProductPreviewCardView
        quote={FIXTURE_AVAILABLE}
        ctaSlot={STUB_CTA}
      />,
    );
    assert.match(html, /19\.380\s*đ/);
  },
);

test(
  "Phase 20H.3g available-quote card renders the dynamic share copy from cashbackShareBps",
  () => {
    const html = renderToStaticMarkup(
      <ShopeeProductPreviewCardView
        quote={FIXTURE_AVAILABLE}
        ctaSlot={STUB_CTA}
      />,
    );
    assert.match(html, /Vaffiliate hoàn lại 60% hoa hồng Shopee/);
  },
);

test(
  "Phase 20H.3g available-quote card reflects a different cashbackShareBps (45%)",
  () => {
    const html = renderToStaticMarkup(
      <ShopeeProductPreviewCardView
        quote={{
          ...FIXTURE_AVAILABLE,
          cashbackShareBps: 4500,
        }}
        ctaSlot={STUB_CTA}
      />,
    );
    assert.match(html, /Vaffiliate hoàn lại 45% hoa hồng Shopee/);
    assert.doesNotMatch(html, /60%/);
  },
);

test(
  "Phase 20H.3g available-quote card shows the reconciliation note",
  () => {
    const html = renderToStaticMarkup(
      <ShopeeProductPreviewCardView
        quote={FIXTURE_AVAILABLE}
        ctaSlot={STUB_CTA}
      />,
    );
    assert.match(
      html,
      /Số tiền hoàn lại được tính dựa vào hoa hồng Shopee xác nhận sau khi Shopee đối soát hoàn tất/,
    );
  },
);

test(
  "Phase 20H.3g available-quote card does NOT imply 60% of the full product price",
  () => {
    const html = renderToStaticMarkup(
      <ShopeeProductPreviewCardView
        quote={FIXTURE_AVAILABLE}
        ctaSlot={STUB_CTA}
      />,
    );
    const amount = 0.6 * 161_500;
    // The wrong-but-tempting figure: 60% of product price = 96.900 VND
    // (or a rounded subset). The view must never emit it; the estimate
    // is computed from the Shopee commission, never from the product
    // price.
    assert.doesNotMatch(html, /96\.900/);
    assert.ok(amount !== 19_380, "fixture sanity: 60% of price must not equal user cashback");
  },
);

test(
  "Phase 20H.3g available-quote card keeps the CTA label",
  () => {
    const html = renderToStaticMarkup(
      <ShopeeProductPreviewCardView
        quote={FIXTURE_AVAILABLE}
        ctaSlot={STUB_CTA}
      />,
    );
    assert.match(html, /Mua ngay nhận hoàn tiền/);
  },
);

// ─── Phase 20H.3g ordering: price appears before cashback in the DOM ─────

test(
  "Phase 20H.3g available-quote card renders the price row BEFORE the cashback label",
  () => {
    const html = renderToStaticMarkup(
      <ShopeeProductPreviewCardView
        quote={FIXTURE_AVAILABLE}
        ctaSlot={STUB_CTA}
      />,
    );
    const priceIndex = html.indexOf("Giá tham khảo từ Shopee");
    const cashbackIndex = html.indexOf("Hoàn tiền dự kiến");
    assert.ok(
      priceIndex >= 0 && cashbackIndex > priceIndex,
      `price label must appear before cashback label; price=${priceIndex}, cashback=${cashbackIndex}`,
    );
  },
);

test(
  "Phase 20H.3g available-quote card keeps the CTA AFTER the cashback block",
  () => {
    const html = renderToStaticMarkup(
      <ShopeeProductPreviewCardView
        quote={FIXTURE_AVAILABLE}
        ctaSlot={STUB_CTA}
      />,
    );
    const cashbackIndex = html.indexOf("Hoàn tiền dự kiến");
    const ctaIndex = html.indexOf("Mua ngay nhận hoàn tiền");
    assert.ok(
      cashbackIndex >= 0 && ctaIndex > cashbackIndex,
      `CTA must appear after the cashback block; cashback=${cashbackIndex}, cta=${ctaIndex}`,
    );
  },
);

// ─── Phase 20H.3g sold-badge: omitted when salesCount is unavailable ───

test(
  "Phase 20H.3g available-quote card omits the sold badge when salesCount is not provided",
  () => {
    const html = renderToStaticMarkup(
      <ShopeeProductPreviewCardView
        quote={FIXTURE_AVAILABLE}
        ctaSlot={STUB_CTA}
      />,
    );
    assert.ok(
      !html.includes("Đã bán"),
      "sold badge must not render when salesCount is unavailable",
    );
  },
);

test(
  "Phase 20H.3g available-quote card renders the sold badge when salesCount is provided",
  () => {
    const html = renderToStaticMarkup(
      <ShopeeProductPreviewCardView
        quote={{
          ...FIXTURE_AVAILABLE,
          product: { ...FIXTURE_PRODUCT, salesCount: 1234 },
        }}
        ctaSlot={STUB_CTA}
      />,
    );
    assert.match(html, /Đã bán 1\.234/);
  },
);

// ─── Phase 20H.3g invariants: no leak, no literal u-escapes ────────────

test(
  "Phase 20H.3g available-quote card does NOT leak internal identifiers",
  () => {
    const html = renderToStaticMarkup(
      <ShopeeProductPreviewCardView
        quote={FIXTURE_AVAILABLE}
        ctaSlot={STUB_CTA}
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
      "141-2-20H.3d-canonical-fixture-product",
    ]) {
      assert.ok(
        !html.includes(forbidden),
        `available-quote card must not leak '${forbidden}'`,
      );
    }
  },
);

test(
  "Phase 20H.3g available-quote card does NOT render literal backslash-u escapes",
  () => {
    const html = renderToStaticMarkup(
      <ShopeeProductPreviewCardView
        quote={FIXTURE_AVAILABLE}
        ctaSlot={STUB_CTA}
      />,
    );
    assert.ok(
      !html.includes("\\u"),
      `available-quote card must not render literal backslash-u escapes; got: ${html.slice(0, 400)}`,
    );
  },
);
