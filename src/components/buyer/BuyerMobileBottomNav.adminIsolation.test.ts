/**
 * Phase 20I.8 -- admin route isolation test.
 *
 * The /app/admin/** route tree must not render the buyer bottom
 * nav (`BuyerMobileBottomNav`) nor `BuyerResponsiveShell`. We
 * assert that statically against the admin layout source because
 * the project ships no React DOM test runner for these layouts.
 *
 * Why this matters:
 *
 *   - The buyer bottom nav's "Tài khoản" link points to
 *     `/app/profile`, which an admin user might confuse with
 *     /app/admin/<...> entry points.
 *   - The buyer top bar surfaces a brand link to `/app`, which
 *     would let an admin user accidentally navigate out of the
 *     admin chrome during an audit action.
 *   - The buyer shell carries an "Sắp ra mắt" card on
 *     `/app/cashback`, which is buyer-domain copy and should
 *     not appear in the admin chrome.
 *
 * The check is performed on the file content directly.
 */

import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

function readSource(path: string): string {
  const url = new URL(path, import.meta.url);
  return readFileSync(fileURLToPath(url), "utf8");
}

function readRepoFile(relPath: string): string {
  // The test runner executes from inside `src/components/buyer/`.
  // Step back to the project root.
  const here = fileURLToPath(import.meta.url);
  const projectRoot = here.replace(/src[\\/].*$/, "");
  const absolute = `${projectRoot}${relPath}`;
  if (!existsSync(absolute)) {
    throw new Error(`Expected file at ${absolute}, but it was not found.`);
  }
  return readFileSync(absolute, "utf8");
}

test("/app/admin/layout.tsx does not import BuyerMobileBottomNav", () => {
  const adminLayout = readRepoFile("src/app/app/admin/layout.tsx");
  if (adminLayout.includes("BuyerMobileBottomNav")) {
    throw new Error(
      "Admin layout must not import BuyerMobileBottomNav -- admin chrome must remain independent of the buyer shell.",
    );
  }
  if (adminLayout.includes("BuyerResponsiveShell")) {
    throw new Error(
      "Admin layout must not import BuyerResponsiveShell -- admin chrome must remain independent of the buyer shell.",
    );
  }
  if (adminLayout.includes("BuyerMobileTopBar")) {
    throw new Error(
      "Admin layout must not import BuyerMobileTopBar -- admin chrome must remain independent of the buyer shell.",
    );
  }
});

test("BuyerMobileBottomNav root element is not present in admin layout markup", () => {
  const adminLayout = readRepoFile("src/app/app/admin/layout.tsx");
  if (adminLayout.includes("buyer-bottom-nav")) {
    throw new Error(
      "Admin layout must not render the buyer bottom nav data-testid.",
    );
  }
  if (adminLayout.includes("buyer-responsive-shell")) {
    throw new Error(
      "Admin layout must not render the buyer responsive shell data-testid.",
    );
  }
});

test("BuyerMobileBottomNav test file exists and is parseable", () => {
  const here = fileURLToPath(import.meta.url);
  const directory = here.replace(/[^\\/]+$/, "");
  if (!existsSync(`${directory}BuyerMobileBottomNav.tsx`)) {
    throw new Error(
      "BuyerMobileBottomNav.tsx must exist in the same directory as the test file.",
    );
  }
  // Reuse the source reading helper to assert the file is parseable.
  const source = readSource("./BuyerMobileBottomNav.tsx");
  if (!source.includes("BuyerMobileBottomNav")) {
    throw new Error(
      "BuyerMobileBottomNav source must contain its own component definition.",
    );
  }
});
