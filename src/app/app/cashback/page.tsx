import AppShell from "@/components/layout/AppShell";
import AppSection from "@/components/layout/AppSection";
import PageHeader from "@/components/layout/PageHeader";
import ShopeeCashbackPreviewForm from "@/features/cashback/ShopeeCashbackPreviewForm";
import ShopeeCashbackTrustInstructions from "@/features/cashback/ShopeeCashbackTrustInstructions";
import CashbackFilters from "@/features/cashback/CashbackFilters";
import CashbackHistoryTable from "@/features/cashback/CashbackHistoryTable";
import CashbackStats from "@/features/cashback/CashbackStats";
import { loadCashbackAsync } from "@/hooks/loadCashbackAsync";
import { isApprovedStatus } from "@/lib/analytics/format";
import { createClient } from "@/lib/supabase/server";
import type { CashbackPlatformName, CashbackStat } from "@/types/cashback";

// Platforms whose cashback history is shown on this page. The buyer
// entry flow itself is scoped to Shopee for Phase 20H.3a; the history
// table continues to surface any historical rows the user already has
// from earlier supported platforms.
const supportedPlatforms: CashbackPlatformName[] = ["Shopee", "TikTok Shop"];

// Phase 20H.3a scopes the entry form to Shopee only. Do not surface
// Lazada / TikTok Shop / Tiki / Sendo etc. on the hero or in the
// preview workflow until those phases ship their own entry pages.
const entrySupportedPlatforms: CashbackPlatformName[] = ["Shopee"];

const ENTRY_HERO_EYEBROW = "Mua sắm hoàn tiền Shopee";
const ENTRY_HERO_TITLE = "Dán link Shopee để kiểm tra hoàn tiền";
const ENTRY_HERO_DESCRIPTION =
  "Dán link sản phẩm Shopee gốc, Vaffiliate lấy ảnh, tên, giá và mức hoàn tiền dự kiến. Mua hàng qua link hoàn tiền của Vaffiliate để nhận hoàn tiền sau khi đơn hàng được Shopee đối soát và ghi nhận.";

function parseAmount(amount: string): number {
  return Number(amount.replace(/[^\d]/g, ""));
}

function formatVnd(amount: number): string {
  return `${Math.round(amount).toLocaleString("de-DE")}đ`;
}

export default async function CashbackPage() {
  const [{ history }, supabase] = await Promise.all([
    loadCashbackAsync(),
    createClient(),
  ]);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthenticated = user !== null;

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
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--brand-strong)]">
          {ENTRY_HERO_EYEBROW}
        </p>
        <h1 className="text-[2rem] font-semibold tracking-[-0.04em] text-[color:var(--text)]">
          {ENTRY_HERO_TITLE}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[color:var(--text-muted)]">
          {ENTRY_HERO_DESCRIPTION}
        </p>

        {entrySupportedPlatforms.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {entrySupportedPlatforms.map((platform) => (
              <span
                key={platform}
                className="inline-flex items-center rounded-full border border-[rgba(124,63,44,0.14)] bg-white/70 px-3 py-1 text-xs font-medium text-[color:var(--text)]"
              >
                {platform}
              </span>
            ))}
          </div>
        ) : null}
      </section>

      <CashbackStats stats={stats} />

      <ShopeeCashbackPreviewForm isAuthenticated={isAuthenticated} />

      <ShopeeCashbackTrustInstructions />

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
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--brand-strong)]">
              {ENTRY_HERO_EYEBROW}
            </p>
          }
          title={ENTRY_HERO_TITLE}
          description={ENTRY_HERO_DESCRIPTION}
        />
      </AppSection>

      <AppSection>
        <CashbackStats stats={stats} />
      </AppSection>

      <AppSection>
        <ShopeeCashbackPreviewForm isAuthenticated={isAuthenticated} />
      </AppSection>

      <AppSection>
        <ShopeeCashbackTrustInstructions />
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
