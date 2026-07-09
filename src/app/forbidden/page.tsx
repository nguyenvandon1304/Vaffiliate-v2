import Link from "next/link";

/**
 * Phase 20I.5 -- generic "forbidden" landing page.
 *
 * The admin server-guard redirects here when an authenticated
 * user without the required role tries to enter a protected
 * area. The page is intentionally calm, server-rendered, and
 * free of any internal IDs / tokens. The user can return to
 * the home page or contact support.
 */

export const dynamic = "force-static";

export default function ForbiddenPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-start justify-center gap-4 px-6 py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
        Khu vực hạn chế
      </p>
      <h1 className="text-3xl font-semibold text-[color:var(--text)]">
        Bạn không có quyền truy cập trang này
      </h1>
      <p className="text-sm leading-6 text-[color:var(--text-muted)]">
        Tài khoản của bạn đang đăng nhập nhưng không nằm trong nhóm
        quản trị viên của Vaffiliate. Nếu bạn cho rằng đây là nhầm
        lẫn, vui lòng liên hệ đội ngũ vận hành qua email hỗ trợ.
        Khu vực này được thiết kế để hỗ trợ kiểm toán nội bộ khi
        audit log được bật; các thao tác truy cập khu vực này sẽ
        được đưa vào luồng kiểm toán khi hệ thống audit log được
        kết nối ở phase sau.
      </p>
      <div className="mt-2 flex gap-3">
        <Link
          href="/app"
          className="inline-flex items-center rounded-[var(--radius-lg)] border border-[color:var(--line)] bg-white/70 px-4 py-2 text-sm font-medium text-[color:var(--text)] hover:bg-white"
        >
          Về trang chính
        </Link>
        <Link
          href="/"
          className="inline-flex items-center rounded-[var(--radius-lg)] bg-[linear-gradient(135deg,var(--brand),var(--brand-strong))] px-4 py-2 text-sm font-semibold text-white shadow-[var(--shadow-glow)]"
        >
          Về trang chủ
        </Link>
      </div>
    </main>
  );
}
