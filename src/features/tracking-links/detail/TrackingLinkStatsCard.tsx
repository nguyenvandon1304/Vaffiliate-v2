import StatCard from "@/components/ui/StatCard";
import type { TrackingLinkStats } from "@/types/affiliate";

type Props = {
  stats: TrackingLinkStats;
};

export default function TrackingLinkStatsCard({ stats }: Props) {
  const items: { label: string; value: string }[] = [
    { label: "Clicks", value: stats.clicks.toLocaleString("vi-VN") },
    { label: "Unique clicks", value: stats.uniqueClicks.toLocaleString("vi-VN") },
    { label: "Conversions", value: stats.conversionCount.toLocaleString("vi-VN") },
    { label: "Commission", value: stats.commission },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <StatCard key={item.label} label={item.label} value={item.value} />
      ))}
    </section>
  );
}
