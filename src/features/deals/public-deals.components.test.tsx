/**
 * Phase 20I.1 -- tests for the public-deals UI components.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import CashbackProgramCard from "@/features/deals/CashbackProgramCard";
import DealCard from "@/features/deals/DealCard";
import DealCategoryTabs from "@/features/deals/DealCategoryTabs";
import DealGrid from "@/features/deals/DealGrid";
import PlatformTabs from "@/features/deals/PlatformTabs";
import SafeDisclosure from "@/features/deals/SafeDisclosure";
import VoucherCard from "@/features/deals/VoucherCard";
import {
  getDealAction,
  listDealsByPlatform,
  listPlatforms,
  serializeDealAction,
} from "@/services/public-deals.service";
import type {
  PublicCashbackDeal,
  PublicPromoDeal,
  PublicVoucherDeal,
} from "@/services/public-deals.types";
import { PUBLIC_DEALS } from "@/lib/mock/public-deals";

const INTERNAL_ID_MARKERS: ReadonlyArray<string> = [
  "vaflnk",
  "networkSubId",
  "sourceSubId1",
  "purchaseIntentId",
  "trackingLinkId",
  "publisherId",
  "shortCode",
  "clickId",
  "trackingPath",
];

const FORBIDDEN_HEX: ReadonlyArray<string> = [
  "#ee4d2d",
  "#0f146d",
  "#1a94ff",
];

function assertNoInternalIdLeak(markup: string): void {
  for (const marker of INTERNAL_ID_MARKERS) {
    assert.ok(!markup.includes(marker));
  }
}

function assertNoBrandColorHex(markup: string): void {
  for (const hex of FORBIDDEN_HEX) {
    assert.ok(!markup.includes(hex), `markup leaked brand colour ${hex}`);
  }
}

function assertNoReplacementChar(markup: string): void {
  assert.ok(!markup.includes("�"), "markup contains U+FFFD replacement char");
}

test("VoucherCard renders copy button when code is available", () => {
  const voucher = PUBLIC_DEALS.find(
    (d) => d.kind === "voucher_code" && d.status === "active" && Boolean(d.code),
  ) as PublicVoucherDeal | undefined;
  assert.ok(voucher);
  const action = serializeDealAction(getDealAction(voucher));
  const markup = renderToStaticMarkup(
    <VoucherCard deal={voucher} action={action} />,
  );
  assert.ok(markup.includes("voucher-copy-button"));
  assert.ok(markup.includes("Sao chép mã"));
  assertNoInternalIdLeak(markup);
  assertNoBrandColorHex(markup);
  assertNoReplacementChar(markup);
});

test("VoucherCard does NOT render copy button when expired", () => {
  const expired = PUBLIC_DEALS.find((d) => d.status === "expired") as
    | PublicVoucherDeal
    | undefined;
  assert.ok(expired);
  const action = serializeDealAction(getDealAction(expired));
  const markup = renderToStaticMarkup(
    <VoucherCard deal={expired} action={action} />,
  );
  assert.ok(!markup.includes("voucher-copy-button"));
  assert.ok(markup.includes("voucher-expired"));
  assert.ok(markup.includes("Đã hết hạn"));
  assertNoInternalIdLeak(markup);
  assertNoBrandColorHex(markup);
  assertNoReplacementChar(markup);
});

test("CashbackProgramCard routes Shopee deal to /cashback", () => {
  const cashback = PUBLIC_DEALS.find(
    (d) => d.kind === "cashback_program" && d.platform === "shopee",
  ) as PublicCashbackDeal | undefined;
  assert.ok(cashback);
  const action = serializeDealAction(getDealAction(cashback));
  const markup = renderToStaticMarkup(
    <CashbackProgramCard deal={cashback} action={action} />,
  );
  assert.ok(markup.includes("cashback-program-cta"));
  assert.ok(markup.includes('href="/cashback"'));
  assert.ok(markup.includes("cashback-safe-hint"));
  assert.ok(markup.includes("Xem điều kiện hoàn tiền"));
  assertNoInternalIdLeak(markup);
  assertNoBrandColorHex(markup);
  assertNoReplacementChar(markup);
});

test("CashbackProgramCard copy never claims guaranteed cashback", () => {
  const cashbacks = PUBLIC_DEALS.filter((d) => d.kind === "cashback_program");
  for (const cashback of cashbacks) {
    const action = serializeDealAction(getDealAction(cashback));
    const markup = renderToStaticMarkup(
      <CashbackProgramCard
        deal={cashback as PublicCashbackDeal}
        action={action}
      />,
    ).toLowerCase();
    assert.ok(!markup.includes("dam bao"));
    assert.ok(!markup.includes("100%"));
    assertNoInternalIdLeak(markup);
    assertNoBrandColorHex(markup);
    assertNoReplacementChar(markup);
  }
});

test("DealCard renders safe outbound link", () => {
  const deal = PUBLIC_DEALS.find(
    (d) => d.kind === "deal" && d.status === "active",
  ) as PublicPromoDeal | undefined;
  assert.ok(deal);
  const action = serializeDealAction(getDealAction(deal));
  const markup = renderToStaticMarkup(<DealCard deal={deal} action={action} />);
  assert.ok(markup.includes('target="_blank"'));
  assert.ok(markup.includes("noopener"));
  assert.ok(markup.includes("noreferrer"));
  assertNoInternalIdLeak(markup);
  assertNoBrandColorHex(markup);
  assertNoReplacementChar(markup);
});

test("DealGrid dispatches by deal kind", () => {
  const shopee = listDealsByPlatform("shopee");
  const markup = renderToStaticMarkup(<DealGrid deals={shopee} />);
  assert.ok(markup.includes("voucher-card"));
  assert.ok(markup.includes("deal-card"));
  assert.ok(markup.includes("cashback-program-card"));
  assertNoInternalIdLeak(markup);
  assertNoBrandColorHex(markup);
  assertNoReplacementChar(markup);
});

test("DealGrid renders empty placeholder for empty list", () => {
  const markup = renderToStaticMarkup(<DealGrid deals={[]} />);
  assert.ok(markup.includes("deal-grid-empty"));
  assert.ok(markup.includes("Chưa có ưu đãi nào trong danh mục này"));
  assertNoReplacementChar(markup);
});

test("DealGrid renders loading skeleton when state is loading", () => {
  const markup = renderToStaticMarkup(<DealGrid deals={[]} state="loading" />);
  assert.ok(markup.includes("deal-grid-loading"));
  assert.ok(markup.includes("deal-grid-skeleton"));
});

test("DealGrid renders error message + retry link when state is error", () => {
  const markup = renderToStaticMarkup(
    <DealGrid deals={[]} state="error" retryHref="/ma-giam-gia" />,
  );
  assert.ok(markup.includes("deal-grid-error"));
  assert.ok(markup.includes('href="/ma-giam-gia"'));
  assert.ok(markup.includes("Không thể tải danh sách ưu đãi"));
});

test("PlatformTabs highlights active platform and marks scaffolds", () => {
  const platforms = listPlatforms();
  const markup = renderToStaticMarkup(
    <PlatformTabs platforms={platforms} activePlatform="shopee" />,
  );
  assert.ok(markup.includes('href="/ma-giam-gia/shopee"'));
  assert.ok(markup.includes('aria-current="page"'));
  assert.ok(markup.includes('data-disabled="true"'));
  assert.ok(markup.includes("Sắp ra mắt"));
  assertNoBrandColorHex(markup);
  assertNoReplacementChar(markup);
});

test("SafeDisclosure renders the buyer-facing disclaimer", () => {
  const markup = renderToStaticMarkup(<SafeDisclosure />);
  assert.ok(markup.includes("safe-disclosure"));
  assert.ok(markup.includes("Voucher và hoàn tiền"));
  assertNoReplacementChar(markup);
});

test("All public-deals markup uses Vietnamese diacritics in key headings", () => {
  const deal = PUBLIC_DEALS.find(
    (d) => d.kind === "deal" && d.status === "active",
  ) as PublicPromoDeal | undefined;
  assert.ok(deal);
  const platforms = listPlatforms();
  const voucher = PUBLIC_DEALS.find(
    (d) => d.kind === "voucher_code" && d.status === "active",
  ) as PublicVoucherDeal | undefined;
  assert.ok(voucher);
  const cashback = PUBLIC_DEALS.find(
    (d) => d.kind === "cashback_program",
  ) as PublicCashbackDeal | undefined;
  assert.ok(cashback);
  const voucherAction = serializeDealAction(getDealAction(voucher));
  const cashbackAction = serializeDealAction(getDealAction(cashback));
  const dealAction = serializeDealAction(getDealAction(deal));
  const all = [
    renderToStaticMarkup(<PlatformTabs platforms={platforms} activePlatform="shopee" />),
    renderToStaticMarkup(
      <DealCategoryTabs
        platform="shopee"
        categories={listPlatforms().length ? [] : []}
        activeCategory="all"
      />,
    ),
    renderToStaticMarkup(<DealCard deal={deal} action={dealAction} />),
    renderToStaticMarkup(<VoucherCard deal={voucher} action={voucherAction} />),
    renderToStaticMarkup(
      <CashbackProgramCard deal={cashback} action={cashbackAction} />,
    ),
    renderToStaticMarkup(<SafeDisclosure />),
  ].join(" ");
  assertNoReplacementChar(all);
  const placeholders = [
    "Ma giam gia",
    "Ma doc quyen",
    "Het han",
    "Shopee dang duoc",
  ];
  for (const p of placeholders) {
    assert.ok(!all.includes(p), `markup still uses unaccented placeholder "${p}"`);
  }
});
