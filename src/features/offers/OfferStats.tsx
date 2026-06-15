import StatCard from "@/components/ui/StatCard";
import type { OfferStat } from "@/types/affiliate";

type OfferStatsProps = {
  stats: OfferStat[];
};

export default function OfferStats({ stats }: OfferStatsProps) {
  return (
    <section className="mb-4 grid grid-cols-3 gap-3">
      {stats.map((item) => (
        <StatCard key={item.label} label={item.label} value={item.value} />
      ))}
    </section>
  );
}
