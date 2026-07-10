import Link from "next/link";

import { logout } from "@/app/auth/actions";
import BuyerResponsiveShell from "@/components/buyer/BuyerResponsiveShell";
import AppSection from "@/components/layout/AppSection";
import PageHeader from "@/components/layout/PageHeader";
import ProfileHeader from "@/features/profile/ProfileHeader";
import ProfileInfoCard from "@/features/profile/ProfileInfoCard";
import ProfileManagementPanel from "@/features/profile/ProfileManagementPanel";
import PayoutAccountCard from "@/features/profile/PayoutAccountCard";
import ProfileStatsCard from "@/features/profile/ProfileStatsCard";
import { loadProfileAsync } from "@/hooks/loadProfileAsync";
import { privateRouteMetadata } from "@/lib/seo/private-route-metadata";

export const metadata = privateRouteMetadata();

/**
 * Phase 20I.6 -- small footer of legal / deletion links shown at
 * the bottom of the profile page. Each link is to a public route
 * so the user can read the policy before deciding to delete the
 * account.
 */
const PROFILE_LEGAL_LINKS: ReadonlyArray<{ readonly href: string; readonly label: string }> =
  [
    { href: "/privacy", label: "Chính sách quyền riêng tư" },
    { href: "/terms", label: "Điều khoản dịch vụ" },
    { href: "/cashback-terms", label: "Điều khoản hoàn tiền" },
    { href: "/data-deletion", label: "Trang xóa dữ liệu" },
  ];

function ProfileLegalLinks() {
  return (
    <nav
      aria-label="Liên kết chính sách"
      className="surface-card flex flex-col gap-3 bg-[rgba(255,252,249,0.82)] p-4 sm:p-5"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
        Chính sách &amp; tài khoản
      </p>
      <ul className="flex flex-col gap-2 text-sm text-[color:var(--text-muted)]">
        {PROFILE_LEGAL_LINKS.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 hover:text-[color:var(--brand-strong)]"
            >
              {link.label}
              <span aria-hidden="true">↗</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href="/app/account/delete"
        className="mt-2 inline-flex items-center justify-center rounded-[var(--radius-lg)] border border-[rgba(180,70,70,0.32)] bg-[rgba(180,70,70,0.06)] px-4 py-2 text-sm font-semibold text-red-700 hover:bg-[rgba(180,70,70,0.12)]"
      >
        Yêu cầu xóa tài khoản
      </Link>
    </nav>
  );
}

function LogoutForm() {
  return (
    <form action={logout}>
      <button
        type="submit"
        className="w-full rounded-[var(--radius-lg)] bg-[color:var(--brand)] px-4 py-3 text-sm font-semibold text-white shadow-[var(--shadow-sm)]"
      >
        Đăng xuất
      </button>
    </form>
  );
}

export default async function ProfilePage() {
  const { profile } = await loadProfileAsync();

  const preferredPlatformsCount = profile.preferredPlatforms.length;
  const joinedYear = profile.joinedAt.slice(0, 4);

  const desktopContent = (
    <div className="space-y-6">
      <ProfileHeader profile={profile} />
      <section className="grid gap-4 xl:grid-cols-2">
        <ProfileInfoCard profile={profile} />
        <PayoutAccountCard payoutAccount={profile.payoutAccount} />
      </section>
      <ProfileManagementPanel profile={profile} />
      <ProfileStatsCard
        preferredPlatformsCount={preferredPlatformsCount}
        memberTier={profile.memberTier}
        joinedYear={joinedYear}
      />
      <ProfileLegalLinks />
      <LogoutForm />
    </div>
  );

  return (
    <BuyerResponsiveShell title="Hồ sơ" desktopContent={desktopContent}>
      <AppSection>
        <PageHeader
          eyebrow={
            <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
              Hồ sơ và tài khoản nhận tiền
            </p>
          }
          title="Hồ sơ"
          description="Thông tin cá nhân và tài khoản nhận hoàn tiền của bạn."
          trailing={
            <Link
              href="#profile-edit"
              className="rounded-[var(--radius-lg)] bg-[color:var(--brand)] px-4 py-3 text-sm font-semibold text-white shadow-[var(--shadow-sm)]"
            >
              Chỉnh sửa
            </Link>
          }
        />
      </AppSection>
      <AppSection className="mb-4">
        <ProfileHeader profile={profile} />
      </AppSection>
      <AppSection className="mb-4">
        <ProfileInfoCard profile={profile} />
      </AppSection>
      <AppSection className="mb-4">
        <ProfileManagementPanel profile={profile} />
      </AppSection>
      <AppSection className="mb-4">
        <PayoutAccountCard payoutAccount={profile.payoutAccount} />
      </AppSection>
      <AppSection className="mb-4">
        <ProfileStatsCard
          preferredPlatformsCount={preferredPlatformsCount}
          memberTier={profile.memberTier}
          joinedYear={joinedYear}
        />
      </AppSection>
      <AppSection className="mb-4">
        <ProfileLegalLinks />
      </AppSection>
      <AppSection className="pb-8">
        <LogoutForm />
      </AppSection>
    </BuyerResponsiveShell>
  );
}
