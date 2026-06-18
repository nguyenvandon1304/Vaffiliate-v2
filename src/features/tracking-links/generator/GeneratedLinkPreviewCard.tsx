import Badge from "@/components/ui/Badge";

type Props = {
  shortCode: string;
  fullUrl: string;
  commissionRate: string;
  offerTitle: string;
};

export default function GeneratedLinkPreviewCard({
  shortCode,
  fullUrl,
  commissionRate,
  offerTitle,
}: Props) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[linear-gradient(180deg,rgba(255,252,249,0.92),rgba(248,238,231,0.96))] p-5 shadow-[var(--shadow-sm)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-[color:var(--text-muted)]">Generated tracking link</p>
        <Badge variant="success">{commissionRate}</Badge>
      </div>
      <p className="mt-3 text-base font-semibold tracking-tight text-[color:var(--text)]">
        {shortCode}
      </p>
      <p className="mt-1 text-sm text-[color:var(--text-muted)]">Mã tracking cho {offerTitle}</p>
      <p className="mt-4 break-all rounded-2xl border border-[rgba(124,63,44,0.1)] bg-[rgba(255,250,246,0.86)] px-3 py-2 text-sm font-mono font-medium text-[color:var(--text)]">
        {fullUrl}
      </p>
      <p className="mt-3 text-sm leading-6 text-[color:var(--text-muted)]">
        Sao chép link trên để dán vào blog, mạng xã hội hoặc email. Mọi chuyển đổi từ link này sẽ
        được ghi nhận cho offer tương ứng.
      </p>
    </div>
  );
}
