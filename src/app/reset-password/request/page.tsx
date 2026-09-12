import Link from "next/link";
import { requestPasswordReset } from "@/app/auth/actions";

export default function RequestResetPage() {
  return (
    <main className="min-h-screen px-4 py-10 sm:px-6">
      <section className="surface-card mx-auto max-w-lg p-6 sm:p-10">
        <Link href="/login" className="text-sm text-[color:var(--brand-strong)]">← Quay lại đăng nhập</Link>
        <h1 className="mt-8 text-3xl font-semibold tracking-[-0.04em]">Đặt lại mật khẩu</h1>
        <p className="mt-3 text-sm leading-7 text-[color:var(--text-muted)]">Nhập email đã đăng ký. Liên kết đặt lại mật khẩu sẽ được gửi nếu tài khoản tồn tại.</p>
        <form action={requestPasswordReset} className="mt-8 grid gap-4">
          <label htmlFor="reset-email" className="text-sm font-semibold">Email</label>
          <input id="reset-email" name="email" type="email" required autoComplete="email" className="w-full rounded-[var(--radius-lg)] border border-[rgba(124,63,44,0.14)] bg-white/90 px-4 py-3" placeholder="Nhập địa chỉ email" />
          <button className="primary-button w-full" type="submit">Gửi liên kết</button>
        </form>
      </section>
    </main>
  );
}
