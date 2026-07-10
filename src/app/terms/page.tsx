/**
 * Phase 20I.6 -- public Terms of Service page (`/terms`).
 *
 * Static server component. The copy lives in
 * `lib/policy/policy-content.ts` so it can be audited by the
 * policy-content unit test.
 */

import type { Metadata } from "next";

import PolicyPageLayout from "@/components/policy/PolicyPageLayout";
import { TERMS_POLICY } from "@/lib/policy/policy-content";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: `${TERMS_POLICY.title} | Vaffiliate`,
  description: TERMS_POLICY.description,
};

export default function TermsPage() {
  return <PolicyPageLayout page={TERMS_POLICY} />;
}
