/**
 * Phase 20I.6 -- public Privacy Policy page (`/privacy`).
 * Phase 20I.7 -- canonical + OpenGraph metadata + JSON-LD
 *                 BreadcrumbList for the SEO surface.
 *
 * Static server component. No auth, no Supabase, no client JS.
 * The copy lives in `lib/policy/policy-content.ts` so it can be
 * audited by the policy-content unit test.
 */

import PolicyPageLayout from "@/components/policy/PolicyPageLayout";
import { PRIVACY_POLICY } from "@/lib/policy/policy-content";
import { buildPublicRouteMetadata } from "@/lib/seo/public-route-metadata";
import {
  JsonLdScript,
  buildBreadcrumbJsonLd,
} from "@/lib/seo/jsonld";

export const dynamic = "force-static";

export const metadata = buildPublicRouteMetadata({
  title: PRIVACY_POLICY.title,
  description: PRIVACY_POLICY.description,
  canonicalPath: PRIVACY_POLICY.path,
});

export default function PrivacyPage() {
  return (
    <>
      <JsonLdScript
        payloads={[
          buildBreadcrumbJsonLd([
            { name: "Trang chủ", item: "/" },
            { name: "Chính sách quyền riêng tư", item: "/privacy" },
          ]),
        ]}
      />
      <PolicyPageLayout page={PRIVACY_POLICY} />
    </>
  );
}
