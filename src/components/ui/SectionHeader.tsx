export default function SectionHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-base font-semibold text-[color:var(--text)]">{title}</h2>
      {description ? (
        <p className="text-sm text-[color:var(--text-muted)]">{description}</p>
      ) : null}
    </div>
  );
}
