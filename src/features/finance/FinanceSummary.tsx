import StatCard from "@/components/ui/StatCard";
import type { FinanceSummary as FinanceSummaryData } from "@/types/finance";

type FinanceSummaryProps = {
  summary: FinanceSummaryData;
};

export default function FinanceSummary({ summary }: FinanceSummaryProps) {
  return (
    <section className="mb-4 grid grid-cols-3 gap-3">
      {summary.map((item) => (
        <StatCard key={item.label} label={item.label} value={item.value} />
      ))}
    </section>
  );
}
