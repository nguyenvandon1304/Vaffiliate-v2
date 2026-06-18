import type { OfferDetail } from "@/types/affiliate";

type Props = {
  trackingRules: OfferDetail["trackingRules"];
};

export default function OfferTrackingCard({ trackingRules }: Props) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.88)] p-5 shadow-[var(--shadow-sm)]">
      <p className="text-sm font-medium text-[color:var(--text-muted)]">Cấu hình tracking</p>
      <dl className="mt-3 space-y-4 text-sm">
        <div className="flex items-start justify-between gap-4">
          <dt className="text-[color:var(--text-muted)]">Thời hạn cookie</dt>
          <dd className="text-right font-medium text-[color:var(--text)]">
            {trackingRules.cookieDurationDays} ngày
          </dd>
        </div>
        <div>
          <dt className="text-[color:var(--text-muted)]">Kênh được phép</dt>
          <dd className="mt-2 flex flex-wrap justify-end gap-2">
            {trackingRules.allowedChannels.map((channel) => (
              <span
                key={channel}
                className="rounded-full border border-[rgba(124,63,44,0.12)] bg-[rgba(255,250,246,0.86)] px-3 py-1 text-xs font-semibold text-[color:var(--text-muted)]"
              >
                {channel}
              </span>
            ))}
          </dd>
        </div>
        <div>
          <dt className="text-[color:var(--text-muted)]">Quy tắc traffic</dt>
          <dd className="mt-2 space-y-1 text-right text-[color:var(--text)]">
            {trackingRules.trafficRules.map((rule) => (
              <p key={rule} className="leading-6">
                {rule}
              </p>
            ))}
          </dd>
        </div>
      </dl>
    </div>
  );
}
