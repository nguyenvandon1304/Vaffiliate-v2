import AppShell from "@/components/layout/AppShell";
import AppSection from "@/components/layout/AppSection";
import PageHeader from "@/components/layout/PageHeader";
import ClickFilters from "@/features/clicks/ClickFilters";
import ClickStats from "@/features/clicks/ClickStats";
import ClickTable from "@/features/clicks/ClickTable";
import { useClickAsync } from "@/hooks/useClickAsync";
import type { ClickPlatform } from "@/types/click";

const SUPPORTED_PLATFORMS: ClickPlatform[] = [
  "Shopee",
  "TikTok Shop",
];

export default async function ClicksPage() {
  const { clicks } = await useClickAsync();

  const supportedClicks = clicks.filter((item) =>
    SUPPORTED_PLATFORMS.includes(item.platform)
  );

  const shopeeCount = supportedClicks.filter(
    (item) => item.platform === "Shopee"
  ).length;

  const tiktokCount = supportedClicks.filter(
    (item) => item.platform === "TikTok Shop"
  ).length;

  const uniqueCount = supportedClicks.filter(
    (item) => item.isUnique
  ).length;

  const stats = [
    {
      label: "Tổng lượt nhấp",
      value: String(supportedClicks.length),
    },
    {
      label: "Lượt nhấp Shopee",
      value: String(shopeeCount),
    },
    {
      label: "Lượt nhấp TikTok",
      value: String(tiktokCount),
    },
    {
      label: "Lượt nhấp duy nhất",
      value: String(uniqueCount),
    },
  ];

  const platformsInUse = SUPPORTED_PLATFORMS.filter((platform) =>
    supportedClicks.some((item) => item.platform === platform)
  );

  const filters = ["Tất cả", ...platformsInUse];

  const desktopContent = (
    <div className="space-y-6">
      <section className="surface-card overflow-hidden bg-[linear-gradient(180deg,rgba(255,252,249,0.92),rgba(248,238,231,0.96))] p-6">
        <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
          Theo dõi lượt nhấp từ link Shopee và TikTok Shop
        </p>

        <h1 className="text-[2rem] font-semibold tracking-[-0.04em] text-[color:var(--text)]">
          Trung tâm lượt nhấp
        </h1>

        <p className="mt-3 max-w-3xl text-sm leading-6 text-[color:var(--text-muted)]">
          Xem số lượt nhấp ghi nhận từ các tracking link Shopee và TikTok Shop,
          kèm tỷ lệ lượt nhấp duy nhất.
        </p>
      </section>

      <ClickStats stats={stats} />
      <ClickFilters filters={filters} />
      <ClickTable clicks={supportedClicks} />
    </div>
  );

  return (
    <AppShell desktopContent={desktopContent}>
      <AppSection>
        <PageHeader
          eyebrow={
            <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
              Theo dõi lượt nhấp từ link Shopee và TikTok Shop
            </p>
          }
          title="Trung tâm lượt nhấp"
          description="Xem số lượt nhấp ghi nhận từ các tracking link Shopee và TikTok Shop, kèm tỷ lệ lượt nhấp duy nhất."
        />
      </AppSection>

      <AppSection>
        <ClickStats stats={stats} />
      </AppSection>

      <AppSection>
        <ClickFilters filters={filters} />
      </AppSection>

      <ClickTable clicks={supportedClicks} />
    </AppShell>
  );
}