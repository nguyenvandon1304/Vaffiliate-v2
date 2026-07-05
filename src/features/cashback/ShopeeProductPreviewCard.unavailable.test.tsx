import test from "node:test";
import assert from "node:assert/strict";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import ShopeeProductPreviewCardView from "./ShopeeProductPreviewCardView";
import type {
  ShopeeProductPreviewMetadataView,
  ShopeeProductPreviewUnavailableQuote,
} from "@/types/cashback";
import {
  FIXTURE_AVAILABLE,
  FIXTURE_PRODUCT,
} from "./ShopeeProductPreviewCard.fixtures";

const STUB_CTA: ReactNode = (
  <button type="button">Mua ngay nhận hoàn tiền</button>
);

function makeUnavailable(
  reason: ShopeeProductPreviewUnavailableQuote["reason"],
  message: string,
  product: ShopeeProductPreviewMetadataView = FIXTURE_PRODUCT,
): ShopeeProductPreviewUnavailableQuote {
  return {
    status: "unavailable",
    product,
    reason,
    message,
  };
}

// ─── Phase 20H.3g: unavailable card body ──────────────────────────────

test(
  "Phase 20H.3g unavailable-quote card does NOT render the cashback amount",
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
  "Phase 20H.3g unavailable-quote card does NOT mention 60% anywhere",
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
  "Phase 20H.3g unavailable-quote card preserves the cashback-not-guaranteed copy",
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
  "Phase 20H.3g unavailable-quote card still renders the price row when product price exists",
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
    // The product metadata must remain scannable so the buyer can
    // compare the recognized price to other offers.
    assert.match(html, /Giá tham khảo từ Shopee/);
    assert.match(html, /161\.500\s*đ/);
  },
);

test(
  "Phase 20H.3g unavailable-quote card renders the safe unavailable copy alongside the price row",
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
    assert.match(html, /Đã nhận diện sản phẩm/);
    assert.match(html, /Hoàn tiền không được đảm bảo/);
    assert.match(html, /Giá tham khảo từ Shopee/);
  },
);

// ─── Phase 20H.3g invariants: no leak, no literal u-escapes ────────────

test(
  "Phase 20H.3g unavailable-quote card does NOT leak internal identifiers",
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
  "Phase 20H.3g unavailable-quote card does NOT render literal backslash-u escapes",
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
    assert.ok(
      !html.includes("\\u"),
      `unavailable-quote card must not render literal backslash-u escapes; got: ${html.slice(0, 400)}`,
    );
  },
);

test(
  "Phase 20H.3g unavailable-quote card still renders the product metadata + CTA",
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

// ─── Phase 20H.3g missing-price safety ────────────────────────────────

test(
  "Phase 20H.3g unavailable-quote card omits the price row when price is missing/invalid",
  () => {
    const html = renderToStaticMarkup(
      <ShopeeProductPreviewCardView
        quote={makeUnavailable(
          "no_active_offer",
          "Hiện chưa có chương trình hoàn tiền Shopee đang hoạt động.",
          {
            ...FIXTURE_PRODUCT,
            priceVnd: 0 as unknown as number,
          },
        )}
        ctaSlot={STUB_CTA}
      />,
    );
    // Price row must be absent -- the spec forbids "0 đ" as the
    // formatted price value. We assert against the full token "0 đ"
    // surrounded by HTML markup so we don't accidentally match the
    // tail of an unrelated amount (e.g. "1.000.000 đ").
    assert.ok(!html.includes("Giá tham khảo từ Shopee"));
    assert.ok(
      !/>\s*0\s*đ\s*</.test(html),
      "formatted price must never render as '0 đ'",
    );
    assert.match(html, /Hoàn tiền không được đảm bảo/);
    assert.match(html, /Mua ngay nhận hoàn tiền/);
  },
);

test(
  "Phase 20H.3g available-quote card never renders '0 đ', 'undefined', or 'NaN'",
  () => {
    // Defensive: even with malformed input the formatter must omit
    // the price row and never leak unsafe strings into the markup.
    const html = renderToStaticMarkup(
      <ShopeeProductPreviewCardView
        quote={{
          ...FIXTURE_AVAILABLE,
          product: {
            ...FIXTURE_PRODUCT,
            priceVnd: 0 as unknown as number,
          },
        }}
        ctaSlot={STUB_CTA}
      />,
    );
    assert.ok(
      !/>\s*0\s*đ\s*</.test(html),
      "formatted price must never render as '0 đ'",
    );
    assert.ok(!html.includes("undefined"));
    assert.ok(!html.includes("NaN"));
  },
);
