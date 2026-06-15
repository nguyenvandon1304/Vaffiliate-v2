import StatCard from "@/components/ui/StatCard";
import type { CashbackStat } from "@/types/cashback";

type CashbackStatsProps = {
  stats: CashbackStat[];
};

export default function CashbackStats({ stats }: CashbackStatsProps) {
  return (
    <section className="mb-4 grid grid-cols-3 gap-3">
      {stats.map((item) => (
        <StatCard key={item.label} label={item.label} value={item.value} />
      ))}
    </section>
  );
}
