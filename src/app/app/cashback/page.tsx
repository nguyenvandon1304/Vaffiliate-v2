import AppShell from "@/components/layout/AppShell";
import AppSection from "@/components/layout/AppSection";
import PageHeader from "@/components/layout/PageHeader";
import ShopeeCashbackPreviewForm from "@/features/cashback/ShopeeCashbackPreviewForm";
import CashbackFilters from "@/features/cashback/CashbackFilters";
import CashbackHistoryTable from "@/features/cashback/CashbackHistoryTable";
import CashbackStats from "@/features/cashback/CashbackStats";
import { loadCashbackAsync } from "@/hooks/loadCashbackAsync";
import { isApprovedStatus } from "@/lib/analytics/format";
import type { CashbackPlatformName, CashbackStat } from "@/types/cashback";

const supportedPlatforms: CashbackPlatformName[] = ["Shopee", "TikTok Shop"];

function parseAmount(amount: string): number {
  return Number(amount.replace(/[^\d]/g, ""));
}

function formatVnd(amount: number): string {
  return `${Math.round(amount).toLocaleString("de-DE")}đ`;
}

export default async function CashbackPage() {
  const { history } = await loadCashbackAsync();

  const supportedHistory = history.filter((item) =>
    supportedPlatforms.includes(item.platform)
  );

  const available = supportedHistory
    .filter((item) => isApprovedStatus(item.status))
    .reduce((sum, item) => sum + parseAmount(item.amount), 0);
  const shopeeTotal = supportedHistory
    .filter((item) => item.platform === "Shopee")
    .reduce((sum, item) => sum + parseAmount(item.amount), 0);
  const tiktokTotal = supportedHistory
    .filter((item) => item.platform === "TikTok Shop")
    .reduce((sum, item) => sum + parseAmount(item.amount), 0);

  const stats: CashbackStat[] = [
    { label: "Tiền hoàn khả dụng", value: formatVnd(available) },
    { label: "Tiền hoàn Shopee", value: formatVnd(shopeeTotal) },
    { label: "Tiền hoàn TikTok Shop", value: formatVnd(tiktokTotal) },
  ];

  const platformsInUse = supportedPlatforms.filter((platform) =>
    supportedHistory.some((item) => item.platform === platform)
  );

  const filters = ["Tất cả", ...platformsInUse];

  const desktopContent = (
    <div className="space-y-6">
      <section className="surface-card overflow-hidden bg-[linear-gradient(180deg,rgba(255,252,249,0.92),rgba(248,238,231,0.96))] p-6">
        <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
          Kiểm tra và tạo link hoàn tiền từ Shopee, TikTok Shop
        </p>
        <h1 className="text-[2rem] font-semibold tracking-[-0.04em] text-[color:var(--text)]">
          Dán link nhận hoàn tiền
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[color:var(--text-muted)]">
          Tiền hoàn chỉ khả dụng sau khi đơn hàng được ghi nhận, đối soát và sàn xác nhận.
        </p>
      </section>

      <CashbackStats stats={stats} />

      <ShopeeCashbackPreviewForm />

      <CashbackFilters filters={filters} />
      <CashbackHistoryTable history={supportedHistory} />

      <section>
        <div className="rounded-[var(--radius-xl)] border border-[rgba(124,63,44,0.1)] bg-[rgba(255,250,246,0.72)] p-5 shadow-[var(--shadow-sm)]">
          <h2 className="mb-3 text-base font-semibold text-[color:var(--text)]">
            Sắp ra mắt
          </h2>
          <div className="flex flex-wrap gap-2">
            {["Shopee Food", "Lazada", "Tiki", "Sendo"].map((item) => (
              <span
                key={item}
                className="rounded-full border border-[rgba(124,63,44,0.12)] bg-[rgba(255,252,249,0.74)] px-3 py-1 text-xs font-medium text-[color:var(--text-muted)] opacity-75"
                aria-disabled="true"
              >
                {item}
              </span>
            ))}
          </div>
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
              Kiểm tra và tạo link hoàn tiền từ Shopee, TikTok Shop
            </p>
          }
          title="Dán link nhận hoàn tiền"
          description="Tiền hoàn chỉ khả dụng sau khi đơn hàng được ghi nhận, đối soát và sàn xác nhận."
        />
      </AppSection>

      <AppSection>
        <CashbackStats stats={stats} />
      </AppSection>

      <AppSection>
        <ShopeeCashbackPreviewForm />
      </AppSection>

      <AppSection>
        <CashbackFilters filters={filters} />
      </AppSection>
      <CashbackHistoryTable history={supportedHistory} />

      <AppSection className="mt-4 pb-8">
        <div className="rounded-[var(--radius-xl)] border border-[rgba(124,63,44,0.1)] bg-[rgba(255,250,246,0.62)] p-4 shadow-[var(--shadow-sm)]">
          <h2 className="mb-3 text-base font-semibold text-[color:var(--text)]">
            Sắp ra mắt
          </h2>
          <div className="flex flex-wrap gap-2">
            {["Shopee Food", "Lazada", "Tiki", "Sendo"].map((item) => (
              <span
                key={item}
                className="cursor-not-allowed rounded-full border border-[rgba(124,63,44,0.12)] bg-[rgba(255,252,249,0.74)] px-3 py-1 text-xs font-medium text-[color:var(--text-muted)] opacity-75"
                aria-disabled="true"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </AppSection>
    </AppShell>
  );
}
