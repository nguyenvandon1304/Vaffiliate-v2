import type {
  ShopeeProductPreviewAvailableQuote,
  ShopeeProductPreviewMetadataView,
} from "@/types/cashback";

/**
 * Phase 20H.3g -- shared fixtures for the Shopee product preview card
 * tests.
 *
 * Tests import these constants so the price, image, product name, and
 * quote math stay in lock-step across the available and unavailable
 * suites. Adding a new field to the view is a single-place change.
 */

export const FIXTURE_PRODUCT: ShopeeProductPreviewMetadataView = {
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

export const FIXTURE_AVAILABLE: ShopeeProductPreviewAvailableQuote = {
  status: "available",
  product: FIXTURE_PRODUCT,
  cashbackShareBps: 6000,
  commissionRateBps: 2000,
  estimatedCashbackVnd: 19_380,
  calculatedAt: "2026-07-05T00:00:00.000Z",
  isEstimate: true,
};
