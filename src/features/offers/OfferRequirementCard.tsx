import type { OfferDetail } from "@/types/affiliate";

type Props = {
  requirements: OfferDetail["requirements"];
};

export default function OfferRequirementCard({ requirements }: Props) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.88)] p-5 shadow-[var(--shadow-sm)]">
      <p className="text-sm font-medium text-[color:var(--text-muted)]">Yêu cầu chương trình</p>
      <dl className="mt-3 space-y-3 text-sm">
        {requirements.map((req) => (
          <div key={req.label} className="flex items-start justify-between gap-4">
            <dt className="text-[color:var(--text-muted)]">{req.label}</dt>
            <dd className="text-right font-medium text-[color:var(--text)]">{req.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
