import StatCard from "@/components/ui/StatCard";
import type { RevenueStat } from "@/types/affiliate";

type RevenueStatsProps = {
  stats: RevenueStat[];
};

export default function RevenueStats({ stats }: RevenueStatsProps) {
  return (
    <section className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
      {stats.map((item) => (
        <StatCard key={item.label} label={item.label} value={item.value} />
      ))}
    </section>
  );
}
