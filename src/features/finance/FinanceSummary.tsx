import StatCard from "@/components/ui/StatCard";
import type { FinanceSummary as FinanceSummaryData } from "@/types/finance";

type FinanceSummaryProps = {
  summary: FinanceSummaryData;
};

export default function FinanceSummary({ summary }: FinanceSummaryProps) {
  return (
    <section className="mb-4 grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3">
      {summary.map((item, index) => (
        <div
          key={item.label}
          className={`min-w-0 [&>div]:h-full ${
            index === 2 ? "col-span-2 sm:col-span-1" : ""
          }`}
        >
          <StatCard label={item.label} value={item.value} />
        </div>
      ))}
    </section>
  );
}
