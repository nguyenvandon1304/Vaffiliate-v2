import StatCard from "@/components/ui/StatCard";
import { financeSummary } from "@/lib/mock-data";

export default function FinanceSummary() {
  return (
    <section className="mb-4 grid grid-cols-3 gap-3">
      {financeSummary.map((item) => (
        <StatCard key={item.label} label={item.label} value={item.value} />
      ))}
    </section>
  );
}
