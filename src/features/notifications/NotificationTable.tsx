import Badge from "@/components/ui/Badge";
import type { NotificationItem, NotificationType } from "@/types/notification";

const typeLabels: Record<NotificationType, string> = {
  order_recorded: "Đơn hàng mới",
  commission_approved: "Hoa hồng được duyệt",
  commission_paid: "Hoa hồng đã thanh toán",
  campaign_new: "Chiến dịch mới",
  offer_new: "Ưu đãi mới",
};

function formatCreatedAt(value: string): string {
  const [datePart, timePart = ""] = value.split("T");
  const [year, month, day] = datePart.split("-");
  if (!year || !month || !day) return value;
  const [hour, minute] = timePart.split(":");
  const time = hour && minute ? ` ${hour}:${minute}` : "";
  return `${day}/${month}/${year}${time}`;
}

export default function NotificationTable({
  notifications,
}: {
  notifications: NotificationItem[];
}) {
  return (
    <section className="pb-8">
      <div className="grid gap-3">
        {notifications.map((notification) => (
          <article
            key={notification.id}
            className={`rounded-[var(--radius-xl)] border bg-[rgba(255,252,249,0.86)] p-4 shadow-[var(--shadow-sm)] ${
              notification.isRead
                ? "border-[color:var(--line)]"
                : "border-[rgba(216,138,82,0.4)] bg-[rgba(255,250,246,0.96)]"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                {!notification.isRead && (
                  <span
                    className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[color:var(--brand-strong)]"
                    aria-label="Chưa đọc"
                  />
                )}
                <div>
                  <p className="font-semibold text-[color:var(--text)]">{notification.title}</p>
                  <p className="mt-1 text-sm leading-6 text-[color:var(--text-muted)]">
                    {notification.description}
                  </p>
                </div>
              </div>
              <Badge variant="neutral">{typeLabels[notification.type]}</Badge>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-[color:var(--line)] pt-3 text-sm">
              <span className="rounded-full bg-[rgba(216,138,82,0.12)] px-3 py-1 font-medium text-[color:var(--brand-strong)]">
                {notification.platform}
              </span>
              <span className="font-medium text-[color:var(--text-muted)]">
                {formatCreatedAt(notification.createdAt)}
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
