import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import AppSection from "@/components/layout/AppSection";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/layout/PageHeader";
import MembershipCard from "@/features/more/MembershipCard";
import MoreMenuGrid from "@/features/more/MoreMenuGrid";
import { advancedNavItems } from "@/components/app/primaryNav";
import { loadUserAsync } from "@/hooks/loadUserAsync";

export default async function MorePage() {
  const { menuItems } = await loadUserAsync();

  const cardClassName =
    "block rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.88)] p-5 shadow-[var(--shadow-sm)] transition-colors hover:border-[color:var(--brand)] hover:bg-[rgba(255,250,246,0.96)]";

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

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.35fr)]">
        <MembershipCard />
        <MoreMenuGrid items={menuItems} />
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold text-[color:var(--text)]">
          Công cụ theo dõi
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {advancedNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cardClassName}
            >
              <p className="font-semibold text-[color:var(--text)]">
                {item.label}
              </p>
              <p className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                Xem chi tiết
              </p>
            </Link>
          ))}
        </div>
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
      <AppSection className="mb-4">
        <Card className="p-5">
          <h2 className="mb-3 text-base font-semibold text-[color:var(--text)]">
            Công cụ theo dõi
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {advancedNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cardClassName}
              >
                <p className="font-semibold text-[color:var(--text)]">
                  {item.label}
                </p>
                <p className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                  Xem chi tiết
                </p>
              </Link>
            ))}
          </div>
        </Card>
      </AppSection>
    </AppShell>
  );
}
