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
          Xem hướng dẫn, điều kiện đơn hợp lệ và các mục thiết lập cần thiết cho trải nghiệm hoàn tiền.
        </p>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.35fr)]">
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
          description="Xem hướng dẫn, điều kiện đơn hợp lệ và các mục thiết lập cần thiết cho trải nghiệm hoàn tiền."
        />
      </AppSection>
      <AppSection className="mb-4">
        <MembershipCard />
      </AppSection>
      <AppSection className="pb-8">
        <MoreMenuGrid items={menuItems} />
      </AppSection>
    </AppShell>
  );
}
