import Badge from "@/components/ui/Badge";
import type { OfferDetail } from "@/types/affiliate";

type Props = {
  offerDetail: OfferDetail;
};

const joinStatusLabels: Record<OfferDetail["joinStatus"], string> = {
  not_joined: "Chưa tham gia",
  joined: "Đã tham gia",
  paused: "Tạm dừng",
};

const joinStatusVariants: Record<
  OfferDetail["joinStatus"],
  "default" | "success" | "warning" | "neutral"
> = {
  not_joined: "neutral",
  joined: "success",
  paused: "warning",
};

const categoryLabels: Record<string, string> = {
  "Thời trang": "Thời trang",
  "Làm đẹp": "Làm đẹp",
  "Gia dụng": "Gia dụng",
};

export default function OfferHeader({ offerDetail }: Props) {
  const { offer, advertiser, joinStatus, campaign } = offerDetail;

  return (
    <div className="surface-card flex flex-col gap-4 bg-[linear-gradient(180deg,rgba(255,252,249,0.92),rgba(248,238,231,0.96))] p-6 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium text-[color:var(--text-muted)]">
          {advertiser.platform} · {advertiser.name}
        </p>
        <h1 className="mt-2 truncate text-2xl font-semibold tracking-[-0.04em] text-[color:var(--text)] md:text-[1.75rem]">
          {offer.title}
        </h1>
        <p className="mt-2 text-sm text-[color:var(--text-muted)]">
          {categoryLabels[offer.category ?? ""] ?? offer.category ?? "—"} · Chiến dịch{" "}
          {campaign.name}
        </p>
      </div>
      <Badge variant={joinStatusVariants[joinStatus]}>{joinStatusLabels[joinStatus]}</Badge>
    </div>
  );
}
