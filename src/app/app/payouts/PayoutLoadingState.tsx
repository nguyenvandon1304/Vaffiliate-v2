import SkeletonLine from "@/features/orders/OrdersStates";

export default function PayoutLoadingState() {
  return (
    <div className="grid gap-4" aria-label="Đang tải yêu cầu thanh toán">
      <div className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.86)] p-5">
        <SkeletonLine className="h-4 w-40" />
        <SkeletonLine className="mt-3 h-10 w-56" />
        <SkeletonLine className="mt-4 h-20 w-full" />
        <SkeletonLine className="mt-4 h-11 w-full" />
      </div>

      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.86)] p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <SkeletonLine className="h-3 w-32" />
              <SkeletonLine className="h-7 w-40" />
            </div>
            <SkeletonLine className="h-6 w-20 rounded-full" />
          </div>
          <SkeletonLine className="mt-4 h-16 w-full" />
        </div>
      ))}
    </div>
  );
}
