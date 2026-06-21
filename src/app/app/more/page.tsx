import AppShell from "@/components/layout/AppShell";
import AppSection from "@/components/layout/AppSection";
import PageHeader from "@/components/layout/PageHeader";
import MembershipCard from "@/features/more/MembershipCard";
import MoreMenuGrid from "@/features/more/MoreMenuGrid";
import { loadUserAsync } from "@/hooks/loadUserAsync";

export default async function MorePage() {
  const { menuItems } = await loadUserAsync();

  const desktopContent = (
    <div className="space-y-6">
      <section className="surface-card overflow-hidden bg-[linear-gradient(180deg,rgba(255,252,249,0.92),rgba(248,238,231,0.96))] p-6">
        <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
          Tiện ích và thông tin tài khoản
        </p>
        <h1 className="text-[2rem] font-semibold tracking-[-0.04em] text-[color:var(--text)]">
          Thêm
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[color:var(--text-muted)]">
          Quản lý tài khoản, xem hướng dẫn và truy cập các công cụ theo dõi chuyên sâu.
        </p>
      </section>

      <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.35fr)]">
        <MembershipCard />
        <MoreMenuGrid items={menuItems} />
      </section>
    </div>
  );

  return (
    <AppShell desktopContent={desktopContent}>
      <AppSection>
        <PageHeader
          eyebrow={
            <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
              Tiện ích và thông tin tài khoản
            </p>
          }
          title="Thêm"
          description="Quản lý tài khoản, xem hướng dẫn và truy cập các công cụ theo dõi chuyên sâu."
        />
      </AppSection>
      <AppSection className="mb-4">
        <MembershipCard />
      </AppSection>
      <AppSection className="mb-4">
        <MoreMenuGrid items={menuItems} />
      </AppSection>
    </AppShell>
  );
}
