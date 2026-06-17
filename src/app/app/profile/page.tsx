import AppShell from "@/components/layout/AppShell";
import AppSection from "@/components/layout/AppSection";
import PageHeader from "@/components/layout/PageHeader";
import ProfileHeader from "@/features/profile/ProfileHeader";
import ProfileInfoCard from "@/features/profile/ProfileInfoCard";
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
        />
      </AppSection>
      <AppSection className="mb-4">
        <ProfileHeader profile={profile} />
      </AppSection>
      <AppSection className="mb-4">
        <ProfileInfoCard profile={profile} />
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
