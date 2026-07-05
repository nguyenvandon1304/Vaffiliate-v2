import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import ShopeeProductPreviewCardView from "./ShopeeProductPreviewCardView";
import type {
  ShopeeProductPreviewAvailableQuote,
  ShopeeProductPreviewMetadataView,
} from "@/types/cashback";

const FIXTURE_PRODUCT: ShopeeProductPreviewMetadataView = {
  platform: "shopee",
  productUrl:
    "https://shopee.vn/product/1408027998/44812498433",
  productName: "Sample Shopee product",
  shopName: "Sample shop",
  imageUrl: "https://placehold.co/600x600/png",
  priceVnd: 161_500,
  availability: "available",
  fetchedAt: "2026-07-05T00:00:00.000Z",
};

const FIXTURE_AVAILABLE: ShopeeProductPreviewAvailableQuote = {
  status: "available",
  product: FIXTURE_PRODUCT,
  cashbackShareBps: 6000,
  commissionRateBps: 2000,
  estimatedCashbackVnd: 19_380,
  calculatedAt: "2026-07-05T00:00:00.000Z",
  isEstimate: true,
};

const STUB_CTA = (
  <button type="button">Mua ngay nhận hoàn tiền</button>
);

test(
  "Phase 20H.3d available-quote card renders the canonical amount",
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
  "Phase 20H.3d available-quote card renders the 'Hoàn tiền dự kiến' label",
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
  "Phase 20H.3d available-quote card renders the dynamic share copy from cashbackShareBps",
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
  "Phase 20H.3d available-quote card reflects a different cashbackShareBps (45%)",
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
  "Phase 20H.3d available-quote card shows the reconciliation note",
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
  "Phase 20H.3d available-quote card does NOT imply 60% of the full product price",
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
  "Phase 20H.3d available-quote card keeps the CTA label",
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

test(
  "Phase 20H.3d available-quote card does NOT leak internal identifiers",
  () => {
    const html = renderToStaticMarkup(
      <ShopeeProductPreviewCardView
        quote={FIXTURE_AVAILABLE}
        ctaSlot={STUB_CTA}
      />,
    );
    // Internal identifiers must never appear in buyer-facing markup.
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