/**
 * Phase 20I.6 -- admin visibility for the account-deletion queue.
 *
 * Path: `/app/admin/account-deletion`.
 *
 * Auth: the parent `/app/admin/**` layout already calls
 * `requireAdmin()`, so by the time this page renders we know the
 * caller has `admin` or `super_admin`. The page itself still
 * calls `requireAdmin("/app/admin/account-deletion")` belt-and-
 * braces so a future refactor that removes the layout guard does
 * not silently expose the page.
 *
 * Foundation phase: the page reads from the in-memory foundation
 * queue in `lib/account-deletion/account-deletion.ts`. The copy
 * explicitly tells the admin this is a foundation queue, NOT a
 * production review tool, and that there is no approve / reject
 * action wired yet -- those land in a later phase along with the
 * persistent storage.
 */

import { requireAdmin } from "@/lib/auth/server-guard";
import { roleLabel } from "@/lib/auth/roles";
import {
  listDeletionRequestsFoundation,
  type AccountDeletionRequest,
} from "@/lib/account-deletion/account-deletion";

export const dynamic = "force-dynamic";

function formatDate(value: Date | null): string {
  if (!value) return "chua co";
  // Use a deterministic, locale-neutral formatter so the
  // source-audit (which bans em-dash) is not disturbed. We use
  // ISO yyyy-mm-dd hh:mm to keep the output stable across
  // server / client and across timezones.
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(
    value.getUTCDate(),
  )} ${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())} UTC`;
}

export default async function AdminAccountDeletionPage() {
  const actor = await requireAdmin("/app/admin/account-deletion");
  const requests: ReadonlyArray<AccountDeletionRequest> =
    listDeletionRequestsFoundation();

  return (
    <section className="va-admin-account-deletion">
      <header className="va-admin-account-deletion__header">
        <h2 className="va-admin-account-deletion__title">
          Hàng chờ yêu cầu xóa tài khoản
        </h2>
        <p className="va-admin-account-deletion__subtitle">
          Xin chào {actor.email ?? actor.userId} ({roleLabel(actor.role)}).
          Đây là bản nền (foundation) của hàng chờ yêu cầu xóa tài khoản.
          Hàng chờ này hiện lưu trong bộ nhớ tạm của tiến trình, không phải
          cơ sở dữ liệu bền vững. Khu vực này được thiết kế để hỗ trợ
          kiểm toán nội bộ khi audit log được bật; các thao tác duyệt sẽ
          được đưa vào luồng kiểm toán khi hệ thống audit log được kết
          nối ở phase sau.
        </p>
        <p className="va-admin-account-deletion__notice">
          Bản nền chưa có thao tác duyệt / từ chối / xử lý thật. Vui lòng
          không xóa dữ liệu tài chính / cashback / đơn hàng trong phase
          này; đó là phạm vi của phase sau khi đã có chính sách lưu giữ
          và ẩn danh hóa rõ ràng.
        </p>
      </header>

      <div className="va-admin-account-deletion__panel">
        <p className="va-admin-account-deletion__count">
          Số yêu cầu hiện tại: <strong>{requests.length}</strong>
        </p>

        {requests.length === 0 ? (
          <p className="va-admin-account-deletion__empty">
            Chưa có yêu cầu nào trong hàng chờ nền tảng.
          </p>
        ) : (
          <table className="va-admin-account-deletion__table">
            <thead>
              <tr>
                <th scope="col">Mã</th>
                <th scope="col">Email</th>
                <th scope="col">Trạng thái</th>
                <th scope="col">Gửi lúc</th>
                <th scope="col">Lý do</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id}>
                  <td>
                    <code>{request.id}</code>
                  </td>
                  <td>{request.email ?? "(không có)"}</td>
                  <td>{request.status}</td>
                  <td>{formatDate(request.requestedAt)}</td>
                  <td>{request.reason ?? "(không có)"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
