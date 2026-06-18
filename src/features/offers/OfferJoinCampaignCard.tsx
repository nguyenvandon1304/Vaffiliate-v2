import Badge from "@/components/ui/Badge";
import type { OfferDetail } from "@/types/affiliate";

type Props = {
  joinStatus: OfferDetail["joinStatus"];
  campaignName: string;
};

const statusLabels: Record<OfferDetail["joinStatus"], string> = {
  not_joined: "Chưa tham gia",
  joined: "Đã tham gia chiến dịch",
  paused: "Chiến dịch đang tạm dừng",
};

const statusVariant: Record<
  OfferDetail["joinStatus"],
  "default" | "success" | "warning" | "neutral"
> = {
  not_joined: "neutral",
  joined: "success",
  paused: "warning",
};

export default function OfferJoinCampaignCard({ joinStatus, campaignName }: Props) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[linear-gradient(180deg,rgba(255,252,249,0.92),rgba(248,238,231,0.96))] p-5 shadow-[var(--shadow-sm)]">
      <p className="text-sm font-medium text-[color:var(--text-muted)]">Trạng thái tham gia</p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-base font-semibold text-[color:var(--text)]">{campaignName}</span>
        <Badge variant={statusVariant[joinStatus]}>{statusLabels[joinStatus]}</Badge>
      </div>
      <p className="mt-3 text-sm leading-6 text-[color:var(--text-muted)]">
        {joinStatus === "joined"
          ? "Bạn đang là publisher của chiến dịch này. Có thể tạo tracking link ở phase tiếp theo."
          : joinStatus === "paused"
            ? "Chiến dịch hiện đang tạm dừng. Tính năng tham gia sẽ mở lại khi advertiser kích hoạt."
            : "Tính năng tham gia chiến dịch và tạo tracking link sẽ ra mắt ở phase tiếp theo."}
      </p>
      <button
        type="button"
        disabled
        aria-disabled="true"
        title="Tính năng sẽ ra mắt ở phase tiếp theo"
        className="mt-4 inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-full bg-[rgba(124,63,44,0.12)] px-4 py-3 text-sm font-semibold text-[color:var(--text-muted)]"
      >
        Tham gia chiến dịch
        <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}
