/**
 * Phase 20K -- admin reconciliation page.
 *
 * Server component that mounts the
 * `ReconciliationForm` client form, applies the
 * `privateRouteMetadata()` noindex/nofollow directive, and lays
 * out the surrounding admin language:
 *
 *   - banner copy that repeats the four hard guarantees (dry-run
 *     does NOT touch money; commit is idempotent; never advances
 *     terminal rows; Phase 20K does not run payout).
 *   - summary card with the totals (network commission, buyer
 *     cashback, platform profit) computed via the pure engine.
 *   - decision sample table (capped) so the operator can verify
 *     reason codes before re-running.
 *   - "Hợp đồng đối soát" card describing the bounded scope.
 *
 * Auth boundary:
 *
 *   - Parent layout `/app/admin/layout.tsx` already calls
 *     `requireAdmin()`. This page adds no new auth surface.
 *   - The route must NOT render the buyer shell.
 *
 * SEO boundary:
 *
 *   - `privateRouteMetadata()` -> `<meta name="robots">` is
 *     `noindex, nofollow`.
 *   - The route is NOT in `PUBLIC_SEO_PATHS`; therefore the
 *     admin tree is not in `sitemap.ts`.
 */

import type { ReactElement } from "react";

import { ReconciliationForm } from "./ReconciliationForm";
import { privateRouteMetadata } from "@/lib/seo/private-route-metadata";

export const dynamic = "force-dynamic";
export const metadata = privateRouteMetadata();

export default function ReconciliationAdminPage(): ReactElement {
  return (
    <div className="app-mobile-bg min-h-screen">
      <div className="page-shell py-6 sm:py-8">
        <header className="mb-6 flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
            Admin / Reconciliation
          </p>
          <h1 className="text-2xl font-semibold leading-tight text-[color:var(--text)] sm:text-3xl">
            Đối soát Shopee
          </h1>
          <p className="max-w-3xl text-sm leading-relaxed text-[color:var(--text-muted)] sm:text-base">
            Khớp click / đơn hàng / người dùng, tính tiền hoàn theo
            công thức 60/40, và chuyển trạng thái{" "}
            <code className="rounded bg-[rgba(255,250,246,0.7)] px-1.5 py-0.5 text-[11px]">
              conversions.status
            </code>{" "}
            qua máy trạng thái có kiểm toán.
          </p>
        </header>

        <section
          aria-label="Cảnh báo phạm vi đối soát"
          className="mb-6 flex items-start gap-3 rounded-[var(--radius-lg)] border border-[rgba(220,157,67,0.45)] bg-[rgba(244,216,196,0.55)] p-4 shadow-[var(--shadow-sm)] sm:p-5"
        >
          <span
            aria-hidden="true"
            className="mt-0.5 inline-flex h-7 w-7 flex-none items-center justify-center rounded-full bg-[color:var(--accent)] text-sm font-bold text-white"
          >
            !
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-[color:var(--text)]">
              Đối soát là thao tác tiền. Đọc kỹ trước khi Commit.
            </p>
            <p className="text-xs leading-relaxed text-[color:var(--text-muted)] sm:text-sm">
              Dry run chỉ đọc, không ghi. Commit ghi vào bảng{" "}
              <code className="rounded bg-[rgba(255,250,246,0.7)] px-1.5 py-0.5 text-[11px]">
                conversions
              </code>{" "}
              theo state machine. Phase 20K không xử lý chi trả, không
              ghi vào ví người dùng, không đối chiếu TikTok Shop.
            </p>
          </div>
        </section>

        <section className="surface-card mb-6 p-5 sm:p-6">
          <header className="mb-4 flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-[color:var(--text)]">
              Chạy đối soát
            </h2>
            <p className="text-xs leading-relaxed text-[color:var(--text-muted)] sm:text-sm">
              Bấm Dry run để xem trước. Sau khi xem trước, hãy chọn
              checkbox xác nhận rồi bấm Commit để ghi các quyết định
              vào staging.
            </p>
          </header>
          <ReconciliationForm />
        </section>

        <section className="surface-card mb-6 p-5 sm:p-6">
          <header className="mb-4 flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-[color:var(--text)]">
              Hợp đồng đối soát
            </h2>
            <p className="text-xs leading-relaxed text-[color:var(--text-muted)] sm:text-sm">
              Phạm vi cố định của Phase 20K.
            </p>
          </header>
          <ul className="flex flex-col gap-3 text-sm leading-relaxed text-[color:var(--text)] sm:text-[15px]">
            <li className="flex gap-3">
              <CheckMark />
              <span>
                Đọc các dòng từ bảng{" "}
                <code className="rounded bg-[rgba(255,250,246,0.7)] px-1.5 py-0.5 text-xs">
                  conversions
                </code>
                , tính tiền hoàn theo công thức 60% người dùng / 40%
                nền tảng và ghi lại state machine.
              </span>
            </li>
            <li className="flex gap-3">
              <CheckMark />
              <span>
                Máy trạng thái:{" "}
                <code className="rounded bg-[rgba(255,250,246,0.7)] px-1.5 py-0.5 text-xs">
                  pending -&gt; approved -&gt; payable -&gt; paid
                </code>
                . Approved có thể rejected. Paid / rejected là trạng
                thái cuối.
              </span>
            </li>
            <li className="flex gap-3">
              <CheckMark />
              <span>
                Idempotent theo{" "}
                <code className="rounded bg-[rgba(255,250,246,0.7)] px-1.5 py-0.5 text-xs">
                  network + source_conversion_key + decision
                </code>
                . Commit lặp lại không ghi đè hoặc ghi trùng.
              </span>
            </li>
            <li className="flex gap-3">
              <BlockMark />
              <span>
                Không ghi vào sổ cái (ledger), ví người dùng (wallet),
                payable balance, hoặc bảng payout.
              </span>
            </li>
            <li className="flex gap-3">
              <BlockMark />
              <span>
                Không đối chiếu TikTok Shop. Không chạy chi trả. Mọi
                payout đều nằm ngoài phạm vi Phase 20K.
              </span>
            </li>
            <li className="flex gap-3">
              <InfoMark />
              <span>
                Mỗi lần chuyển trạng thái sẽ phát ra một bản ghi audit
                log với mã lý do (reason code) để kiểm toán nội bộ.
              </span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}

function CheckMark(): ReactElement {
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[color:var(--success)] text-[11px] font-bold text-white"
    >
      OK
    </span>
  );
}

function BlockMark(): ReactElement {
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[color:var(--brand)] text-[11px] font-bold text-white"
    >
      X
    </span>
  );
}

function InfoMark(): ReactElement {
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[color:var(--accent)] text-[11px] font-bold text-white"
    >
      i
    </span>
  );
}
