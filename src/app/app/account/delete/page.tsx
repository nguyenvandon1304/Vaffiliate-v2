import Link from "next/link";

import AccountDeletionForm from "./AccountDeletionForm";

/**
 * Phase 20I.6 -- user-facing account-deletion request page.
 *
 * Path: `/app/account/delete`.
 *
 * Auth: the parent `/app/**` layout already calls `requireUser()`,
 * so by the time this page renders we know the user is
 * authenticated. The form action also re-validates this server-side.
 *
 * The page is intentionally a small server component that hosts
 * the client form. It does NOT mutate any data itself; it just
 * explains the consequences and renders the form.
 */

export const dynamic = "force-dynamic";

export default function AccountDeletePage() {
  return (
    <main className="va-account-deletion-page mx-auto w-full max-w-2xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
      <nav
        aria-label="Quay lại"
        className="mb-4 text-sm text-[color:var(--text-muted)]"
      >
        <Link
          href="/app/profile"
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 hover:text-[color:var(--brand-strong)]"
        >
          <span aria-hidden="true">←</span> Hồ sơ
        </Link>
      </nav>

      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-[-0.04em] text-[color:var(--text)] sm:text-3xl">
          Yêu cầu xóa tài khoản
        </h1>
        <p className="mt-3 text-sm leading-7 text-[color:var(--text-muted)] sm:text-base sm:leading-8">
          Gửi yêu cầu xóa hoặc ẩn danh hóa dữ liệu của bạn.
          Phase này chỉ cung cấp luồng nền để kiểm tra quy trình
          yêu cầu xóa tài khoản. Hệ thống lưu trữ bền vững cho yêu
          cầu xóa sẽ được kết nối ở phase sau trước khi gửi app lên
          cửa hàng.
        </p>
      </header>

      <section
        aria-label="Điều sẽ xảy ra"
        className="va-account-deletion-page__notice"
      >
        <h2 className="va-account-deletion-page__notice-title">
          Trước khi gửi yêu cầu
        </h2>
        <ul className="va-account-deletion-page__notice-list">
          <li>
            Chưa có thao tác xóa dữ liệu thật trong phase này.
            Yêu cầu được tiếp nhận vào luồng nền để kiểm tra quy
            trình.
          </li>
          <li>
            Một số dữ liệu có thể cần được lưu giữ trong thời gian
            cần thiết để đối soát, chống gian lận hoặc đáp ứng
            nghĩa vụ pháp lý và kế toán nếu có.
          </li>
        </ul>
      </section>

      <AccountDeletionForm />

      <aside
        aria-label="Liên kết chính sách"
        className="mt-10 rounded-[var(--radius-lg)] border border-dashed border-[color:var(--line)] bg-[rgba(255,250,246,0.7)] p-4 text-xs leading-6 text-[color:var(--text-muted)] sm:text-sm"
      >
        Xem thêm: <Link href="/data-deletion" className="text-[color:var(--brand-strong)] underline">Xóa dữ liệu</Link>
        {" "}- <Link href="/privacy" className="text-[color:var(--brand-strong)] underline">Chính sách quyền riêng tư</Link>
        {" "}- <Link href="/terms" className="text-[color:var(--brand-strong)] underline">Điều khoản dịch vụ</Link>
      </aside>
    </main>
  );
}
