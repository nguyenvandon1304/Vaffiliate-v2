/**
 * Phase 20I.6 -- public Privacy Policy page (`/privacy`).
 *
 * Static server component. No auth, no Supabase, no client JS.
 * The copy lives in `lib/policy/policy-content.ts` so it can be
 * audited by the policy-content unit test.
 */

import type { Metadata } from "next";

import PolicyPageLayout from "@/components/policy/PolicyPageLayout";
import { PRIVACY_POLICY } from "@/lib/policy/policy-content";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: `${PRIVACY_POLICY.title} | Vaffiliate`,
  description: PRIVACY_POLICY.description,
};

export default function PrivacyPage() {
  return <PolicyPageLayout page={PRIVACY_POLICY} />;
}
