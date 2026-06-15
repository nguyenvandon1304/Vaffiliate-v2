type ConversionFiltersProps = {
  filters: string[];
};

export default function ConversionFilters({ filters }: ConversionFiltersProps) {
  return (
    <section className="mb-4 rounded-[var(--radius-xl)] border border-[rgba(124,63,44,0.1)] bg-[rgba(255,250,246,0.72)] p-5 shadow-[var(--shadow-sm)]">
      <div className="no-scrollbar mb-4 -mx-1 flex flex-nowrap gap-2 overflow-x-auto px-1 pb-1">
        {filters.map((filter, index) => (
          <button
            key={filter}
            type="button"
            className={`whitespace-nowrap rounded-full px-3 py-2 text-xs font-semibold ${
              index === 0
                ? "bg-[rgba(216,138,82,0.14)] text-[color:var(--brand-strong)]"
                : "border border-[rgba(124,63,44,0.12)] text-[color:var(--text-muted)]"
            }`}
          >
            {filter}
          </button>
        ))}
      </div>
    </section>
  );
}
