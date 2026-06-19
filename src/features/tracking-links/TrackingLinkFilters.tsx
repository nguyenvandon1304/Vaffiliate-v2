type TrackingLinkFiltersProps = {
  filters: { value: string; label: string }[];
  activeFilter: string;
};

export default function TrackingLinkFilters({ filters, activeFilter }: TrackingLinkFiltersProps) {
  return (
    <section className="mb-4 rounded-[var(--radius-xl)] border border-[rgba(124,63,44,0.1)] bg-[rgba(255,250,246,0.72)] p-5 shadow-[var(--shadow-sm)]">
      <div className="no-scrollbar mb-4 -mx-1 flex flex-nowrap gap-2 overflow-x-auto px-1 pb-1">
        {filters.map((filter) => {
          const isActive = activeFilter === filter.value;
          return (
            <a
              key={filter.value}
              href={filter.value === "all" ? "/app/tracking-links" : `/app/tracking-links?platform=${filter.value}`}
              aria-current={isActive ? "page" : undefined}
              className={`whitespace-nowrap rounded-full px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] ${
                isActive
                  ? "bg-[rgba(216,138,82,0.14)] text-[color:var(--brand-strong)]"
                  : "border border-[rgba(124,63,44,0.12)] text-[color:var(--text-muted)] hover:border-[rgba(124,63,44,0.3)]"
              }`}
            >
              {filter.label}
            </a>
          );
        })}
      </div>
    </section>
  );
}

export type { TrackingLinkFiltersProps };
