import StatCard from "@/components/ui/StatCard";
import type { CommissionStat } from "@/types/affiliate";

type CommissionStatsProps = {
  stats: CommissionStat[];
};

export default function CommissionStats({ stats }: CommissionStatsProps) {
  return (
    <section className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
      {stats.map((item) => (
        <StatCard key={item.label} label={item.label} value={item.value} />
      ))}
    </section>
  );
}
