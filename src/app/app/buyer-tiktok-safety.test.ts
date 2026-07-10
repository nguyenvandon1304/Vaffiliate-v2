/**
 * Phase 20I.8 follow-up safety -- TikTok Shop must not appear active.
 *
 * Static-source test asserting that the authenticated buyer pages
 * /app/offers and /app/cashback do NOT claim TikTok Shop is active.
 *
 * TikTok Shop is planned AFTER Shopee. Until tracking +
 * reconciliation for TikTok Shop are production-ready, buyer-facing
 * copy must mark TikTok Shop as upcoming / sắp hỗ trợ / chưa hỗ trợ
 * only. Concretely the page source must NOT contain:
 *
 *   - "Shopee và TikTok Shop" (the prior "both are active" claim)
 *   - "Tiền hoàn TikTok Shop" (a TikTok cashback stat)
 *   - "Khám phá ... từ Shopee và TikTok Shop" (active hero eyebrow)
 *   - "Vaffiliate hiện hỗ trợ ... qua Shopee và TikTok Shop"
 *     (active hero description)
 *
 * The page source MUST contain TikTok Shop inside the "Sắp hỗ trợ"
 * (upcoming) chip list. We assert that the page renders TikTok Shop
 * at least once and that at least one rendering location uses the
 * upcoming label.
 */

import test from "node:test";
import { readFileSync, existsSync } from "node:fs";

const OFFERS_PATH = "src/app/app/offers/page.tsx";
const CASHBACK_PATH = "src/app/app/cashback/page.tsx";
const APP_HOME_PATH = "src/app/app/page.tsx";
const APP_ORDERS_PATH = "src/app/app/orders/page.tsx";
const APP_PROFILE_PATH = "src/app/app/profile/page.tsx";
const PROFILE_MANAGEMENT_PANEL_PATH = "src/features/profile/ProfileManagementPanel.tsx";
const PROFILE_ACTIONS_PATH = "src/app/app/profile/actions.ts";
const CONSUMER_RECENT_ORDERS_PATH = "src/features/dashboard/ConsumerRecentOrders.tsx";
const RECENT_ORDERS_TABLE_PATH = "src/features/dashboard/RecentOrdersTable.tsx";
const ORDERS_TABLE_PATH = "src/features/orders/OrdersTable.tsx";
const ORDERS_FILTER_PATH = "src/lib/orders/recent-orders-filter.ts";
const DASHBOARD_MOCK_PATH = "src/lib/mock/dashboard.ts";

function readRepoFile(relPath: string): string {
  // Tests run from the web project root in this repo.
  if (!existsSync(relPath)) {
    throw new Error(`Expected file at ${relPath}, but it was not found.`);
  }
  return readFileSync(relPath, "utf8");
}

test("/app/offers does not claim TikTok Shop is active in buyer-facing copy", () => {
  const source = readRepoFile(OFFERS_PATH);

  const forbiddenActiveClaims = [
    "Shopee và TikTok Shop",
    "qua Shopee và TikTok Shop",
    "Khám phá chương trình hoàn tiền từ Shopee và TikTok Shop",
  ];
  for (const claim of forbiddenActiveClaims) {
    if (source.includes(claim)) {
      throw new Error(
        `/app/offers must not claim '${claim}' -- TikTok Shop is upcoming, not active.`,
      );
    }
  }
});

test("/app/offers describes TikTok Shop as upcoming only (Sắp hỗ trợ)", () => {
  const source = readRepoFile(OFFERS_PATH);
  if (!source.includes("Sắp hỗ trợ")) {
    throw new Error(
      "/app/offers must surface a 'Sắp hỗ trợ' upcoming section so the buyer knows TikTok Shop is not active yet.",
    );
  }
  if (!source.includes('"TikTok Shop"')) {
    throw new Error(
      "/app/offers must list TikTok Shop inside the upcoming platforms list.",
    );
  }
});

