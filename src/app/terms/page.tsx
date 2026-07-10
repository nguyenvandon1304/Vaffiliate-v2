/**
 * Phase 20I.6 -- public Terms of Service page (`/terms`).
 * Phase 20I.7 -- canonical + OpenGraph metadata + JSON-LD
 *                 BreadcrumbList.
 */

import PolicyPageLayout from "@/components/policy/PolicyPageLayout";
import { TERMS_POLICY } from "@/lib/policy/policy-content";
import { buildPublicRouteMetadata } from "@/lib/seo/public-route-metadata";
import {
  JsonLdScript,
  buildBreadcrumbJsonLd,
} from "@/lib/seo/jsonld";

export const dynamic = "force-static";

export const metadata = buildPublicRouteMetadata({
  title: TERMS_POLICY.title,
  description: TERMS_POLICY.description,
  canonicalPath: TERMS_POLICY.path,
});

export default function TermsPage() {
  return (
    <>
      <JsonLdScript
        payloads={[
          buildBreadcrumbJsonLd([
            { name: "Trang chủ", item: "/" },
            { name: "Điều khoản dịch vụ", item: "/terms" },
          ]),
        ]}
      />
      <PolicyPageLayout page={TERMS_POLICY} />
    </>
  );
}
