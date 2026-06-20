"use client";

import { useEffect } from "react";

type ErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function OrdersError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log to an error reporting service if needed
    console.error("Orders page error:", error);
  }, [error]);

  return (
    <div className="px-4 py-6">
      <div
        className="rounded-[var(--radius-xl)] border border-[rgba(220,71,71,0.2)] bg-[rgba(220,71,71,0.04)] p-6 text-center"
        role="alert"
        aria-live="polite"
      >
        <p className="text-base font-semibold text-[color:var(--text)]">
          Không thể tải đơn hàng
        </p>
        <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
          Đã xảy ra lỗi khi tải danh sách đơn hàng. Vui lòng thử lại.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 inline-flex items-center gap-2 rounded-[var(--radius-lg)] bg-[color:var(--brand)] px-5 py-2.5 text-sm font-semibold text-white shadow-[var(--shadow-sm)] transition-transform hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] focus-visible:ring-offset-2"
        >
          Thử lại
        </button>
      </div>
    </div>
  );
}
