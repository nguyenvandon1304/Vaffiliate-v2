import Badge from "@/components/ui/Badge";
import type { DashboardSummary } from "@/types/dashboard";

type DashboardHeroProps = {
  summary: DashboardSummary;
};

export default function DashboardHero({ summary }: DashboardHeroProps) {
  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
      <div className="surface-card overflow-hidden bg-[linear-gradient(180deg,rgba(255,252,249,0.92),rgba(248,238,231,0.96))] p-6">
        <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
          {summary.greeting}
        </p>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[2rem] font-semibold tracking-[-0.04em] text-[color:var(--text)]">
              {summary.title}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--text-muted)]">
              {summary.description}
            </p>
          </div>
          <Badge>{summary.tier}</Badge>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="relative overflow-hidden rounded-[var(--radius-xl)] bg-[linear-gradient(135deg,var(--brand),var(--accent))] p-5 text-white shadow-[var(--shadow-glow)]">
            <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
            <p className="text-sm text-white/84">Ví hoàn tiền</p>
            <p className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
              {summary.availableCashback}
            </p>
            <p className="mt-4 max-w-md text-sm leading-6 text-white/84">
              {summary.nextPayout}
            </p>
          </div>

          <div className="grid gap-3">
            <div className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.88)] p-4 shadow-[var(--shadow-sm)]">
              <p className="text-xs font-medium text-[color:var(--text-muted)]">Có thể rút</p>
              <p className="mt-2 text-xl font-semibold tracking-tight text-[color:var(--text)]">{summary.availableCashback}</p>
            </div>
            <div className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.88)] p-4 shadow-[var(--shadow-sm)]">
              <p className="text-xs font-medium text-[color:var(--text-muted)]">Chờ đối soát</p>
              <p className="mt-2 text-xl font-semibold tracking-tight text-[color:var(--text)]">{summary.pendingCashback}</p>
            </div>
            <div className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.88)] p-4 shadow-[var(--shadow-sm)]">
              <p className="text-xs font-medium text-[color:var(--text-muted)]">Đơn ghi nhận</p>
              <p className="mt-2 text-xl font-semibold tracking-tight text-[color:var(--text)]">{summary.trackedOrders}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
