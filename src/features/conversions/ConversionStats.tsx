import StatCard from "@/components/ui/StatCard";
import type { ConversionStat } from "@/types/affiliate";

type ConversionStatsProps = {
  stats: ConversionStat[];
};

export default function ConversionStats({ stats }: ConversionStatsProps) {
  return (
    <section className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
      {stats.map((item) => (
        <StatCard key={item.label} label={item.label} value={item.value} />
      ))}
    </section>
  );
}
