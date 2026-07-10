import { redirect } from "next/navigation";

import { resolveBuyerAlias } from "../buyer-alias";

/**
 * Phase 20I.8 -- `/app/account` alias.
 *
 * The buyer's canonical account surface is `/app/profile`. This
 * route exists so the buyer shell bottom-nav item labelled
 * "Tài khoản" can resolve to `/app/account` without
 * pre-empting the existing `/app/profile` route, while keeping
 * the destination URL the same for everyone. A `redirect()`
 * keeps the URL stable across rerenders so deep links and
 * shared URLs land in the same canonical place.
 *
 * Auth: the parent `/app/**` layout already calls
 * `requireUser()`, so by the time this file renders we know
 * the buyer is authenticated. The redirect target is inside
 * the same auth surface, so no additional guard is needed.
 *
 * The page declares no `metadata` because a `redirect()`
 * response returns a 307 without an HTML body.
 */
export default function AppAccountPage() {
  redirect(resolveBuyerAlias("account"));
}
