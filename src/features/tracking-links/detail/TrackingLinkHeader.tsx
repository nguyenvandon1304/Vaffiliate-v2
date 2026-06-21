import Badge from "@/components/ui/Badge";
import type {
  Campaign,
  Offer,
  TrackingLink,
  TrackingLinkStatus,
} from "@/types/affiliate";

type Props = {
  trackingLink: TrackingLink;
  offer: Offer;
  campaign: Campaign;
  advertiserName: string;
  headingLevel?: "h1" | "h2";
};

const statusLabels: Record<TrackingLinkStatus, string> = {
  active: "Đang hoạt động",
  paused: "Tạm dừng",
  disabled: "Đã vô hiệu hóa",
};

const statusVariant: Record<
  TrackingLinkStatus,
  "default" | "success" | "warning" | "neutral"
> = {
  active: "success",
  paused: "warning",
  disabled: "neutral",
};

export default function TrackingLinkHeader({
  trackingLink,
  offer,
  campaign,
  advertiserName,
  headingLevel: Heading = "h1",
}: Props) {
  return (
    <div className="surface-card flex flex-col gap-4 bg-[linear-gradient(180deg,rgba(255,252,249,0.92),rgba(248,238,231,0.96))] p-6 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium text-[color:var(--text-muted)]">
          {advertiserName} · {offer.title}
        </p>
        <Heading className="mt-2 truncate text-2xl font-semibold tracking-[-0.04em] text-[color:var(--text)] md:text-[1.75rem]">
          Chi tiết link hoàn tiền
        </Heading>
        <p className="mt-2 text-sm text-[color:var(--text-muted)]">
          Mã link {trackingLink.shortCode} · Chiến dịch {campaign.name} · Tạo ngày {trackingLink.createdAt}
        </p>
        <p className="mt-2 break-all text-xs text-[color:var(--text-muted)]">
          {trackingLink.trackingUrl ?? trackingLink.url ?? "—"}
        </p>
      </div>
      <Badge variant={statusVariant[trackingLink.status]}>
        {statusLabels[trackingLink.status]}
      </Badge>
    </div>
  );
}
