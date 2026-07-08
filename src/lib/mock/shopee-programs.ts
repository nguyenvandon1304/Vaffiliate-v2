/**
 * Phase 20H.7a -- static list of future Shopee program cards.
 *
 * These cards are placeholders for traffic-source partnership programs
 * (Facebook x Shopee, Instagram x Shopee, YouTube x Shopee) and any
 * other future merchant-deal shape we are not yet activating.
 *
 * Critical invariants (enforced by the buyer purchase flow AND the
 * popular programs UI):
 *
 *   1. These cards are display-only. They MUST NOT influence the
 *      buyer purchase flow. The action never reads this file.
 *   2. campaignId and offerId are always null here. The UI renders
 *      them with aria-disabled=true and never attaches them to any
 *      tracking link.
 *   3. Copy never promises a guaranteed cashback or voucher. Every
 *      card carries an honest future-state note.
 *
 * The shape is intentionally narrow so a future admin portal can
 * persist these to a database table without changing the UI surface.
 * Until then, editing this file is the source of truth for future
 * card placement on the public cashback page.
 */

import type { ShopeeFutureProgramCardData } from "@/services/shopee-programs.types";

export const FUTURE_SHOPEE_PROGRAM_CARDS: ReadonlyArray<ShopeeFutureProgramCardData> = [
  {
    id: "future-facebook-x-shopee",
    platform: "shopee",
    programType: "traffic_source_campaign",
    title: "Facebook x Shopee",
    subtitle:
      "Chương trình hợp tác giữa Vaffiliate và các trang Facebook quảng bá sản phẩm Shopee.",
    badge: "Sắp hỗ trợ",
    category: "Mạng xã hội",
    displayOrderOffset: 0,
    safeNote:
      "Có thể áp dụng theo điều kiện Shopee khi chương trình hoạt động.",
  },
  {
    id: "future-instagram-x-shopee",
    platform: "shopee",
    programType: "traffic_source_campaign",
    title: "Instagram x Shopee",
    subtitle:
      "Chương trình hợp tác giữa Vaffiliate và các trang Instagram quảng bá sản phẩm Shopee.",
    badge: "Sắp hỗ trợ",
    category: "Mạng xã hội",
    displayOrderOffset: 1,
    safeNote: "Chưa áp dụng cho giao dịch hiện tại.",
  },
  {
    id: "future-youtube-x-shopee",
    platform: "shopee",
    programType: "traffic_source_campaign",
    title: "YouTube x Shopee",
    subtitle:
      "Chương trình hợp tác giữa Vaffiliate và các kênh YouTube quảng bá sản phẩm Shopee.",
    badge: "Sắp hỗ trợ",
    category: "Mạng xã hội",
    displayOrderOffset: 2,
    safeNote: "Chưa áp dụng cho giao dịch hiện tại.",
  },
];
