import Card from "@/components/ui/Card";
import StatCard from "@/components/ui/StatCard";
import { dashboardSummary } from "@/lib/mock-data";

const statItems = [
  {
    label: "Có thể rút",
    value: dashboardSummary.availableCashback,
  },
  {
    label: "Chờ đối soát",
    value: dashboardSummary.pendingCashback,
  },
  {
    label: "Đơn ghi nhận",
    value: dashboardSummary.trackedOrders,
  },
];

export default function WalletOverview() {
  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
      <Card className="bg-[rgba(255,250,246,0.72)] p-5">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="relative overflow-hidden rounded-[var(--radius-xl)] bg-[linear-gradient(135deg,var(--brand),var(--accent))] p-5 text-white shadow-[var(--shadow-glow)]">
            <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
            <p className="text-sm text-white/84">Ví hoàn tiền</p>
            <p className="mt-3 text-4xl font-semibold tracking-[-0.04em]">{dashboardSummary.availableCashback}</p>
            <p className="mt-4 max-w-md text-sm leading-6 text-white/84">{dashboardSummary.nextPayout}</p>
          </div>
          <div className="grid gap-3">
            {statItems.map((item) => (
              <StatCard key={item.label} label={item.label} value={item.value} />
            ))}
          </div>
        </div>
      </Card>
    </section>
  );
}
