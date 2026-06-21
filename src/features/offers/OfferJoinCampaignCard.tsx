import Link from "next/link";
import Badge from "@/components/ui/Badge";
import type { OfferDetail } from "@/types/affiliate";
import type { OfferId } from "@/types/ids";

type Props = {
  joinStatus: OfferDetail["joinStatus"];
  campaignName: string;
  offerId: OfferId;
};

const statusLabels: Record<OfferDetail["joinStatus"], string> = {
  not_joined: "Chưa khả dụng",
  joined: "Đang khả dụng",
  paused: "Đang tạm dừng",
};

const statusVariant: Record<
  OfferDetail["joinStatus"],
  "default" | "success" | "warning" | "neutral"
> = {
  not_joined: "neutral",
  joined: "success",
  paused: "warning",
};

export default function OfferJoinCampaignCard({ joinStatus, campaignName, offerId }: Props) {
  const isJoined = joinStatus === "joined";
  const ctaHref = `/app/tracking-links/generator/${offerId}`;

  return (
    <div className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[linear-gradient(180deg,rgba(255,252,249,0.92),rgba(248,238,231,0.96))] p-5 shadow-[var(--shadow-sm)]">
      <p className="text-sm font-medium text-[color:var(--text-muted)]">Trạng thái chương trình</p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-base font-semibold text-[color:var(--text)]">{campaignName}</span>
        <Badge variant={statusVariant[joinStatus]}>{statusLabels[joinStatus]}</Badge>
      </div>
      <p className="mt-3 text-sm leading-6 text-[color:var(--text-muted)]">
        {joinStatus === "joined"
          ? "Chương trình đang khả dụng. Bạn có thể tạo link hoàn tiền để mua hàng và được ghi nhận đơn."
          : joinStatus === "paused"
            ? "Chương trình đang tạm dừng. Tính năng tạo link hoàn tiền sẽ mở lại khi sàn kích hoạt."
            : "Chương trình chưa khả dụng cho tài khoản của bạn."}
      </p>
      {isJoined ? (
        <Link
          href={ctaHref}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[color:var(--brand)] px-4 py-3 text-sm font-semibold text-white shadow-[var(--shadow-sm)] transition hover:opacity-90"
        >
          Tạo link hoàn tiền
          <span aria-hidden="true">→</span>
        </Link>
      ) : (
        <button
          type="button"
          disabled
          aria-disabled="true"
          title="Tính năng chưa khả dụng"
          className="mt-4 inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-full bg-[rgba(124,63,44,0.12)] px-4 py-3 text-sm font-semibold text-[color:var(--text-muted)]"
        >
          {joinStatus === "paused" ? "Tạm dừng" : "Chưa khả dụng"}
          <span aria-hidden="true">→</span>
        </button>
      )}
    </div>
  );
}
