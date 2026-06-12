import { orderFilters } from "@/lib/mock-data";

export default function OrdersFilters() {
  return (
    <section className="mb-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-[color:var(--text)]">
          Bộ lọc trạng thái
        </h2>
      </div>
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {orderFilters.map((filter, index) => (
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
