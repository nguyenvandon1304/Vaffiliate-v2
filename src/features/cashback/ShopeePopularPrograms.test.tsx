import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import ShopeePopularPrograms from "./ShopeePopularPrograms";

import type { ShopeeProgramCard } from "@/services/shopee-programs.types";

const ACTIVE_CARD: ShopeeProgramCard = {
  kind: "active",
  id: "active-off-aaa",
  platform: "shopee",
  programType: "generic_affiliate",
  title: "Shopee Cashback cơ bản",
  subtitle:
    "Áp dụng khi Shopee ghi nhận hoa hồng cho đơn hàng.",
  badge: "Hoàn tiền dự kiến",
  category: "Hoàn tiền chung",
  displayOrder: 0,
  campaignId: "cmp-aaa",
  offerId: "off-aaa",
};

const FACEBOOK_CARD: ShopeeProgramCard = {
  kind: "coming_soon",
  id: "future-facebook-x-shopee",
  platform: "shopee",
  programType: "traffic_source_campaign",
  title: "Facebook x Shopee",
  subtitle:
    "Chương trình hợp tác giữa Vaffiliate và các trang Facebook quảng bá sản phẩm Shopee.",
  badge: "Sắp hỗ trợ",
  category: "Mạng xã hội",
  displayOrder: 1,
  campaignId: null,
  offerId: null,
  safeNote:
    "Có thể áp dụng theo điều kiện Shopee khi chương trình hoạt động.",
};

const INSTAGRAM_CARD: ShopeeProgramCard = {
  ...FACEBOOK_CARD,
  id: "future-instagram-x-shopee",
  title: "Instagram x Shopee",
  displayOrder: 2,
  safeNote: "Chưa áp dụng cho giao dịch hiện tại.",
};

const YOUTUBE_CARD: ShopeeProgramCard = {
  ...FACEBOOK_CARD,
  id: "future-youtube-x-shopee",
  title: "YouTube x Shopee",
  displayOrder: 3,
  safeNote: "Chưa áp dụng cho giao dịch hiện tại.",
};

const FULL_CARDS: ReadonlyArray<ShopeeProgramCard> = [
  ACTIVE_CARD,
  FACEBOOK_CARD,
  INSTAGRAM_CARD,
  YOUTUBE_CARD,
];

// Internal identifier substrings the buyer-facing DOM MUST NOT contain.
// Including UUID-shaped substrings to catch any leaked DB IDs from
// raw object property reads.
const FORBIDDEN_INTERNAL_TOKENS: ReadonlyArray<string> = [
  "networkSubId",
  "network_sub_id",
  "clickId",
  "click_id",
  "purchaseIntentId",
  "purchase_intent_id",
  "trackingLinkId",
  "tracking_link_id",
  "campaignId",
  "campaign_id",
  "offerId",
  "offer_id",
  "shortCode",
  "short_code",
  "trackingPath",
  "tracking_path",
  "publisherId",
  "publisher_id",
  "an_redir",
  "an-redir",
];

// Marketing claim substrings the buyer-facing copy MUST NOT contain.
const FORBIDDEN_MARKETING_TOKENS: ReadonlyArray<string> = [
  "Chắc chắn",
  "Chắc chắn nhận",
  "hoàn tiền theo giá",
  "guaranteed",
  "100% hoàn tiền",
];

test("ShopeePopularPrograms renders the section heading and grid when cards exist", () => {
  const html = renderToStaticMarkup(
    <ShopeePopularPrograms cards={FULL_CARDS} />,
  );

  assert.ok(html.includes("Chương trình phổ biến"));
  assert.ok(html.includes("shopee-popular-programs-grid"));
});

test("ShopeePopularPrograms renders 1 active card and 3 coming-soon cards", () => {
  const html = renderToStaticMarkup(
    <ShopeePopularPrograms cards={FULL_CARDS} />,
  );

  const activeMatches = html.match(/data-testid="program-card-active"/g) ?? [];
  const comingSoonMatches =
    html.match(/data-testid="program-card-coming-soon"/g) ?? [];

  assert.equal(activeMatches.length, 1);
  assert.equal(comingSoonMatches.length, 3);
});

test("ShopeePopularPrograms renders coming-soon cards with aria-disabled=true", () => {
  const html = renderToStaticMarkup(
    <ShopeePopularPrograms cards={[FACEBOOK_CARD]} />,
  );

  // The coming-soon card is aria-disabled so AT users learn the
  // card is not actionable.
  assert.ok(html.includes('aria-disabled="true"'));
});

test("ShopeePopularPrograms active cards do not have aria-disabled", () => {
  const html = renderToStaticMarkup(
    <ShopeePopularPrograms cards={[ACTIVE_CARD]} />,
  );

  assert.ok(!html.includes('aria-disabled="true"'));
});

