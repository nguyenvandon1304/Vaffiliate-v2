/**
 * Phase 20I.6 -- public Cashback Terms page (`/cashback-terms`).
 *
 * Static server component. The copy lives in
 * `lib/policy/policy-content.ts`.
 */

import type { Metadata } from "next";

import PolicyPageLayout from "@/components/policy/PolicyPageLayout";
import { CASHBACK_TERMS_POLICY } from "@/lib/policy/policy-content";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: `${CASHBACK_TERMS_POLICY.title} | Vaffiliate`,
  description: CASHBACK_TERMS_POLICY.description,
};

export default function CashbackTermsPage() {
  return <PolicyPageLayout page={CASHBACK_TERMS_POLICY} />;
}
