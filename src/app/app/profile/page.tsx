import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import AppSection from "@/components/layout/AppSection";
import PageHeader from "@/components/layout/PageHeader";
import ProfileHeader from "@/features/profile/ProfileHeader";
import ProfileInfoCard from "@/features/profile/ProfileInfoCard";
import ProfileManagementPanel from "@/features/profile/ProfileManagementPanel";
import PayoutAccountCard from "@/features/profile/PayoutAccountCard";
import ProfileStatsCard from "@/features/profile/ProfileStatsCard";
import { loadProfileAsync } from "@/hooks/loadProfileAsync";

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
    </div>
  );

  return (
    <AppShell desktopContent={desktopContent}>
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
      <AppSection className="pb-8">
        <ProfileStatsCard
          preferredPlatformsCount={preferredPlatformsCount}
          memberTier={profile.memberTier}
          joinedYear={joinedYear}
        />
      </AppSection>
    </AppShell>
  );
}
