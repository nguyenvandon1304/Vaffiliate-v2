export default function SectionHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-3 flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <h2 className="min-w-0 text-base font-semibold text-[color:var(--text)]">
        {title}
      </h2>
      {description ? (
        <p className="min-w-0 text-sm leading-5 text-[color:var(--text-muted)] sm:max-w-[60%] sm:text-right">
          {description}
        </p>
      ) : null}
    </div>
  );
}
