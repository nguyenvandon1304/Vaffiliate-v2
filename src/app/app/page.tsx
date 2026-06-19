import AppShell from "@/components/layout/AppShell";
import AppSection from "@/components/layout/AppSection";
import ConsumerHomeHero from "@/features/dashboard/ConsumerHomeHero";
import ConsumerRecentOrders from "@/features/dashboard/ConsumerRecentOrders";
import PopularOffers from "@/features/dashboard/PopularOffers";
import TrustNotice from "@/features/dashboard/TrustNotice";
import { loadDashboardAsync } from "@/hooks/loadDashboardAsync";

export default async function AppDashboardPage() {
  const dashboard = await loadDashboardAsync();

  const greeting = dashboard.summary.greeting.split(",")[0];
  const name = dashboard.summary.greeting.split(", ")[1] ?? "bạn";

  const desktopContent = (
    <div className="space-y-6">
      <ConsumerHomeHero
        greeting={greeting}
        name={name}
        availableCashback={dashboard.summary.availableCashback}
        pendingCashback={dashboard.summary.pendingCashback}
        trackedOrders={dashboard.summary.trackedOrders}
      />

      {dashboard.popularOffers && dashboard.popularOffers.length > 0 && (
        <PopularOffers offers={dashboard.popularOffers} />
      )}

      <ConsumerRecentOrders orders={dashboard.recentOrders} />

      <TrustNotice />
    </div>
  );

  return (
    <AppShell desktopContent={desktopContent}>
      <AppSection>
        <ConsumerHomeHero
          greeting={greeting}
          name={name}
          availableCashback={dashboard.summary.availableCashback}
          pendingCashback={dashboard.summary.pendingCashback}
          trackedOrders={dashboard.summary.trackedOrders}
        />
      </AppSection>

      {dashboard.popularOffers && dashboard.popularOffers.length > 0 && (
        <AppSection>
          <PopularOffers offers={dashboard.popularOffers} />
        </AppSection>
      )}

      <AppSection>
        <ConsumerRecentOrders orders={dashboard.recentOrders} />
      </AppSection>

      <AppSection className="pb-8">
        <TrustNotice />
      </AppSection>
    </AppShell>
  );
}
