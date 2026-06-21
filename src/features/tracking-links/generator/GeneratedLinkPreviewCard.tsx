import Badge from "@/components/ui/Badge";
import CopyTrackingLinkButton from "@/features/tracking-links/generator/CopyTrackingLinkButton";

type Props = {
  shortCode: string;
  fullUrl: string;
  commissionRate: string;
  offerTitle: string;
  isPreview?: boolean;
};

export default function GeneratedLinkPreviewCard({
  shortCode,
  fullUrl,
  commissionRate,
  offerTitle,
  isPreview = false,
}: Props) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[linear-gradient(180deg,rgba(255,252,249,0.92),rgba(248,238,231,0.96))] p-5 shadow-[var(--shadow-sm)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-[color:var(--text-muted)]">
            {isPreview ? "Bản xem trước" : "Link hoàn tiền"}
          </p>
          {isPreview && (
            <Badge variant="warning">Chưa lưu</Badge>
          )}
        </div>
        <Badge variant="success">{commissionRate}</Badge>
      </div>
      <p className="mt-3 text-base font-semibold tracking-tight text-[color:var(--text)]">
        {shortCode}
      </p>
      <p className="mt-1 text-sm text-[color:var(--text-muted)]">
        Cho {offerTitle}
      </p>
      <p className="mt-4 break-all rounded-2xl border border-[rgba(124,63,44,0.1)] bg-[rgba(255,250,246,0.86)] px-3 py-2 text-sm font-mono font-medium text-[color:var(--text)]">
        {fullUrl}
      </p>
      {!isPreview && (
        <div className="mt-3 flex justify-end">
          <CopyTrackingLinkButton url={fullUrl} />
        </div>
      )}
      <p className="mt-3 text-sm leading-6 text-[color:var(--text-muted)]">
        {isPreview
          ? "Đây là bản xem trước. Link chưa được lưu. Tính năng lưu link sẽ được hoàn thiện ở bước tiếp theo."
          : "Dùng link này để mua hàng trên sàn. Tiền hoàn của giao dịch hợp lệ sẽ được ghi nhận vào ví của bạn."}
      </p>
    </div>
  );
}
