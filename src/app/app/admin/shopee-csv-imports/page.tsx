/**
 * Phase 20J -- Admin page for the Shopee CSV import.
 *
 * Composition (server component):
 *
 *   - admin-shell banner (from `/app/admin/layout.tsx`) names the
 *     area and the role; this page adds its own contextual header
 *     on top.
 *   - staging-only safety banner -- a prominent, styled banner that
 *     repeats the "this tool only writes to staging" contract in
 *     Vietnamese so an operator cannot mistake it for a production
 *     writer.
 *   - "Chạy import" card -- hosts the client form
 *     `ShopeeCsvImportForm` which already calls the server action
 *     and renders the preview / import summary.
 *   - "Hợp đồng staging" card -- the explicit contract: what this
 *     tool writes, what it does NOT write, and how to read the
 *     counters.
 *
 * Auth boundary:
 *
 *   - The page lives at `/app/admin/shopee-csv-imports`. The parent
 *     `/app/admin` layout already calls `requireAdmin()`; this page
 *     adds no new auth surface.
 *   - The route must NOT render the buyer shell, the buyer bottom
 *     nav, or `BuyerResponsiveShell`. The admin layout enforces
 *     this.
 *
 * SEO boundary:
 *
 *   - The page applies `privateRouteMetadata()` so the rendered
 *     `<meta name="robots">` directive is `noindex, nofollow`.
 *   - The route is intentionally NOT in `PUBLIC_SEO_PATHS`, so it
 *     does not appear in `sitemap.ts`.
 *   - There is no marketing shell, no public header, no public
 *     footer.
 *
 * Phase 20J scope:
 *
 *   - The form is admin-only.
 *   - The action NEVER writes to the buyer ledger, wallet, or
 *     cashback approval state. It only writes to the existing
 *     `shopee_csv_import_batches` + `shopee_csv_rows` staging
 *     tables.
 *   - The page text repeats the staging-only contract in plain
 *     Vietnamese so an operator cannot mistake it for a production
 *     writer.
 *
 * Visual language:
 *
 *   - Reuses the existing Vaffiliate product language defined in
 *     `globals.css` (warm cream surface, `--brand` brown, soft
 *     radius, layered shadows). No new design system, no new
 *     utility classes.
 *   - Uses the same `surface-card` primitive that the rest of the
 *     buyer / public surface uses, so the page reads as part of
 *     the same product even though it lives in the admin tree.
 */

import type { ReactElement } from "react";

import { ShopeeCsvImportForm } from "./ShopeeCsvImportForm";

export const dynamic = "force-dynamic";
export const metadata = privateRouteMetadata();

function privateRouteMetadata(): {
  readonly robots: {
    readonly index: false;
    readonly follow: false;
  };
} {
  return {
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default function ShopeeCsvImportAdminPage(): ReactElement {
  return (
    <div className="app-mobile-bg min-h-screen">
      <div className="page-shell py-6 sm:py-8">
        <header className="mb-6 flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
            Admin / Import
          </p>
          <h1 className="text-2xl font-semibold leading-tight text-[color:var(--text)] sm:text-3xl">
            Shopee CSV import
          </h1>
          <p className="max-w-3xl text-sm leading-relaxed text-[color:var(--text-muted)] sm:text-base">
            Công cụ đối soát nội bộ. Tải lên báo cáo Shopee Affiliate
            dạng CSV để xem trước các dòng, phát hiện dòng lỗi /
            trùng lặp, rồi ghi vào staging để Phase 20K mới xử lý.
          </p>
        </header>

        <section
          aria-label="Cảnh báo chỉ ghi staging"
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
              Staging only. Phase 20K mới xử lý.
            </p>
            <p className="text-xs leading-relaxed text-[color:var(--text-muted)] sm:text-sm">
              Hành động này chỉ ghi vào bảng{" "}
              <code className="rounded bg-[rgba(255,250,246,0.7)] px-1.5 py-0.5 text-[11px]">
                shopee_csv_import_batches
              </code>{" "}
              và{" "}
              <code className="rounded bg-[rgba(255,250,246,0.7)] px-1.5 py-0.5 text-[11px]">
                shopee_csv_rows
              </code>
              . <strong>Chưa ghi vào ví người dùng.</strong>{" "}
              <strong>Chưa đối soát.</strong>{" "}
              <strong>Chưa duyệt hoàn tiền.</strong>
            </p>
          </div>
        </section>

        <section className="surface-card mb-6 p-5 sm:p-6">
          <header className="mb-4 flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-[color:var(--text)]">
              Chạy import
            </h2>
            <p className="text-xs leading-relaxed text-[color:var(--text-muted)] sm:text-sm">
              Tệp CSV phải khớp với hợp đồng tiêu đề Shopee hiện tại
              (47 cột). Giới hạn kích thước 8 MB. Bản xem trước không
              ghi vào cơ sở dữ liệu.
            </p>
          </header>
          <ShopeeCsvImportForm />
        </section>

        <section className="surface-card mb-6 p-5 sm:p-6">
          <header className="mb-4 flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-[color:var(--text)]">
              Hợp đồng staging
            </h2>
            <p className="text-xs leading-relaxed text-[color:var(--text-muted)] sm:text-sm">
              Nội dung ghi, nội dung KHÔNG ghi, và cách đọc các bộ đếm.
            </p>
          </header>
          <ul className="flex flex-col gap-3 text-sm leading-relaxed text-[color:var(--text)] sm:text-[15px]">
            <li className="flex gap-3">
              <CheckMark />
              <span>
                Hành động này chỉ ghi vào bảng{" "}
                <code className="rounded bg-[rgba(255,250,246,0.7)] px-1.5 py-0.5 text-xs">
                  shopee_csv_import_batches
                </code>{" "}
                và{" "}
                <code className="rounded bg-[rgba(255,250,246,0.7)] px-1.5 py-0.5 text-xs">
                  shopee_csv_rows
                </code>
                .
              </span>
            </li>
            <li className="flex gap-3">
              <BlockMark />
              <span>
                Không ghi vào sổ cái (ledger), ví người dùng (wallet),
                hoặc bất kỳ bảng đơn hàng / cashback nào của buyer.
              </span>
            </li>
            <li className="flex gap-3">
              <BlockMark />
              <span>
                Không chuyển trạng thái cashback sang{" "}
                <code className="rounded bg-[rgba(255,250,246,0.7)] px-1.5 py-0.5 text-xs">
                  approved / payable / paid
                </code>
                .
              </span>
            </li>
            <li className="flex gap-3">
              <InfoMark />
              <span>
                Trùng lặp ở cấp tệp (sha256) hoặc cấp dòng
                (fingerprint) bị từ chối tự động. Không có dòng nào
                được ghi đè lên dòng đã tồn tại.
              </span>
            </li>
            <li className="flex gap-3">
              <InfoMark />
              <span>
                Phase 20K (chưa bắt đầu) sẽ đọc các dòng đã staging để
                khớp click / đơn hàng / người dùng và tính cashback.
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
