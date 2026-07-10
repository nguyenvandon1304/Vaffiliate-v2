/**
 * Phase 20I.8 -- BuyerMobileBottomNav class contract tests.
 *
 * These tests guard against a regression where the bottom nav
 * accidentally picks up a `hidden` Tailwind class that makes it
 * invisible at every breakpoint. The bug we hit during Phase
 * 20I.8 was that the nav root carried BOTH `hidden` and
 * `md:hidden`, which means the nav was always hidden (Tailwind
 * utilities in the same `className` are applied; `hidden` always
 * wins over `flex` because `display: none` is more specific in
 * source-order semantics when both are applied).
 *
 * The contract is:
 *
 *   - The bottom nav MUST be visible on mobile (no `hidden`
 *     class on the root).
 *   - The bottom nav MUST be hidden on viewports >= md
 *     (`md:hidden` on the root).
 *   - The bottom nav MUST have `position: fixed` (via
 *     `fixed`) and `bottom-0` so it docks at the bottom of
 *     the viewport.
 *
 * These tests are static-source tests because the project does
 * not yet ship a React DOM test runner in this layout module.
 * The class string is captured at module load and asserted.
 */

import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function readSource(path: string): string {
  const url = new URL(path, import.meta.url);
  return readFileSync(fileURLToPath(url), "utf8");
}

const SOURCE = readSource("./BuyerMobileBottomNav.tsx");

test("BuyerMobileBottomNav does not carry a plain 'hidden' class that would suppress mobile visibility", () => {
  // The class contract is `flex ... md:hidden`. A bare `hidden`
  // in the root class would override `flex` and make the nav
  // invisible at every breakpoint.
  //
  // We must NOT match `md:hidden` (that is the desired desktop
  // suppression), so the negative lookbehind explicitly excludes
  // any class that is prefixed by `md:`.
  const hasPlainHidden = /className="[^"]*(?<![:\w])hidden(?![:\w-])[^"]*"/.test(SOURCE);
  if (hasPlainHidden) {
    throw new Error(
      "BuyerMobileBottomNav className must not contain a plain 'hidden' class; it must be visible on mobile.",
    );
  }
});

test("BuyerMobileBottomNav declares the mobile-visible 'flex' class on the root nav", () => {
  if (!/\bclassName="[^"]*\bflex\b[^"]*"/.test(SOURCE)) {
    throw new Error(
      "BuyerMobileBottomNav className must contain 'flex' so it is visible on mobile.",
    );
  }
});

test("BuyerMobileBottomNav declares 'md:hidden' so it is hidden on desktop", () => {
  if (!/\bclassName="[^"]*\bmd:hidden\b[^"]*"/.test(SOURCE)) {
    throw new Error(
      "BuyerMobileBottomNav className must contain 'md:hidden' so it is hidden on desktop.",
    );
  }
});

test("BuyerMobileBottomNav docks at the bottom of the viewport", () => {
  if (!/\bclassName="[^"]*\bfixed\b[^"]*"/.test(SOURCE)) {
    throw new Error(
      "BuyerMobileBottomNav className must contain 'fixed' so it floats over the page.",
    );
  }
  if (!/\bclassName="[^"]*\bbottom-0\b[^"]*"/.test(SOURCE)) {
    throw new Error(
      "BuyerMobileBottomNav className must contain 'bottom-0' so it docks at the viewport bottom.",
    );
  }
});
