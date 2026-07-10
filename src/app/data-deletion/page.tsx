/**
 * Phase 20I.6 -- public Data Deletion page (`/data-deletion`).
 *
 * Server component. NO auth requirement: anyone can read the
 * policy copy. The CTA below the lead is conditional:
 *
 *   - Authenticated user: links to `/app/account/delete` so they
 *     can submit a deletion request right from the policy page.
 *   - Unauthenticated user: links to `/login?next=/app/account/delete`
 *     so the login flow returns them to the deletion form.
 *
 * The session read uses the existing Supabase server client. If
 * Supabase is not configured (CI / build with no env) the page
 * still renders and just shows the unauthenticated CTA.
 */

import type { Metadata } from "next";

import PolicyPageLayout from "@/components/policy/PolicyPageLayout";
import { DATA_DELETION_POLICY } from "@/lib/policy/policy-content";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `${DATA_DELETION_POLICY.title} | Vaffiliate`,
  description: DATA_DELETION_POLICY.description,
};

export default async function DataDeletionPage() {
  let isAuthenticated = false;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    isAuthenticated = user !== null;
  } catch {
    // Supabase not configured at build time; treat as
    // unauthenticated so the CTA shows the login link.
    isAuthenticated = false;
  }

  const cta = isAuthenticated
    ? {
        href: "/app/account/delete",
        label: "Gửi yêu cầu xóa tài khoản",
        description:
          "Bạn đang đăng nhập. Mở khu vực tài khoản để gửi yêu cầu xóa.",
      }
    : {
        href: "/login?next=/app/account/delete",
        label: "Đăng nhập để gửi yêu cầu",
        description:
          "Để gửi yêu cầu xóa tài khoản, vui lòng đăng nhập trước. Vaffiliate không xử lý yêu cầu xóa cho tài khoản không thể xác minh.",
      };

  return (
    <PolicyPageLayout
      page={DATA_DELETION_POLICY}
      cta={cta}
    />
  );
}
