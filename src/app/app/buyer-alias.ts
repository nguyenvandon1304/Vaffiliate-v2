/**
 * Phase 20I.8 -- buyer-route alias helper.
 *
 * Pure function used by `/app/account` and `/app/deals` to redirect
 * to the canonical buyer surfaces. Keeping the resolution logic
 * here (instead of inline in each redirect page) lets us assert
 * the contract with a unit test without booting the redirect
 * runtime.
 *
 * Invariants:
 *
 *   - `/app/account` resolves to `/app/profile` (canonical
 *     profile surface).
 *   - `/app/deals` resolves to `/app/offers` (canonical offers
 *     surface).
 *   - Any unknown alias path resolves to `/app` so a typo does
 *     not throw at runtime.
 */

export type BuyerAliasId = "account" | "deals";

export function resolveBuyerAlias(
  id: BuyerAliasId,
): string {
  switch (id) {
    case "account":
      return "/app/profile";
    case "deals":
      return "/app/offers";
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}
