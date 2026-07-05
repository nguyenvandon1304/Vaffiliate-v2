import test from "node:test";
import assert from "node:assert/strict";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import ShopeeProductPreviewCardView from "./ShopeeProductPreviewCardView";
import type {
  ShopeeProductPreviewMetadataView,
  ShopeeProductPreviewUnavailableQuote,
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

const STUB_CTA: ReactNode = (
  <button type="button">Mua ngay nhận hoàn tiền</button>
);

function makeUnavailable(
  reason: ShopeeProductPreviewUnavailableQuote["reason"],
  message: string,
): ShopeeProductPreviewUnavailableQuote {
  return {
    status: "unavailable",
    product: FIXTURE_PRODUCT,
    reason,
    message,
  };
}

test(
  "Phase 20H.3d unavailable-quote card does NOT render the amount block",
  () => {
    const html = renderToStaticMarkup(
      <ShopeeProductPreviewCardView
        quote={makeUnavailable(
          "no_active_offer",
          "Hiện chưa có chương trình hoàn tiền Shopee đang hoạt động.",
        )}
        ctaSlot={STUB_CTA}
      />,
    );
    assert.ok(!html.includes("19.380"));
    assert.ok(!html.includes("Hoàn tiền dự kiến"));
  },
);

test(
  "Phase 20H.3d unavailable-quote card does NOT mention 60% anywhere",
  () => {
    const html = renderToStaticMarkup(
      <ShopeeProductPreviewCardView
        quote={makeUnavailable(
          "commission_rate_unavailable",
          "Chưa xác định được mức hoa hồng cho sản phẩm này.",
        )}
        ctaSlot={STUB_CTA}
      />,
    );
    assert.ok(!html.includes("60%"));
    assert.ok(!html.includes("hoa hồng Shopee"));
  },
);

test(
  "Phase 20H.3d unavailable-quote card preserves the cashback-not-guaranteed copy",
  () => {
    const html = renderToStaticMarkup(
      <ShopeeProductPreviewCardView
        quote={makeUnavailable(
          "no_active_offer",
          "Hiện chưa có chương trình hoàn tiền Shopee đang hoạt động.",
        )}
        ctaSlot={STUB_CTA}
      />,
    );
    assert.match(html, /Hoàn tiền không được đảm bảo/);
  },
);

test(
  "Phase 20H.3d unavailable-quote card does NOT leak internal identifiers",
  () => {
    const html = renderToStaticMarkup(
      <ShopeeProductPreviewCardView
        quote={makeUnavailable(
          "eligibility_unknown",
          "Đã nhận diện sản phẩm nhưng chưa thể xác định mức hoàn tiền.",
        )}
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
      "Error:",
      "stack",
    ]) {
      assert.ok(
        !html.includes(forbidden),
        `unavailable-quote card must not leak '${forbidden}'`,
      );
    }
  },
);

test(
  "Phase 20H.3d unavailable-quote card still renders the product metadata + CTA",
  () => {
    const html = renderToStaticMarkup(
      <ShopeeProductPreviewCardView
        quote={makeUnavailable(
          "no_active_offer",
          "Hiện chưa có chương trình hoàn tiền Shopee đang hoạt động.",
        )}
        ctaSlot={STUB_CTA}
      />,
    );
    // The metadata header must still surface so the buyer sees what
    // product was recognized.
    assert.match(html, /Sample Shopee product/);
    assert.match(html, /Sample shop/);
    // The CTA is still rendered.
    assert.match(html, /Mua ngay nhận hoàn tiền/);
  },
);