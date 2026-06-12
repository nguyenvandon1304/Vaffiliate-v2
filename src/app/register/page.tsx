"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import BrandLogo from "@/components/shared/BrandLogo";

export default function RegisterPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen px-4 py-5 sm:px-6 sm:py-8">
      <div className="page-shell">
        <section className="grid gap-4 lg:grid-cols-[1fr_0.95fr] lg:items-stretch lg:gap-6">
          <div className="surface-card bg-[rgba(255,252,249,0.9)] p-6 sm:p-8 lg:p-10 order-2 lg:order-1">
            <div className="mb-5 hidden lg:block">
              <h2 className="text-xl font-semibold tracking-[-0.03em] text-[color:var(--text)]">
                Thông tin tài khoản
              </h2>
              <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
                Tạo tài khoản để bắt đầu theo dõi hoàn tiền.
              </p>
            </div>

            <form
              className="grid gap-5"
              onSubmit={(event) => {
                event.preventDefault();
                router.push("/app");
              }}
            >
              <div>
                <label
                  htmlFor="register-name"
                  className="mb-2 block text-sm font-semibold text-[color:var(--text)]"
                >
                  Họ tên
                </label>
                <input
                  id="register-name"
                  type="text"
                  className="w-full rounded-[var(--radius-lg)] border border-[rgba(124,63,44,0.14)] bg-white/90 px-4 py-3 text-sm text-[color:var(--text)] outline-none"
                  placeholder="Nhập họ tên của bạn"
                />
              </div>

              <div>
                <label
                  htmlFor="register-identity"
                  className="mb-2 block text-sm font-semibold text-[color:var(--text)]"
                >
                  Email hoặc số điện thoại
                </label>
                <input
                  id="register-identity"
                  type="text"
                  className="w-full rounded-[var(--radius-lg)] border border-[rgba(124,63,44,0.14)] bg-white/90 px-4 py-3 text-sm text-[color:var(--text)] outline-none"
                  placeholder="Nhập email hoặc số điện thoại"
                />
              </div>

              <div>
                <label
                  htmlFor="register-password"
                  className="mb-2 block text-sm font-semibold text-[color:var(--text)]"
                >
                  Mật khẩu
                </label>
                <input
                  id="register-password"
                  type="password"
                  className="w-full rounded-[var(--radius-lg)] border border-[rgba(124,63,44,0.14)] bg-white/90 px-4 py-3 text-sm text-[color:var(--text)] outline-none"
                  placeholder="Tạo mật khẩu"
                />
              </div>

              <div>
                <label
                  htmlFor="register-referral"
                  className="mb-2 block text-sm font-semibold text-[color:var(--text)]"
                >
                  Mã giới thiệu không bắt buộc
                </label>
                <input
                  id="register-referral"
                  type="text"
                  className="w-full rounded-[var(--radius-lg)] border border-[rgba(124,63,44,0.14)] bg-white/90 px-4 py-3 text-sm text-[color:var(--text)] outline-none"
                  placeholder="Nhập mã nếu có"
                />
              </div>

              <label className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-[rgba(124,63,44,0.1)] bg-[rgba(255,250,246,0.72)] px-4 py-3 text-sm leading-6 text-[color:var(--text-muted)]">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-[rgba(124,63,44,0.24)] accent-[color:var(--brand)]"
                />
                <span>Tôi đồng ý với điều khoản sử dụng và chính sách hoàn tiền.</span>
              </label>

              <button type="submit" className="primary-button w-full">
                Tạo tài khoản
              </button>

              <p className="text-sm text-[color:var(--text-muted)]">
                Đã có tài khoản?{" "}
                <Link href="/login" className="font-semibold text-[color:var(--brand-strong)]">
                  Đăng nhập
                </Link>
              </p>
            </form>
          </div>

          <div className="relative overflow-hidden rounded-[calc(var(--radius-2xl)+0.25rem)] border border-[color:var(--line)] bg-[linear-gradient(180deg,rgba(255,250,246,0.94),rgba(250,242,235,0.94))] p-6 shadow-[var(--shadow-lg)] sm:p-8 lg:p-10 order-1 lg:order-2">
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute -right-10 top-8 h-40 w-40 rounded-full bg-[rgba(216,138,82,0.18)] blur-3xl" />
              <div className="absolute left-0 bottom-0 h-48 w-48 rounded-full bg-[rgba(124,63,44,0.1)] blur-3xl" />
            </div>

            <div className="relative">
              <BrandLogo />
              <span className="mt-6 inline-flex rounded-full border border-[rgba(124,63,44,0.12)] bg-[rgba(255,250,246,0.82)] px-3 py-1 text-sm font-medium text-[color:var(--brand)] shadow-[var(--shadow-sm)]">
                Bắt đầu dùng ví hoàn tiền Vaffiliate
              </span>
              <h1 className="mt-5 text-4xl font-semibold tracking-[-0.05em] text-[color:var(--text)] sm:text-5xl">
                Tạo tài khoản Vaffiliate
              </h1>
              <p className="mt-4 max-w-xl text-base leading-8 text-[color:var(--text-muted)]">
                Tạo tài khoản để lấy link hoàn tiền, theo dõi tiến trình đơn hàng và xem số dư sau khi hoa hồng được ghi nhận, đối soát và duyệt.
              </p>

              <div className="mt-8 grid gap-3">
                {[
                  "Lấy link cho Shopee hoặc TikTok Shop.",
                  "Theo dõi tiến trình đơn hàng minh bạch.",
                  "Rút tiền khi số dư khả dụng đạt điều kiện."
                ].map((item, index) => (
                  <div
                    key={item}
                    className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-[rgba(124,63,44,0.1)] bg-[rgba(255,252,249,0.78)] p-4 shadow-[var(--shadow-sm)]"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--accent-soft)] text-sm font-semibold text-[color:var(--brand-strong)]">
                      0{index + 1}
                    </span>
                    <p className="text-sm leading-6 text-[color:var(--text-muted)]">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
