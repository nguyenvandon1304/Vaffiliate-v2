"use client";

import {
  useEffect,
  useRef,
} from "react";
import {
  useRouter,
  useSearchParams,
} from "next/navigation";
import {
  FILTER_CHIPS,
  parseFilterParam,
} from "@/lib/filterUtils";
import type { OrderStatusFilter } from "@/types/orders";

export default function OrdersFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const containerRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef<
    Partial<Record<OrderStatusFilter, HTMLButtonElement | null>>
  >({});

  const active = parseFilterParam(
    searchParams.get("status"),
  );

  useEffect(() => {
    const container = containerRef.current;
    const activeChip = chipRefs.current[active];

    if (!container || !activeChip) {
      return;
    }

    let secondFrameId = 0;
    let resizeFrameId = 0;

    const centerActiveChip = () => {
      const containerRect = container.getBoundingClientRect();
      const chipRect = activeChip.getBoundingClientRect();

      const targetLeft =
        container.scrollLeft +
        chipRect.left -
        containerRect.left -
        (containerRect.width - chipRect.width) / 2;

      const maxLeft =
        container.scrollWidth - container.clientWidth;

      container.scrollTo({
        left: Math.min(
          Math.max(targetLeft, 0),
          Math.max(maxLeft, 0),
        ),
        behavior: "auto",
      });
    };

    const firstFrameId = window.requestAnimationFrame(() => {
      secondFrameId =
        window.requestAnimationFrame(centerActiveChip);
    });

    const resizeObserver = new ResizeObserver(() => {
      window.cancelAnimationFrame(resizeFrameId);
      resizeFrameId =
        window.requestAnimationFrame(centerActiveChip);
    });

    resizeObserver.observe(container);
    resizeObserver.observe(activeChip);

    return () => {
      window.cancelAnimationFrame(firstFrameId);
      window.cancelAnimationFrame(secondFrameId);
      window.cancelAnimationFrame(resizeFrameId);
      resizeObserver.disconnect();
    };
  }, [active]);

  const handleSelect = (
    filter: OrderStatusFilter,
  ) => {
    const params = new URLSearchParams(
      searchParams.toString(),
    );

    if (filter === "all") {
      params.delete("status");
    } else {
      params.set("status", filter);
    }

    const query = params.toString();
    const href = query
      ? "/app/orders?" + query
      : "/app/orders";

    router.push(href, {
      scroll: false,
    });
  };

  return (
    <section
      className="mb-4 rounded-[var(--radius-xl)] border border-[rgba(124,63,44,0.1)] bg-[rgba(255,250,246,0.72)] p-5 shadow-[var(--shadow-sm)]"
      role="group"
      aria-label="Bộ lọc đơn hàng"
    >
      <div
        ref={containerRef}
        className="no-scrollbar -mx-1 flex flex-nowrap gap-2 overflow-x-auto px-1 pb-1"
      >
        {FILTER_CHIPS.map((chip) => {
          const isActive = chip.value === active;

          const className = isActive
            ? "whitespace-nowrap rounded-full bg-[rgba(216,138,82,0.14)] px-3 py-2 text-xs font-semibold text-[color:var(--brand-strong)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
            : "whitespace-nowrap rounded-full border border-[rgba(124,63,44,0.12)] px-3 py-2 text-xs font-semibold text-[color:var(--text-muted)] transition-all hover:border-[color:var(--brand)] hover:text-[color:var(--brand-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]";

          return (
            <button
              ref={(element) => {
                chipRefs.current[chip.value] = element;
              }}
              key={chip.value}
              type="button"
              onClick={() => handleSelect(chip.value)}
              aria-pressed={isActive}
              className={className}
            >
              {chip.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
