/**
 * Phase 20I.5 -- admin landing page (`/app/admin`).
 *
 * The page is intentionally minimal. It documents the available
 * admin tools and links to the only one that currently exists
 * (the Addlivetag importer). The layout already ran
 * `requireAdmin()` so the page only renders for authenticated
 * admin / super_admin users.
 *
 * Phase 20I.5 only ships the AUDIT LOG FOUNDATION. The copy must
 * not over-claim: admin actions are wired through the `AdminAction`
 * emitter but the sink is currently a no-op until a later phase
 * plugs in persistent storage.
 */

import Link from "next/link";

import { requireAdmin } from "@/lib/auth/server-guard";
import { roleLabel } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const actor = await requireAdmin("/app/admin");

  return (
    <section className="va-admin-home">
      <header className="va-admin-home__header">
        <h2 className="va-admin-home__title">Công cụ quản trị</h2>
        <p className="va-admin-home__subtitle">
          Xin chào {actor.email ?? actor.userId} ({roleLabel(actor.role)}).
          Danh sách dưới đây liệt kê các công cụ đang hoạt động
          trong khu vực quản trị. Khu vực này được thiết kế để hỗ
          trợ kiểm toán nội bộ khi audit log được bật; các thao
          tác quản trị sẽ được đưa vào luồng kiểm toán khi hệ
          thống audit log được kết nối ở phase sau.
        </p>
      </header>

      <ul className="va-admin-home__list">
        <li className="va-admin-home__item">
          <Link
            href="/app/admin/addlivetag"
            className="va-admin-home__link"
          >
            <span className="va-admin-home__item-title">
              Addlivetag import
            </span>
            <span className="va-admin-home__item-subtitle">
              Tải orders / items / clicks theo khoảng ngày từ API
              Addlivetag, có hỗ trợ chạy thử (dry run) trước khi
              ghi thật.
            </span>
          </Link>
        </li>
      </ul>
    </section>
  );
}
