/**
 * Phase 20I.5 -- shared `/app/admin/**` layout with server-side
 * admin guard.
 *
 * Sits below the `/app/**` user layout, so the user guard already
 * ran by the time we get here. The admin guard adds the role
 * check on top and supplies a small admin shell around the page.
 *
 * Behaviour:
 *
 *   - Anonymous user: redirected to `/login?next=/app/admin/...`
 *     (handled by the user layout).
 *   - Authenticated user without admin / super_admin role:
 *     redirected to `/forbidden`.
 *   - Authenticated admin / super_admin: sees the admin shell.
 *
 * The shell is intentionally minimal: a banner that names the
 * section and the role. The admin pages still render their own
 * content.
 *
 * Phase 20I.5 only ships the AUDIT LOG FOUNDATION (a typed
 * `AdminAction` shape + an emitter that routes through a no-op
 * sink). Persistent audit log storage is out of scope for this
 * phase, so the shell copy must NOT claim that every admin
 * action is already recorded -- only that the khu vực is
 * designed to plug into the internal audit log when the next
 * phase wires a real sink.
 */

import type { ReactNode } from "react";

import { requireAdmin } from "@/lib/auth/server-guard";
import { roleLabel } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const actor = await requireAdmin("/app/admin");

  return (
    <div className="va-admin-shell" data-testid="admin-shell">
      <header
        className="va-admin-shell__banner"
        role="region"
        aria-label="Khu vực quản trị"
      >
        <div>
          <p className="va-admin-shell__eyebrow">Khu vực quản trị</p>
          <h1 className="va-admin-shell__title">Bảng điều khiển nội bộ</h1>
          <p className="va-admin-shell__subtitle">
            Bạn đang đăng nhập với quyền{" "}
            <strong data-testid="admin-role-label">{roleLabel(actor.role)}</strong>.
            Khu vực này được thiết kế để hỗ trợ kiểm toán nội bộ khi
            audit log được bật. Các thao tác quản trị sẽ được đưa
            vào luồng kiểm toán khi hệ thống audit log được kết
            nối ở phase sau.
          </p>
        </div>
      </header>
      <div className="va-admin-shell__body">{children}</div>
    </div>
  );
}
