import Card from "./Card";

export default function StatCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <Card>
      <div className="p-4">
        <p className="text-xs font-medium text-[color:var(--text-muted)]">{label}</p>
        <p className="mt-2 text-xl font-semibold tracking-tight text-[color:var(--text)]">
          {value}
        </p>
      </div>
    </Card>
  );
}
