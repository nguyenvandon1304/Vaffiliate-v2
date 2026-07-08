import AppShell from "@/components/layout/AppShell";
import AppSection from "@/components/layout/AppSection";
import PageHeader from "@/components/layout/PageHeader";
import ShopeeCashbackEntrySteps from "@/features/cashback/ShopeeCashbackEntrySteps";
import ShopeeCashbackPreviewForm from "@/features/cashback/ShopeeCashbackPreviewForm";
import ShopeeCashbackTrustInstructions from "@/features/cashback/ShopeeCashbackTrustInstructions";
import ShopeePopularPrograms from "@/features/cashback/ShopeePopularPrograms";
import CashbackFilters from "@/features/cashback/CashbackFilters";
import CashbackHistoryTable from "@/features/cashback/CashbackHistoryTable";
import CashbackStats from "@/features/cashback/CashbackStats";
import { loadCashbackAsync } from "@/hooks/loadCashbackAsync";
import { isApprovedStatus } from "@/lib/analytics/format";
import { createClient } from "@/lib/supabase/server";
import { listShopeeProgramCardsAsync } from "@/services/shopee-programs.service";
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

// Phase 20H.3e -- polished hero copy. The framing intentionally says
// "hoa hong Shopee" rather than "gia tri san pham" so the buyer does
// not read the 60% figure as a guarantee that Vaffiliate refunds 60%
// of the product price. The hard math is in
// `ShopeeCashbackPreviewForm` and `ShopeeCashbackTrustInstructions`.
const ENTRY_HERO_EYEBROW = "Mua s\u1eafm ho\u00e0n ti\u1ec1n Shopee";
const ENTRY_HERO_TITLE = "Ho\u00e0n l\u1ea1i \u0111\u1ebfn 60% hoa h\u1ed3ng Shopee";
const ENTRY_HERO_DESCRIPTION =
  "D\u00e1n link s\u1ea3n ph\u1ea9m Shopee g\u1ed1c \u2014 Vaffiliate l\u1ea5y \u1ea3nh, t\u00ean, gi\u00e1 v\u00e0 m\u1ee9c ho\u00e0n ti\u1ec1n d\u1ef1 ki\u1ebfn theo hoa h\u1ed3ng Shopee. Mua qua link ho\u00e0n ti\u1ec1n c\u1ee7a Vaffiliate \u0111\u1ec3 nh\u1eadn ho\u00e0n ti\u1ec1n khi Shopee \u0111\u1ed1i so\u00e1t xong.";

function parseAmount(amount: string): number {
  return Number(amount.replace(/[^\d]/g, ""));
}

function formatVnd(amount: number): string {
  return `${Math.round(amount).toLocaleString("de-DE")}đ`;
}

export default async function CashbackPage() {
  const [{ history }, supabase, programCards] = await Promise.all([
    loadCashbackAsync(),
    createClient(),
    listShopeeProgramCardsAsync(),
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
    { label: "Ti\u1ec1n ho\u00e0n kh\u1ea3 d\u1ee5ng", value: formatVnd(available) },
    { label: "Ti\u1ec1n ho\u00e0n Shopee", value: formatVnd(shopeeTotal) },
    { label: "Ti\u1ec1n ho\u00e0n TikTok Shop", value: formatVnd(tiktokTotal) },
  ];

  const platformsInUse = supportedPlatforms.filter((platform) =>
    supportedHistory.some((item) => item.platform === platform)
  );

  const filters = ["T\u1ea5t c\u1ea3", ...platformsInUse];

  const desktopContent = (
    <div className="space-y-6">
      <section
        data-testid="shopee-cashback-entry-hero"
        className="surface-card overflow-hidden bg-[linear-gradient(180deg,rgba(255,252,249,0.92),rgba(248,238,231,0.96))] p-6"
      >
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

      <ShopeeCashbackEntrySteps />

      <ShopeeCashbackPreviewForm isAuthenticated={isAuthenticated} />

      <ShopeeCashbackTrustInstructions />

      <ShopeePopularPrograms cards={programCards} />

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
        <ShopeeCashbackEntrySteps />
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

      <AppSection>
        <ShopeePopularPrograms cards={programCards} />
      </AppSection>

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