test("ShopeePopularPrograms returns null when given an empty list", () => {
  const html = renderToStaticMarkup(
    <ShopeePopularPrograms cards={[]} />,
  );

  assert.equal(html, "");
});

test("ShopeePopularPrograms never leaks internal identifier tokens into the DOM", () => {
  const html = renderToStaticMarkup(
    <ShopeePopularPrograms cards={FULL_CARDS} />,
  );

  for (const token of FORBIDDEN_INTERNAL_TOKENS) {
    assert.ok(
      !html.includes(token),
      `rendered HTML must not contain the internal token "${token}"`,
    );
  }
});

test("ShopeePopularPrograms never renders a UUID-shaped string into the DOM", () => {
  const html = renderToStaticMarkup(
    <ShopeePopularPrograms cards={FULL_CARDS} />,
  );

  // 36-char UUID pattern, case-insensitive.
  const uuidPattern =
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
  assert.equal(uuidPattern.test(html), false);
});

test("ShopeePopularPrograms active card copy never promises guaranteed cashback or voucher", () => {
  const html = renderToStaticMarkup(
    <ShopeePopularPrograms cards={[ACTIVE_CARD]} />,
  );

  for (const token of FORBIDDEN_MARKETING_TOKENS) {
    assert.ok(
      !html.includes(token),
      `active card copy must not contain "${token}"`,
    );
  }
});

test("ShopeePopularPrograms coming-soon card copy never promises guaranteed cashback", () => {
  const html = renderToStaticMarkup(
    <ShopeePopularPrograms cards={[FACEBOOK_CARD, INSTAGRAM_CARD, YOUTUBE_CARD]} />,
  );

  for (const token of FORBIDDEN_MARKETING_TOKENS) {
    assert.ok(
      !html.includes(token),
      `coming-soon card copy must not contain "${token}"`,
    );
  }
});

test("ShopeePopularPrograms renders the safeNote for coming-soon cards", () => {
  const html = renderToStaticMarkup(
    <ShopeePopularPrograms cards={[FACEBOOK_CARD]} />,
  );

  assert.ok(
    html.includes("Có thể áp dụng theo điều kiện Shopee khi chương trình hoạt động"),
  );
});

test("ShopeePopularPrograms renders the Vietnamese trust copy under the heading", () => {
  const html = renderToStaticMarkup(
    <ShopeePopularPrograms cards={FULL_CARDS} />,
  );

  assert.ok(
    html.includes("Hoàn tiền áp dụng khi Shopee ghi nhận hoa hồng"),
  );
});

test("ShopeePopularPrograms renders cards in the order it receives them", () => {
  // The component renders cards in array order without re-sorting.
  // The service layer (listShopeeProgramCardsAsync) is responsible
  // for sorting by displayOrder before passing the array in. This
  // test asserts that contract: pass a deliberately shuffled list
  // and confirm the rendered HTML preserves that order.
  const reordered: ReadonlyArray<ShopeeProgramCard> = [
    YOUTUBE_CARD,
    ACTIVE_CARD,
    INSTAGRAM_CARD,
    FACEBOOK_CARD,
  ];

  const html = renderToStaticMarkup(
    <ShopeePopularPrograms cards={reordered} />,
  );

  // Extract the first title that appears in the HTML.
  const titlePositions = [
    { title: ACTIVE_CARD.title, index: html.indexOf(ACTIVE_CARD.title) },
    { title: FACEBOOK_CARD.title, index: html.indexOf(FACEBOOK_CARD.title) },
    { title: INSTAGRAM_CARD.title, index: html.indexOf(INSTAGRAM_CARD.title) },
    { title: YOUTUBE_CARD.title, index: html.indexOf(YOUTUBE_CARD.title) },
  ];

  for (const entry of titlePositions) {
    assert.ok(
      entry.index > -1,
      `expected to find card title "${entry.title}" in rendered HTML`,
    );
  }

  // In the reordered input array: YOUTUBE is index 0, ACTIVE is 1,
  // INSTAGRAM is 2, FACEBOOK is 3. The rendered HTML must reflect
  // that exact order, so YOUTUBE < ACTIVE < INSTAGRAM < FACEBOOK.
  const youtubeIndex = html.indexOf(YOUTUBE_CARD.title);
  const activeIndex = html.indexOf(ACTIVE_CARD.title);
  const instagramIndex = html.indexOf(INSTAGRAM_CARD.title);
  const facebookIndex = html.indexOf(FACEBOOK_CARD.title);

  assert.ok(youtubeIndex < activeIndex);
  assert.ok(activeIndex < instagramIndex);
  assert.ok(instagramIndex < facebookIndex);
});