test("/app/cashback does not surface a TikTok Shop cashback bucket", () => {
  const source = readRepoFile(CASHBACK_PATH);

  const forbiddenActiveClaims = [
    "Tiền hoàn TikTok Shop",
    "tiktokTotal",
  ];
  for (const claim of forbiddenActiveClaims) {
    if (source.includes(claim)) {
      throw new Error(
        `/app/cashback must not contain '${claim}' -- TikTok Shop is upcoming, not an active cashback bucket.`,
      );
    }
  }
});

test("/app/cashback describes TikTok Shop as upcoming only (Sắp hỗ trợ)", () => {
  const source = readRepoFile(CASHBACK_PATH);
  if (!source.includes("Sắp hỗ trợ")) {
    throw new Error(
      "/app/cashback must surface a 'Sắp hỗ trợ' upcoming section so the buyer knows TikTok Shop is not active yet.",
    );
  }
  if (!source.includes('"TikTok Shop"')) {
    throw new Error(
      "/app/cashback must list TikTok Shop inside the upcoming platforms list.",
    );
  }
});

test("/app/cashback history filter no longer admits TikTok Shop rows", () => {
  const source = readRepoFile(CASHBACK_PATH);

  // The buyer-facing history filter used to be
  //   ["Shopee", "TikTok Shop"]
  // which let TikTok rows surface in the table. The fix scopes the
  // filter to Shopee only. We assert the literal list shape:
  const admitsTikTok =
    /supportedPlatforms\s*:\s*CashbackPlatformName\[\]\s*=\s*\[\s*["']Shopee["']\s*,\s*["']TikTok Shop["']\s*\]/.test(
      source,
    );
  if (admitsTikTok) {
    throw new Error(
      "/app/cashback supportedPlatforms must not include 'TikTok Shop' -- TikTok Shop rows must stay out of the buyer-facing history filter.",
    );
  }
});

test("buyer nav labels do not claim TikTok Shop", () => {
  const source = readRepoFile("src/components/buyer/buyerNav.ts");
  if (source.includes("TikTok")) {
    throw new Error(
      "Buyer nav items must not mention TikTok Shop -- the buyer mobile nav is Shopee + future flows only.",
    );
  }
});

test("/app home page source does not surface TikTok Shop as active", () => {
  // Phase 20I.8 follow-up safety: the buyer home `/app` consumes
  // runtime data via `loadDashboardAsync()`. The page component
  // itself must not hard-code a TikTok Shop platform card,
  // percentage, or order row. Any such claim belongs in the
  // upstream dashboard mock (which we test separately).
  const source = readRepoFile(APP_HOME_PATH);
  const forbidden = [
    "TikTok Shop",
    '"tiktok"',
    "'tiktok'",
    "TikTok hoàn tiền",
  ];
  for (const claim of forbidden) {
    if (source.includes(claim)) {
      throw new Error(
        `/app home page must not claim '${claim}' -- the buyer home is Shopee + upcoming only.`,
      );
    }
  }
});

test("/app home consumes no TikTok Shop data via popularOffers row", () => {
  // The buyer home passes `dashboard.popularOffers` to <PopularOffers/>.
  // If the dashboard mock ever reintroduces a TikTok Shop row, this
  // test will catch it. We assert the source-level invariant here
  // because the runtime data layer goes through a (currently
  // missing) dashboard.repository which we don't unit-test.
  const source = readRepoFile(DASHBOARD_MOCK_PATH);

  // activePlatforms must be Shopee-only.
  const activeBlock = /activePlatforms\s*:\s*\[([^\]]*)\]/m.exec(source);
  if (!activeBlock) {
    throw new Error(
      "Dashboard mock does not export an activePlatforms array; cannot verify TikTok safety.",
    );
  }
  const activeRaw = activeBlock[1];
  if (/tiktok/i.test(activeRaw)) {
    throw new Error(
      `dashboardSummary.activePlatforms must not include TikTok -- got [${activeRaw}]`,
    );
  }
  if (!/shopee/i.test(activeRaw)) {
    throw new Error(
      `dashboardSummary.activePlatforms must include Shopee -- got [${activeRaw}]`,
    );
  }

  // popularOffers must not include TikTok Shop rows.
  // We pattern-match the literal `platform: "TikTok Shop"` form
  // and the Vietnamese label `Đồ gia dụng TikTok` that previously
  // shipped.
  if (/platform:\s*"TikTok Shop"/.test(source)) {
    throw new Error(
      "popularOffers must not contain a TikTok Shop row -- TikTok Shop is upcoming only.",
    );
  }
  if (/Đồ gia dụng TikTok/.test(source)) {
    throw new Error(
      "popularOffers must not contain the legacy 'Đồ gia dụng TikTok' title -- convert to Shopee or remove.",
    );
  }
});

