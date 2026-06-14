import ActionButton from "@/components/ui/ActionButton";
import Card from "@/components/ui/Card";
import SectionHeader from "@/components/ui/SectionHeader";
import type { QuickAction } from "@/types/dashboard";

type QuickActionsProps = {
  actions: QuickAction[];
};

export default function QuickActions({ actions }: QuickActionsProps) {
  return (
    <Card className="bg-[rgba(255,250,246,0.72)] p-5">
      <SectionHeader title="Thao tác nhanh" />
      <div className="grid grid-cols-2 gap-3">
        {actions.map((action) => (
          <ActionButton
            key={action.title}
            type="button"
            tone="secondary"
            className="h-auto p-4 text-left"
            aria-label={action.title}
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[color:var(--accent-soft)] text-lg font-semibold text-[color:var(--brand-strong)]">
              {action.icon}
            </div>
            <p className="mt-3 text-sm font-semibold text-[color:var(--text)]">
              {action.title}
            </p>
            <p className="mt-1 text-xs font-medium leading-5 text-[color:var(--text-muted)]">
              {action.subtitle}
            </p>
          </ActionButton>
        ))}
      </div>
    </Card>
  );
}
