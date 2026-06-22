

import Link from "next/link";

import { login } from "@/app/auth/actions";
import BrandLogo from "@/components/shared/BrandLogo";

type LoginPageProps = {
  searchParams: Promise<{
    next?: string | string[];
  }>;
};

export default async function LoginPage({
  searchParams,
}: LoginPageProps) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "";
return ( <main className="min-h-screen px-4 py-5 sm:px-6 sm:py-8"> <div className="page-shell"> <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr] lg:items-stretch lg:gap-6"> <div className="relative overflow-hidden rounded-[calc(var(--radius-2xl)+0.25rem)] border border-[color:var(--line)] bg-[linear-gradient(180deg,rgba(255,250,246,0.94),rgba(250,242,235,0.94))] p-5 shadow-[var(--shadow-lg)] sm:p-8 lg:p-10"> <div className="pointer-events-none absolute inset-0"> <div className="absolute -left-12 top-10 h-36 w-36 rounded-full bg-[rgba(216,138,82,0.16)] blur-3xl" /> <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-[rgba(124,63,44,0.1)] blur-3xl" /> </div>

        <div className="relative">
          <BrandLogo />

          <span className="mt-4 inline-flex rounded-full border border-[rgba(124,63,44,0.12)] bg-[rgba(255,250,246,0.82)] px-3 py-1 text-sm font-medium text-[color:var(--brand)] shadow-[var(--shadow-sm)] lg:mt-6">
            Đăng nhập để theo dõi ví hoàn tiền
          </span>

          <h1 className="mt-4 text-3xl font-semibold tracking-[-0.05em] text-[color:var(--text)] sm:text-5xl lg:mt-5">
            Đăng nhập ví hoàn tiền
          </h1>

          <p className="mt-3 max-w-xl text-sm leading-7 text-[color:var(--text-muted)] sm:text-base sm:leading-8 lg:mt-4">
            Theo dõi số dư khả dụng, đơn chờ đối soát và lịch sử hoàn
            tiền trong một giao diện gọn gàng, dễ dùng.
          </p>

          <p className="mt-4 rounded-[var(--radius-lg)] border border-[rgba(124,63,44,0.1)] bg-[rgba(255,252,249,0.78)] px-4 py-3 text-sm leading-6 text-[color:var(--text-muted)] shadow-[var(--shadow-sm)] lg:hidden">
            Tiền hoàn chỉ khả dụng sau khi đơn được ghi nhận, đối soát và
            hoa hồng được duyệt.
          </p>

          <div className="mt-5 hidden gap-3 sm:grid-cols-3 lg:mt-8 lg:grid">
            {[
              "Đơn cần được ghi nhận trước khi cộng hoàn tiền.",
              "Hoa hồng cần được sàn đối soát và duyệt.",
              "Số dư khả dụng có thể rút khi đạt điều kiện.",
            ].map((item) => (
              <div
                key={item}
                className="rounded-[var(--radius-lg)] border border-[rgba(124,63,44,0.1)] bg-[rgba(255,252,249,0.78)] p-4 text-sm leading-6 text-[color:var(--text-muted)] shadow-[var(--shadow-sm)]"
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="surface-card bg-[rgba(255,252,249,0.9)] p-6 sm:p-8 lg:p-10">
        <div className="mb-5 hidden lg:block">
          <h2 className="text-xl font-semibold tracking-[-0.03em] text-[color:var(--text)]">
            Đăng nhập tài khoản
          </h2>

          <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
            Nhập thông tin để tiếp tục vào ví hoàn tiền.
          </p>
        </div>

        <form action={login} className="grid gap-5">
        <input type="hidden" name="next" value={next} />
          <div>
            <label
              htmlFor="login-email"
              className="mb-2 block text-sm font-semibold text-[color:var(--text)]"
            >
              Email
            </label>

            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full rounded-[var(--radius-lg)] border border-[rgba(124,63,44,0.14)] bg-white/90 px-4 py-3 text-sm text-[color:var(--text)] outline-none"
              placeholder="Nhập địa chỉ email"
            />
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="mb-2 block text-sm font-semibold text-[color:var(--text)]"
            >
              Mật khẩu
            </label>

            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded-[var(--radius-lg)] border border-[rgba(124,63,44,0.14)] bg-white/90 px-4 py-3 text-sm text-[color:var(--text)] outline-none"
              placeholder="Nhập mật khẩu"
            />
          </div>

          <div className="flex items-center justify-between gap-3 text-sm">
            <Link href="#" className="text-[color:var(--brand-strong)]">
              Quên mật khẩu?
            </Link>

            <Link
              href="/register"
              className="font-semibold text-[color:var(--brand-strong)]"
            >
              Tạo tài khoản
            </Link>
          </div>

          <button type="submit" className="primary-button w-full">
            Đăng nhập
          </button>
        </form>
      </div>
    </section>
  </div>
</main>

);
}
