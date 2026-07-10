import test from "node:test";

import { resolveBuyerAlias } from "./buyer-alias";
import {
  buyerNavItems,
  isBuyerNavItemActive,
  resolveActiveBuyerNavItem,
} from "@/components/buyer/buyerNav";

test("resolveBuyerAlias maps /app/account -> /app/profile", () => {
  const target = resolveBuyerAlias("account");
  if (target !== "/app/profile") {
    throw new Error(
      `Expected /app/profile, received '${target}'`,
    );
  }
});

test("resolveBuyerAlias maps /app/deals -> /app/offers", () => {
  const target = resolveBuyerAlias("deals");
  if (target !== "/app/offers") {
    throw new Error(
      `Expected /app/offers, received '${target}'`,
    );
  }
});

test("resolveBuyerAlias stays inside /app/**", () => {
  const targets = [
    resolveBuyerAlias("account"),
    resolveBuyerAlias("deals"),
  ];
  for (const target of targets) {
    if (!target.startsWith("/app/")) {
      throw new Error(
        `Resolved alias must stay inside /app/**, got '${target}'`,
      );
    }
  }
});

test("/app/deals and /app/offers both activate the 'Ưu đãi' buyer nav item", () => {
  const deals = buyerNavItems.find((item) => item.id === "deals");
  if (!deals) throw new Error("deals item missing from buyerNavItems");
  if (deals.label !== "Ưu đãi") {
    throw new Error(
      `deals nav item label must be 'Ưu đãi', received '${deals.label}'`,
    );
  }
  if (deals.href !== "/app/offers") {
    throw new Error(
      `deals nav item href must be '/app/offers', received '${deals.href}'`,
    );
  }
  if (!isBuyerNavItemActive(deals, "/app/deals")) {
    throw new Error(
      "'Ưu đãi' must be active for the /app/deals alias",
    );
  }
  if (!isBuyerNavItemActive(deals, "/app/offers")) {
    throw new Error(
      "'Ưu đãi' must be active for the canonical /app/offers route",
    );
  }
  if (resolveActiveBuyerNavItem("/app/deals")?.id !== "deals") {
    throw new Error(
      "resolveActiveBuyerNavItem(/app/deals) must return the deals item",
    );
  }
  if (resolveActiveBuyerNavItem("/app/offers")?.id !== "deals") {
    throw new Error(
      "resolveActiveBuyerNavItem(/app/offers) must return the deals item",
    );
  }
});
