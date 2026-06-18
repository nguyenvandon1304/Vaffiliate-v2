import type { CampaignDetail } from "@/types/affiliate";

type Props = {
  trackingSettings: CampaignDetail["trackingSettings"];
};

export default function CampaignTrackingCard({ trackingSettings }: Props) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.88)] p-5 shadow-[var(--shadow-sm)]">
      <p className="text-sm font-medium text-[color:var(--text-muted)]">Cấu hình tracking</p>
      <dl className="mt-3 space-y-3 text-sm">
        <div className="flex items-start justify-between gap-4">
          <dt className="text-[color:var(--text-muted)]">Base URL</dt>
          <dd className="break-all text-right font-medium text-[color:var(--text)]">
            {trackingSettings.baseUrl}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-4">
          <dt className="text-[color:var(--text-muted)]">Đích mặc định</dt>
          <dd className="break-all text-right font-medium text-[color:var(--text)]">
            {trackingSettings.defaultDestinationUrl}
          </dd>
        </div>
        <div>
          <dt className="text-[color:var(--text-muted)]">Tham số hỗ trợ</dt>
          <dd className="mt-2 flex flex-wrap justify-end gap-2">
            {trackingSettings.supportedParameters.map((param) => (
              <span
                key={param}
                className="rounded-full border border-[rgba(124,63,44,0.12)] bg-[rgba(255,250,246,0.86)] px-3 py-1 text-xs font-semibold text-[color:var(--text-muted)]"
              >
                {param}
              </span>
            ))}
          </dd>
        </div>
      </dl>
    </div>
  );
}
