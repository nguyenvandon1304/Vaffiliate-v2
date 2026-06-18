type Param = {
  label: string;
  value: string;
};

type Props = {
  parameters: Param[];
};

export default function TrackingParametersCard({ parameters }: Props) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.88)] p-5 shadow-[var(--shadow-sm)]">
      <p className="text-sm font-medium text-[color:var(--text-muted)]">Tracking parameters</p>
      <dl className="mt-3 space-y-2 text-sm">
        {parameters.map((param) => (
          <div key={param.label} className="flex items-center justify-between gap-4">
            <dt className="font-mono text-[color:var(--text-muted)]">{param.label}</dt>
            <dd className="break-all text-right font-medium text-[color:var(--text)]">
              {param.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
