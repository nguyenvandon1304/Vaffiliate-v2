import Link from "next/link";
import { filterValueToLabel } from "@/lib/filterUtils";
import type { OrderStatusFilter } from "@/types/orders";

export default function SkeletonLine({
className = "",
}: {
className?: string;
}) {
const classes = [
"animate-pulse rounded-[var(--radius-lg)] bg-[rgba(216,138,82,0.08)]",
className,
]
.filter(Boolean)
.join(" ");

return ( <div
   className={classes}
   aria-hidden="true"
 />
);
}

export function OrdersLoadingState() {
return ( <div className="grid gap-3">
{Array.from({ length: 4 }).map((_, index) => ( <div
       key={index}
       className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.86)] p-4"
     > <div className="flex items-start justify-between gap-3"> <div className="space-y-2"> <SkeletonLine className="h-4 w-24" /> <SkeletonLine className="h-3 w-36" /> </div>

        <SkeletonLine className="h-5 w-16" />
      </div>

      <div className="mt-4 flex items-center justify-between">
        <SkeletonLine className="h-6 w-24 rounded-full" />
        <SkeletonLine className="h-4 w-20" />
      </div>
    </div>
  ))}
</div>

);
}

type OrdersEmptyStateProps = {
activeFilter?: OrderStatusFilter;
};

export function OrdersEmptyState({
activeFilter = "all",
}: OrdersEmptyStateProps) {
const isFiltered = activeFilter !== "all";

return ( <div className="rounded-[var(--radius-xl)] border border-[rgba(124,63,44,0.1)] bg-[rgba(255,250,246,0.72)] p-8 text-center shadow-[var(--shadow-sm)]"> <p className="text-base font-semibold text-[color:var(--text)]">
{isFiltered
? "Không có đơn hàng phù hợp"
: "Bạn chưa có đơn hàng được ghi nhận"} </p>

  <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
    {isFiltered
      ? "Không tìm thấy đơn hàng ở trạng thái “" +
        filterValueToLabel(activeFilter) +
        "”. Hãy thử một bộ lọc khác hoặc xem tất cả đơn hàng."
      : "Hãy tạo link hoàn tiền và bắt đầu mua hàng qua link đó để ghi nhận giao dịch."}
  </p>

  {isFiltered ? (
    <Link
      href="/app/orders"
      className="mt-5 inline-flex min-h-10 items-center justify-center rounded-full bg-[color:var(--brand)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] focus-visible:ring-offset-2"
    >
      Xem tất cả đơn hàng
    </Link>
  ) : null}
</div>

);
}

export function GenericErrorState({
message = "Không thể tải dữ liệu. Vui lòng thử lại.",
}: {
message?: string;
}) {
return ( <div className="rounded-[var(--radius-xl)] border border-[rgba(124,63,44,0.1)] bg-[rgba(255,250,246,0.72)] p-8 text-center shadow-[var(--shadow-sm)]"> <p className="text-base font-semibold text-[color:var(--text)]">
Đã xảy ra lỗi </p>

  <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
    {message}
  </p>
</div>

);
}
