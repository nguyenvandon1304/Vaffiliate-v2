/**
 * Phase 20I.6 -- public Cashback Terms page (`/cashback-terms`).
 * Phase 20I.7 -- canonical + OpenGraph metadata + JSON-LD
 *                 BreadcrumbList.
 */

import PolicyPageLayout from "@/components/policy/PolicyPageLayout";
import { CASHBACK_TERMS_POLICY } from "@/lib/policy/policy-content";
import { buildPublicRouteMetadata } from "@/lib/seo/public-route-metadata";
import {
  JsonLdScript,
  buildBreadcrumbJsonLd,
} from "@/lib/seo/jsonld";

export const dynamic = "force-static";

export const metadata = buildPublicRouteMetadata({
  title: CASHBACK_TERMS_POLICY.title,
  description: CASHBACK_TERMS_POLICY.description,
  canonicalPath: CASHBACK_TERMS_POLICY.path,
});

export default function CashbackTermsPage() {
  return (
    <>
      <JsonLdScript
        payloads={[
          buildBreadcrumbJsonLd([
            { name: "Trang chủ", item: "/" },
            {
              name: "Điều khoản hoàn tiền",
              item: "/cashback-terms",
            },
          ]),
        ]}
      />
      <PolicyPageLayout page={CASHBACK_TERMS_POLICY} />
    </>
  );
}
