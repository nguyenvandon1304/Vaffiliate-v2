export default function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[rgba(124,63,44,0.1)] bg-[rgba(255,250,246,0.72)] p-5 shadow-[var(--shadow-sm)]">
      <p className="text-base font-semibold text-[color:var(--text)]">{title}</p>
      <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">{description}</p>
    </div>
  );
}
