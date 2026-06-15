import StatCard from "@/components/ui/StatCard";
import type { NotificationStat } from "@/types/notification";

type NotificationStatsProps = {
  stats: NotificationStat[];
};

export default function NotificationStats({ stats }: NotificationStatsProps) {
  return (
    <section className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
      {stats.map((item) => (
        <StatCard key={item.label} label={item.label} value={item.value} />
      ))}
    </section>
  );
}
