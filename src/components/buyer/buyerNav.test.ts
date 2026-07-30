/**
 * Phase 20I.8 -- buyer navigation contract tests.
 *
 * Pure-data assertions for the buyer mobile bottom nav.
 */

import test from "node:test";

import {
  BUYER_ACCOUNT_HREF,
  BUYER_DEALS_HREF,
  buyerNavItems,
  isBuyerNavItemActive,
  resolveActiveBuyerNavItem,
} from "./buyerNav";

const EXPECTED_LABELS = Object.freeze([
  "Trang chủ",
  "Ưu đãi",
  "Hoàn tiền",
  "Đơn hàng",
  "Tài khoản",
]);

const EXPECTED_HREFS = Object.freeze([
  "/app",
  "/app/offers",
  "/app/cashback",
  "/app/orders",
  "/app/profile",
]);

test("buyerNavItems is exactly five items", () => {
  if (buyerNavItems.length !== 5) {
    throw new Error(
      `Expected exactly 5 buyer nav items, received ${buyerNavItems.length}`,
    );
  }
});

test("buyerNavItems uses the canonical Vietnamese labels", () => {
  for (let i = 0; i < EXPECTED_LABELS.length; i += 1) {
    const expected = EXPECTED_LABELS[i];
    const actual = buyerNavItems[i]?.label;
    if (actual !== expected) {
      throw new Error(
        `buyerNavItems[${i}].label expected '${expected}', received '${String(actual)}'`,
      );
    }
  }
});
test("buyerNavItems uses the canonical hrefs", () => {
  for (let i = 0; i < EXPECTED_HREFS.length; i += 1) {
    const expected = EXPECTED_HREFS[i];
    const actual = buyerNavItems[i]?.href;
    if (actual !== expected) {
      throw new Error(
        `buyerNavItems[${i}].href expected '${expected}', received '${String(actual)}'`,
      );
    }
  }
});

test("buyerNavItems has no duplicate hrefs", () => {
  const seen = new Set<string>();
  for (const item of buyerNavItems) {
    if (seen.has(item.href)) {
      throw new Error(
        `Duplicate href in buyerNavItems: '${item.href}'`,
      );
    }
    seen.add(item.href);
  }
});

test("buyerNavItems does not link to /app/admin", () => {
  for (const item of buyerNavItems) {
    if (item.href.startsWith("/app/admin")) {
      throw new Error(
        `Buyer nav must not link to admin routes, found '${item.href}'`,
      );
    }
  }
});

test("buyerNavItems keeps every destination inside /app/**", () => {
  for (const item of buyerNavItems) {
    if (item.href !== "/app" && !item.href.startsWith("/app/")) {
      throw new Error(
        `Buyer nav href '${item.href}' must stay inside /app/**`,
      );
    }
  }
});

test("buyerNavItems labels contain no forbidden guarantee words", () => {
  const forbidden = [
    "đảm bảo",
    "chắc chắn",
    "cam kết",
    "mua là có hoàn tiền",
    "hoàn tiền chắc chắn",
    "guaranteed",
  ];
  for (const item of buyerNavItems) {
    const lower = item.label.toLowerCase();
    for (const word of forbidden) {
      if (lower.includes(word.toLowerCase())) {
        throw new Error(
          `Forbidden phrase '${word}' in buyer nav label '${item.label}'`,
        );
      }
    }
  }
});

test("buyerNavItems aria labels are non-empty Vietnamese strings", () => {
  for (const item of buyerNavItems) {
    if (typeof item.ariaLabel !== "string" || item.ariaLabel.length === 0) {
      throw new Error(
        `Buyer nav item '${item.id}' must carry a Vietnamese aria-label`,
      );
    }
  }
});

test("isBuyerNavItemActive matches exact routes", () => {
  const home = buyerNavItems.find((item) => item.id === "home");
  if (!home) throw new Error("home item missing");
  if (!isBuyerNavItemActive(home, "/app")) {
    throw new Error("home item must be active for exact /app");
  }
  if (isBuyerNavItemActive(home, "/app/cashback")) {
    throw new Error("home item must not be active for /app/cashback");
  }
});

test("isBuyerNavItemActive matches child routes", () => {
  const offers = buyerNavItems.find((item) => item.id === "deals");
  if (!offers) throw new Error("deals item missing");
  if (!isBuyerNavItemActive(offers, "/app/offers")) {
    throw new Error("deals item must be active for /app/offers");
  }
  if (!isBuyerNavItemActive(offers, "/app/offers/abc-123")) {
    throw new Error("deals item must be active for /app/offers/<id>");
  }
  if (isBuyerNavItemActive(offers, "/app/cashback")) {
    throw new Error("deals item must not be active for /app/cashback");
  }
});

test("resolveActiveBuyerNavItem returns null for unrelated routes", () => {
  const active = resolveActiveBuyerNavItem("/ma-giam-gia");
  if (active !== null) {
    throw new Error(`Expected null for unrelated route, received '${active.id}'`);
  }
});

test("BUYER_ACCOUNT_HREF and BUYER_DEALS_HREF point to canonical surfaces", () => {
  if (BUYER_ACCOUNT_HREF !== "/app/profile") {
    throw new Error(`BUYER_ACCOUNT_HREF must be /app/profile, received '${BUYER_ACCOUNT_HREF}'`);
  }
  if (BUYER_DEALS_HREF !== "/app/offers") {
    throw new Error(`BUYER_DEALS_HREF must be /app/offers, received '${BUYER_DEALS_HREF}'`);
  }
});

test("Hoàn tiền aria-label uses natural Vietnamese (no 'Mởi mua' typo)", () => {
  const cashback = buyerNavItems.find((item) => item.id === "cashback");
  if (!cashback) throw new Error("cashback item missing");
  if (cashback.ariaLabel.includes("Mởi mua")) {
    throw new Error(`Hoàn tiền aria-label must not contain the 'Mởi mua' typo, received '${cashback.ariaLabel}'`);
  }
  if (cashback.ariaLabel.trim().length === 0) {
    throw new Error("Hoàn tiền aria-label must be non-empty");
  }
});

test("/app/deals alias activates the deals item", () => {
  const deals = buyerNavItems.find((item) => item.id === "deals");
  if (!deals) throw new Error("deals item missing");
  if (!isBuyerNavItemActive(deals, "/app/deals")) {
    throw new Error("deals item must be active for /app/deals alias");
  }
  if (!isBuyerNavItemActive(deals, "/app/deals/sub")) {
    throw new Error("deals item must be active for /app/deals/<sub>");
  }
});

test("/app/account alias activates the account item", () => {
  const account = buyerNavItems.find((item) => item.id === "account");
  if (!account) throw new Error("account item missing");
  if (!isBuyerNavItemActive(account, "/app/account")) {
    throw new Error("account item must be active for /app/account alias");
  }
  if (!isBuyerNavItemActive(account, "/app/profile")) {
    throw new Error("account item must be active for canonical /app/profile");
  }
  if (!isBuyerNavItemActive(account, "/app/payouts")) {
    throw new Error("account item must be active for /app/payouts");
  }
  if (!isBuyerNavItemActive(account, "/app/payouts/request-id")) {
    throw new Error("account item must be active for payout detail routes");
  }
});
