import StatCard from "@/components/ui/StatCard";

type ClickStatsProps = {
  stats: { label: string; value: string }[];
};

export default function ClickStats({ stats }: ClickStatsProps) {
  return (
    <section className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
      {stats.map((item) => (
        <StatCard key={item.label} label={item.label} value={item.value} />
      ))}
    </section>
  );
}