test("/app home dashboard mock lists TikTok Shop under upcoming only", () => {
  const source = readRepoFile(DASHBOARD_MOCK_PATH);
  // We want TikTok Shop mentioned but only inside an upcoming list.
  const upcomingBlock = /upcomingPlatforms\s*:\s*\[([^\]]*)\]/m.exec(source);
  if (!upcomingBlock) {
    throw new Error(
      "Dashboard mock must export an upcomingPlatforms array containing TikTok Shop.",
    );
  }
  if (!/tiktok/i.test(upcomingBlock[1])) {
    throw new Error(
      "Dashboard mock must list TikTok Shop in upcomingPlatforms so the buyer knows it is planned.",
    );
  }
});

// ---------------------------------------------------------------------------
// Phase 20I.8 follow-up -- /app "Đơn hàng gần đây" must not surface TikTok
// Shop with cashback amounts or active reconciliation / payout statuses.
// The render components `ConsumerRecentOrders` and `RecentOrdersTable` are
// the only places the buyer home and `/app/orders` pages paint order rows.
// Both must run their input through `filterActiveRecentOrders`.
// ---------------------------------------------------------------------------

test("/app home recent-orders widget filters TikTok Shop rows", () => {
  const source = readRepoFile(CONSUMER_RECENT_ORDERS_PATH);
  if (!source.includes("filterActiveRecentOrders")) {
    throw new Error(
      "ConsumerRecentOrders must run recent orders through filterActiveRecentOrders so TikTok Shop rows cannot reach the buyer home.",
    );
  }
  // Defense-in-depth: the raw `orders.map(...)` on the input array is
  // forbidden because it would render TikTok Shop rows if the upstream
  // data layer ever returned them. Only the filtered array may render.
  const inputRender =
    /\borders\.map\(/.test(source) &&
    !/\bfilterActiveRecentOrders\(\s*orders?\s*\)/.test(source);
  if (inputRender) {
    throw new Error(
      "ConsumerRecentOrders must render from the filtered activeOrders, not the raw input orders array.",
    );
  }
});

test("/app orders recent-orders table filters TikTok Shop rows", () => {
  const source = readRepoFile(RECENT_ORDERS_TABLE_PATH);
  if (!source.includes("filterActiveRecentOrders")) {
    throw new Error(
      "RecentOrdersTable must run recent orders through filterActiveRecentOrders so TikTok Shop rows cannot reach /app/orders.",
    );
  }
});

test("/app/orders OrdersTable filters TikTok Shop rows", () => {
  // Phase 20I.8 follow-up safety regression: the previous round
  // fixed `RecentOrdersTable.tsx` (used at /app home recent
  // orders widget) but missed `OrdersTable.tsx` (used directly
  // by `/app/orders`). The QA screenshot still showed TikTok
  // Shop rows on `/app/orders` after that fix. This test
  // asserts `OrdersTable.tsx` runs its `orders` input through
  // `filterActiveRecentOrders` and renders only the filtered
  // result.
  const source = readRepoFile(ORDERS_TABLE_PATH);
  if (!source.includes("filterActiveRecentOrders")) {
    throw new Error(
      "OrdersTable (used by /app/orders) must run its orders input through filterActiveRecentOrders so TikTok Shop rows cannot reach the page.",
    );
  }
  // Defense-in-depth: the raw `orders.map(...)` on the input
  // array is forbidden because it would render TikTok Shop rows
  // if the upstream data layer ever returned them. Only the
  // filtered array may render.
  const inputRender =
    /\borders\.map\(/.test(source) &&
    !/\bfilterActiveRecentOrders\(\s*orders?\s*\)/.test(source);
  if (inputRender) {
    throw new Error(
      "OrdersTable must render from the filtered activeOrders, not the raw input orders array.",
    );
  }
});

test("/app/orders page does not paint TikTok Shop in JSX or call sites", () => {
  // The page component itself (`/app/orders/page.tsx`) must not
  // inline a TikTok Shop row, identifier, or label. Anything
  // TikTok-related belongs in the upstream filter layer or the
  // upcoming-section copy.
  const source = readRepoFile(APP_ORDERS_PATH);
  const forbidden = [
    "TikTok Shop",
    '"tiktok"',
    "'tiktok'",
    "Kem chống nắng SPF50",
    "Bình giữ nhiệt inox",
    "Máy xay sinh tố mini",
  ];
  for (const claim of forbidden) {
    if (source.includes(claim)) {
      throw new Error(
        `/app/orders page source must not contain '${claim}' -- TikTok Shop is upcoming, not an active order platform.`,
      );
    }
  }
});

test("active-recent-orders filter helper is the single source of truth", () => {
  const source = readRepoFile(ORDERS_FILTER_PATH);
  if (!source.includes("isActiveOrderStore")) {
    throw new Error(
      "recent-orders-filter.ts must export isActiveOrderStore as the single source of truth for which stores are active.",
    );
  }
  if (!/filterActiveRecentOrders/.test(source)) {
    throw new Error(
      "recent-orders-filter.ts must export filterActiveRecentOrders.",
    );
  }
  // Token sentinel: TikTok Shop must not be recognised as active.
  if (/tiktok/i.test(source) && /\bactiveStore\b.*tiktok|tiktok.*activeStore/i.test(source)) {
    throw new Error(
      "filterActiveRecentOrders must not classify TikTok Shop as an active store.",
    );
  }
});

test("/app home and /app orders pages use BuyerResponsiveShell and privateRouteMetadata()", () => {
  // Regression of the buyer-shell contract from prior phases: each
  // buyer page still wraps its body in BuyerResponsiveShell and
  // exports metadata from privateRouteMetadata(). This catches a
  // regression where TikTok-safety edits accidentally remove the
  // shell wiring.
  for (const path of [APP_HOME_PATH, APP_ORDERS_PATH]) {
    const source = readRepoFile(path);
    if (!source.includes("BuyerResponsiveShell")) {
      throw new Error(
        `${path} must still render BuyerResponsiveShell -- the buyer shell is the only wrap surface for /app/** routes.`,
      );
    }
    if (!source.includes("privateRouteMetadata()")) {
      throw new Error(
        `${path} must still apply privateRouteMetadata() to its <head>.`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Phase 20I.8 follow-up -- /app/profile "Sàn ưu tiên" field must not
// expose TikTok Shop as an active selectable preferred platform.
// Today only Shopee is active; TikTok Shop is upcoming / sắp hỗ trợ.
// ---------------------------------------------------------------------------

test("/app/profile preferred-platform list marks TikTok Shop as upcoming only", () => {
  const source = readRepoFile(PROFILE_MANAGEMENT_PANEL_PATH);
  // The list must still mention TikTok Shop so the buyer knows it
  // is planned, but the row must be marked state === "upcoming"
  // and the checkbox must render with `disabled`.
  if (!/TikTok Shop/.test(source)) {
    throw new Error(
      "ProfileManagementPanel must still mention TikTok Shop so the buyer knows it is planned, but only as upcoming.",
    );
  }
  if (!/Sắp hỗ trợ/.test(source)) {
    throw new Error(
      "ProfileManagementPanel must render TikTok Shop with the 'Sắp hỗ trợ' hint copy so the upcoming state is clear.",
    );
  }
  // Sentinel: the upcoming row must be disabled at the input. We
  // accept either an inline `disabled` attribute or a derived
  // `disabled={isUpcoming}` attribute.
  const hasDisabledForUpcoming =
    /disabled\s*=\s*\{?isUpcoming\}?/.test(source) ||
    /\bdisabled\b/.test(source);
  if (!hasDisabledForUpcoming) {
    throw new Error(
      "ProfileManagementPanel must disable the TikTok Shop checkbox so it cannot be submitted as an active preferred platform.",
    );
  }
});

test("/app/profile preferred-platform list keeps Shopee as the sole active option", () => {
  const source = readRepoFile(PROFILE_MANAGEMENT_PANEL_PATH);
  // Active options are those marked state === "active" inside
  // the platformOptions array. Shopee must be in that bucket.
  // Any other option must be upcoming. We scan the whole file
  // for `state: "active"` and assert the surrounding literal
  // identifies Shopee. The repo targets ES2017 so we use
  // [\s\S]*? instead of the `s` flag.
  const activeBlocks = source.match(/value:\s*"[A-Za-z\s]+"[\s\S]*?state:\s*"active"/g) ?? [];
  let shopeeActiveHit = false;
  for (const block of activeBlocks) {
    if (/value:\s*"Shopee"/.test(block)) shopeeActiveHit = true;
  }
  if (!shopeeActiveHit) {
    throw new Error(
      `ProfileManagementPanel must keep Shopee in the 'active' state. Active candidates: ${JSON.stringify(activeBlocks)}`,
    );
  }
  // TikTok Shop must not be present in any active bucket.
  const tiktokActive = source.match(/value:\s*"TikTok Shop"[\s\S]*?state:\s*"active"/);
  if (tiktokActive) {
    throw new Error(
      "ProfileManagementPanel must not classify TikTok Shop as an active preferred platform.",
    );
  }
});

test("/app/profile updateProfileAction server-side allow-list is Shopee only", () => {
  // Defense-in-depth: even if the UI checkbox is bypassed (curl,
  // tampered form, old cached HTML), the server action must
  // reject TikTok Shop as a preferred platform. The
  // `supportedPlatforms` set is the contract.
  const source = readRepoFile(PROFILE_ACTIONS_PATH);
  const setBlock =
    /supportedPlatforms\s*=\s*new\s+Set<ClickPlatform>\(\s*\[([^\]]*)\]/m.exec(
      source,
    );
  if (!setBlock) {
    throw new Error(
      "profile/actions.ts must declare the supportedPlatforms allow-list.",
    );
  }
  if (!/Shopee/.test(setBlock[1])) {
    throw new Error(
      `supportedPlatforms must include Shopee. Got: ${setBlock[1]}`,
    );
  }
  if (/TikTok Shop/i.test(setBlock[1])) {
    throw new Error(
      `supportedPlatforms must NOT include TikTok Shop. Got: ${setBlock[1]}`,
    );
  }
});

test("/app/profile page uses BuyerResponsiveShell and privateRouteMetadata()", () => {
  const source = readRepoFile(APP_PROFILE_PATH);
  if (!source.includes("BuyerResponsiveShell")) {
    throw new Error(
      "/app/profile must still render BuyerResponsiveShell -- the buyer shell is the only wrap surface for /app/** routes.",
    );
  }
  if (!source.includes("privateRouteMetadata()")) {
    throw new Error(
      "/app/profile must still apply privateRouteMetadata() to its <head>.",
    );
  }
});
