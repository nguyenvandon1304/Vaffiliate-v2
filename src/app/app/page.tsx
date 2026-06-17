import AppShell from "@/components/layout/AppShell";
import DashboardHero from "@/features/dashboard/DashboardHero";
import QuickActions from "@/features/dashboard/QuickActions";
import RecentOrdersTable from "@/features/dashboard/RecentOrdersTable";
import { loadDashboardAsync } from "@/hooks/loadDashboardAsync";

export default async function AppDashboardPage() {
  const dashboard = await loadDashboardAsync();

  const desktopContent = (
    <div className="space-y-6">
      <DashboardHero summary={dashboard.summary} />
      <div className="grid gap-4">
        <QuickActions actions={dashboard.quickActions} />
        <div className="rounded-[var(--radius-xl)] border border-[rgba(124,63,44,0.1)] bg-[rgba(255,250,246,0.72)] p-5 shadow-[var(--shadow-sm)]">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
            Sàn đang hỗ trợ
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {dashboard.activePlatforms.map((platform) => (
              <span key={platform} className="rounded-full bg-[rgba(216,138,82,0.14)] px-3 py-1 text-xs font-semibold text-[color:var(--brand-strong)]">
                {platform}
              </span>
            ))}
          </div>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
            Sắp ra mắt
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {dashboard.upcomingPlatforms.map((platform) => (
              <span key={platform} className="rounded-full border border-[rgba(124,63,44,0.12)] px-3 py-1 text-xs font-medium text-[color:var(--text-muted)]">
                {platform}
              </span>
            ))}
          </div>
        </div>
      </div>
      <RecentOrdersTable orders={dashboard.recentOrders} />
    </div>
  );

  return (
    <AppShell desktopContent={desktopContent}>
      <div className="h-1 sm:h-0" aria-hidden="true" />
      <DashboardHero summary={dashboard.summary} />
      <QuickActions actions={dashboard.quickActions} />
      <div className="mb-4 rounded-[var(--radius-xl)] border border-[rgba(124,63,44,0.1)] bg-[rgba(255,250,246,0.62)] p-4 shadow-[var(--shadow-sm)]">
        <div className="grid gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
              Sàn đang hỗ trợ
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {dashboard.activePlatforms.map((platform) => (
                <span key={platform} className="rounded-full bg-[rgba(216,138,82,0.14)] px-3 py-1 text-xs font-semibold text-[color:var(--brand-strong)]">
                  {platform}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
              Sắp ra mắt
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {dashboard.upcomingPlatforms.map((platform) => (
                <span key={platform} className="rounded-full border border-[rgba(124,63,44,0.12)] px-3 py-1 text-xs font-medium text-[color:var(--text-muted)]">
                  {platform}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
      <RecentOrdersTable orders={dashboard.recentOrders} />
    </AppShell>
  );
}
