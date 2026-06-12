import ResponsiveAppShell from "@/components/app/ResponsiveAppShell";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import SectionHeader from "@/components/ui/SectionHeader";
import StatCard from "@/components/ui/StatCard";
import ActionButton from "@/components/ui/ActionButton";
import {
  dashboardSummary,
  quickActions,
  recentOrders,
} from "@/lib/mock-data";

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

export default function AppDashboardPage() {
  const desktopContent = (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="surface-card overflow-hidden bg-[linear-gradient(180deg,rgba(255,252,249,0.92),rgba(248,238,231,0.96))] p-6">
          <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
            {dashboardSummary.greeting}
          </p>
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-[2rem] font-semibold tracking-[-0.04em] text-[color:var(--text)]">
                {dashboardSummary.title}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--text-muted)]">
                {dashboardSummary.description}
              </p>
            </div>
            <Badge>{dashboardSummary.tier}</Badge>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <div className="relative overflow-hidden rounded-[var(--radius-xl)] bg-[linear-gradient(135deg,var(--brand),var(--accent))] p-5 text-white shadow-[var(--shadow-glow)]">
              <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
              <p className="text-sm text-white/84">Ví hoàn tiền</p>
              <p className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
                {dashboardSummary.availableCashback}
              </p>
              <p className="mt-4 max-w-md text-sm leading-6 text-white/84">
                {dashboardSummary.nextPayout}
              </p>
            </div>

            <div className="grid gap-3">
              {statItems.map((item) => (
                <StatCard key={item.label} label={item.label} value={item.value} />
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4">
          <Card className="bg-[rgba(255,250,246,0.72)] p-5">
            <SectionHeader title="Thao tác nhanh" />
            <div className="grid grid-cols-2 gap-3">
              {quickActions.map((action) => (
                <ActionButton
                  key={action.title}
                  type="button"
                  tone="secondary"
                  className="h-auto p-4 text-left"
                  aria-label={action.title}
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[color:var(--accent-soft)] text-lg font-semibold text-[color:var(--brand-strong)]">
                    {action.icon}
                  </div>
                  <p className="mt-3 text-sm font-semibold text-[color:var(--text)]">
                    {action.title}
                  </p>
                  <p className="mt-1 text-xs font-medium leading-5 text-[color:var(--text-muted)]">
                    {action.subtitle}
                  </p>
                </ActionButton>
              ))}
            </div>
          </Card>

          <Card className="bg-[rgba(255,250,246,0.72)] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
              Sàn đang hỗ trợ
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {dashboardSummary.activePlatforms.map((platform) => (
                <Badge key={platform}>{platform}</Badge>
              ))}
            </div>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
              Sắp ra mắt
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {dashboardSummary.upcomingPlatforms.map((platform) => (
                <Badge key={platform} variant="neutral">
                  {platform}
                </Badge>
              ))}
            </div>
          </Card>
        </div>
      </section>

      <Card className="bg-[rgba(255,250,246,0.72)] p-5">
        <SectionHeader
          title="Đơn hàng gần đây"
          description="Bảng tóm tắt giao dịch gần nhất"
        />

        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--line)] bg-white/70">
          <div className="grid grid-cols-[1.2fr_1.4fr_0.8fr_0.9fr_0.8fr] gap-3 border-b border-[color:var(--line)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
            <span>Cửa hàng</span>
            <span>Sản phẩm</span>
            <span>Trạng thái</span>
            <span>Giá trị</span>
            <span>Thời gian</span>
          </div>
          <div className="divide-y divide-[color:var(--line)]">
            {recentOrders.map((order) => (
              <div
                key={`${order.store}-${order.time}`}
                className="grid grid-cols-[1.2fr_1.4fr_0.8fr_0.9fr_0.8fr] gap-3 px-4 py-4 text-sm"
              >
                <span className="font-semibold text-[color:var(--text)]">
                  {order.store}
                </span>
                <span className="font-medium text-[color:var(--text-muted)]">
                  {order.item}
                </span>
                <span className="inline-flex w-fit rounded-full bg-[rgba(216,138,82,0.12)] px-3 py-1 text-xs font-semibold text-[color:var(--brand-strong)]">
                  {order.status}
                </span>
                <span className="font-semibold text-[color:var(--success)]">
                  {order.amount}
                </span>
                <span className="font-medium text-[color:var(--text-muted)]">
                  {order.time}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );

  return (
    <ResponsiveAppShell desktopContent={desktopContent}>
      <div className="h-1 sm:h-0" aria-hidden="true" />

      <section className="mb-4 scroll-mt-24">
        <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
          {dashboardSummary.greeting}
        </p>
        <div className="surface-card overflow-hidden bg-[linear-gradient(180deg,rgba(255,252,249,0.9),rgba(248,238,231,0.92))] p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-[1.75rem] font-semibold tracking-[-0.04em] text-[color:var(--text)]">
                {dashboardSummary.title}
              </h1>
              <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
                {dashboardSummary.description}
              </p>
            </div>
            <Badge>{dashboardSummary.tier}</Badge>
          </div>

          <div className="relative overflow-hidden rounded-[var(--radius-xl)] bg-[linear-gradient(135deg,var(--brand),var(--accent))] p-4 text-white shadow-[var(--shadow-glow)]">
            <div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
            <p className="text-sm text-white/84">Số dư hoàn tiền</p>
            <p className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
              {dashboardSummary.availableCashback}
            </p>
            <p className="mt-4 text-sm text-white/84">
              {dashboardSummary.nextPayout}
            </p>
          </div>
        </div>
      </section>

      <section className="mb-4 grid grid-cols-3 gap-3 xl:hidden">
        {statItems.map((item) => (
          <StatCard key={item.label} label={item.label} value={item.value} />
        ))}
      </section>

      <section className="mb-4">
        <SectionHeader title="Thao tác nhanh" />
        <div className="grid grid-cols-3 gap-3">
          {quickActions.map((action) => (
            <ActionButton
              key={action.title}
              type="button"
              tone="secondary"
              className="h-auto p-3 text-left"
              aria-label={action.title}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[color:var(--accent-soft)] text-lg font-semibold text-[color:var(--brand-strong)]">
                {action.icon}
              </div>
              <p className="mt-3 text-sm font-semibold text-[color:var(--text)]">
                {action.title}
              </p>
              <p className="mt-1 text-xs font-medium text-[color:var(--text-muted)]">
                {action.subtitle}
              </p>
            </ActionButton>
          ))}
        </div>
      </section>

      <Card className="mb-4 bg-[rgba(255,250,246,0.62)] p-4">
        <div className="grid gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
              Sàn đang hỗ trợ
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {dashboardSummary.activePlatforms.map((platform) => (
                <Badge key={platform}>{platform}</Badge>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
              Sắp ra mắt
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {dashboardSummary.upcomingPlatforms.map((platform) => (
                <Badge key={platform} variant="neutral">
                  {platform}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <section className="pb-8">
        <SectionHeader title="Đơn hàng gần đây" />
        <div className="grid gap-3">
          {recentOrders.map((order) => (
            <article
              key={`${order.store}-${order.time}`}
              className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.86)] p-4 shadow-[var(--shadow-sm)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-[color:var(--text)]">
                    {order.store}
                  </p>
                  <p className="mt-1 text-sm font-medium text-[color:var(--text-muted)]">
                    {order.item}
                  </p>
                </div>
                <p className="text-sm font-semibold text-[color:var(--success)]">
                  {order.amount}
                </p>
              </div>
              <div className="mt-4 flex items-center justify-between text-sm">
                <Badge>{order.status}</Badge>
                <span className="font-medium text-[color:var(--text-muted)]">
                  {order.time}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-[color:var(--line)] pt-3 text-sm">
                <span className="font-medium text-[color:var(--text-muted)]">
                  Giá trị đơn
                </span>
                <span className="font-medium text-[color:var(--text)]">
                  {order.total}
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </ResponsiveAppShell>
  );
}
