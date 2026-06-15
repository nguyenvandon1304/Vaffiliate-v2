import AppShell from "@/components/layout/AppShell";
import AppSection from "@/components/layout/AppSection";
import PageHeader from "@/components/layout/PageHeader";
import NotificationFilters from "@/features/notifications/NotificationFilters";
import NotificationStats from "@/features/notifications/NotificationStats";
import NotificationTable from "@/features/notifications/NotificationTable";
import { useNotificationAsync } from "@/hooks/useNotificationAsync";
import type { NotificationPlatform, NotificationStat } from "@/types/notification";

const supportedPlatforms: NotificationPlatform[] = ["Shopee", "TikTok Shop"];

export default async function NotificationsPage() {
  const { notifications } = await useNotificationAsync();

  const supportedNotifications = notifications.filter((item) =>
    supportedPlatforms.includes(item.platform)
  );

  const unreadCount = supportedNotifications.filter((item) => !item.isRead).length;
  const shopeeCount = supportedNotifications.filter(
    (item) => item.platform === "Shopee"
  ).length;
  const tiktokCount = supportedNotifications.filter(
    (item) => item.platform === "TikTok Shop"
  ).length;

  const stats: NotificationStat[] = [
    { label: "Tổng thông báo", value: String(supportedNotifications.length) },
    { label: "Chưa đọc", value: String(unreadCount) },
    { label: "Thông báo Shopee", value: String(shopeeCount) },
    { label: "Thông báo TikTok", value: String(tiktokCount) },
  ];

  const platformsInUse = supportedPlatforms.filter((platform) =>
    supportedNotifications.some((item) => item.platform === platform)
  );

  const filters = ["Tất cả", ...platformsInUse];

  const desktopContent = (
    <div className="space-y-6">
      <section className="surface-card overflow-hidden bg-[linear-gradient(180deg,rgba(255,252,249,0.92),rgba(248,238,231,0.96))] p-6">
        <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
          Cập nhật đơn hàng, hoa hồng và ưu đãi từ Shopee và TikTok Shop
        </p>
        <h1 className="text-[2rem] font-semibold tracking-[-0.04em] text-[color:var(--text)]">
          Trung tâm thông báo
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[color:var(--text-muted)]">
          Theo dõi các cập nhật mới nhất về đơn hàng được ghi nhận, hoa hồng được duyệt và thanh toán, cùng chiến dịch và ưu đãi Shopee, TikTok Shop.
        </p>
      </section>

      <NotificationStats stats={stats} />
      <NotificationFilters filters={filters} />
      <NotificationTable notifications={supportedNotifications} />
    </div>
  );

  return (
    <AppShell desktopContent={desktopContent}>
      <AppSection>
        <PageHeader
          eyebrow={
            <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
              Cập nhật đơn hàng, hoa hồng và ưu đãi từ Shopee và TikTok Shop
            </p>
          }
          title="Trung tâm thông báo"
          description="Theo dõi các cập nhật mới nhất về đơn hàng được ghi nhận, hoa hồng được duyệt và thanh toán, cùng chiến dịch và ưu đãi Shopee, TikTok Shop."
        />
      </AppSection>
      <AppSection>
        <NotificationStats stats={stats} />
      </AppSection>
      <AppSection>
        <NotificationFilters filters={filters} />
      </AppSection>
      <NotificationTable notifications={supportedNotifications} />
    </AppShell>
  );
}
