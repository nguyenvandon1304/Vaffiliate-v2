import StatCard from "@/components/ui/StatCard";
import type { CampaignStatistic } from "@/types/affiliate";

type Props = {
  statistics: CampaignStatistic[];
};

export default function CampaignStatsGrid({ statistics }: Props) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {statistics.map((stat) => (
        <StatCard key={stat.label} label={stat.label} value={stat.value} />
      ))}
    </section>
  );
}
