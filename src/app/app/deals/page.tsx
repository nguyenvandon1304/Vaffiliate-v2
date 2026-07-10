import { redirect } from "next/navigation";

import { resolveBuyerAlias } from "../buyer-alias";

/**
 * Phase 20I.8 -- `/app/deals` alias.
 *
 * The buyer's canonical deals surface is `/app/offers`. This
 * route exists so the buyer shell bottom-nav item labelled
 * "Ưu đãi" can resolve to `/app/deals` without
 * pre-empting the existing `/app/offers` route, while keeping
 * the destination URL the same for everyone.
 *
 * Auth: the parent `/app/**` layout already calls
 * `requireUser()`, so by the time this file renders we know
 * the buyer is authenticated. The redirect target is inside
 * the same auth surface, so no additional guard is needed.
 *
 * The page declares no `metadata` because a `redirect()`
 * response returns a 307 without an HTML body.
 */
export default function AppDealsPage() {
  redirect(resolveBuyerAlias("deals"));
}
