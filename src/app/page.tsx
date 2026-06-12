import Link from "next/link";
import BrandLogo from "@/components/shared/BrandLogo";
import { heroPreview, homeFeatures, homeMetrics } from "@/lib/mock-data";

export default function Home() {
  return (
    <main className="min-h-screen px-4 py-5 sm:px-6 sm:py-8">
      <div className="page-shell">
        <section className="relative overflow-hidden rounded-[calc(var(--radius-2xl)+0.25rem)] border border-[color:var(--line)] bg-[linear-gradient(180deg,rgba(255,250,246,0.92),rgba(250,242,235,0.92))] px-5 py-5 shadow-[var(--shadow-lg)] sm:px-8 sm:py-7 lg:px-10 lg:py-8">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-14 top-10 h-40 w-40 rounded-full bg-[rgba(216,138,82,0.18)] blur-3xl" />
            <div className="absolute right-0 top-0 h-56 w-56 rounded-full bg-[rgba(124,63,44,0.12)] blur-3xl" />
            <div className="absolute bottom-0 left-1/3 h-32 w-32 rounded-full bg-[rgba(255,255,255,0.55)] blur-2xl" />
          </div>

          <header className="relative flex flex-col gap-5 border-b border-[color:var(--line)] pb-6 sm:flex-row sm:items-center sm:justify-between">
            <BrandLogo />
            <Link href="/login" className="primary-button">
              Mở ví hoàn tiền
            </Link>
          </header>

          <div className="relative grid gap-10 py-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-12 lg:py-12">
            <div className="max-w-2xl">
              <span className="inline-flex rounded-full border border-[rgba(124,63,44,0.12)] bg-[rgba(255,250,246,0.82)] px-3 py-1 text-sm font-medium text-[color:var(--brand)] shadow-[var(--shadow-sm)]">
                Hoàn tiền cho mua sắm online tại Việt Nam
              </span>
              <h1 className="mt-5 text-4xl font-semibold tracking-[-0.05em] text-[color:var(--text)] sm:text-5xl lg:text-6xl">
                Mua sắm thông minh hơn, hoàn tiền rõ ràng hơn, mọi thứ gọn trong một ví.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-8 text-[color:var(--text-muted)] sm:text-lg">
                Vaffiliate nhận hoa hồng tiếp thị liên kết từ các sàn đang hỗ trợ,
                sau đó chia lại một phần hoa hồng đã được duyệt cho bạn dưới dạng
                hoàn tiền. Tiền hoàn không đến ngay lập tức mà phụ thuộc vào đơn
                hàng được ghi nhận, đối soát và duyệt hoa hồng.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link href="/app" className="primary-button">
                  Xem trải nghiệm ví
                </Link>
                <span className="text-sm text-[color:var(--text-muted)] sm:max-w-xs">
                  Không rối mắt, không kiểu dashboard doanh nghiệp, chỉ tập trung vào
                  mua sắm và hoàn tiền.
                </span>
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {homeMetrics.map((metric) => (
                  <div
                    key={metric.label}
                    className="rounded-[var(--radius-lg)] border border-[rgba(124,63,44,0.1)] bg-[rgba(255,252,249,0.78)] p-4 shadow-[var(--shadow-sm)] backdrop-blur"
                  >
                    <p className="text-sm font-medium text-[color:var(--text-muted)]">
                      {metric.label}
                    </p>
                    <p className="mt-2 text-xl font-semibold tracking-tight text-[color:var(--text)]">
                      {metric.value}
                    </p>
                    {"note" in metric ? (
                      <p className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
                        {metric.note}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[500px] px-2 lg:px-6">
              <div className="absolute left-2 top-8 hidden max-w-[220px] rounded-[var(--radius-lg)] border border-[rgba(124,63,44,0.08)] bg-[rgba(255,250,246,0.88)] p-4 shadow-[var(--shadow-md)] backdrop-blur lg:block">
                <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                  Cơ chế hoàn tiền
                </p>
                <p className="mt-2 text-sm font-medium leading-6 text-[color:var(--text)]">
                  Hoa hồng affiliate chỉ được chia lại khi đơn đã được ghi nhận,
                  đối soát và duyệt.
                </p>
              </div>

              <div className="absolute bottom-12 right-2 hidden max-w-[240px] rounded-[var(--radius-lg)] bg-[color:var(--surface-dark)] px-4 py-3 text-white shadow-[var(--shadow-lg)] lg:block">
                <p className="text-xs uppercase tracking-[0.16em] text-white/72">
                  Sàn đang hỗ trợ
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-sm font-medium text-white/90">
                  {heroPreview.stores.map((store) => (
                    <span
                      key={store}
                      className="rounded-full bg-white/10 px-3 py-1"
                    >
                      {store}
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-xs leading-5 text-white/70">
                  Shopee Food, Lazada, Tiki và Sendo sẽ được cập nhật sau.
                </p>
              </div>

              <div className="phone-preview p-4 pt-12">
                <div className="rounded-[var(--radius-xl)] bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(255,248,243,0.95))] p-4 shadow-[var(--shadow-sm)]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-[color:var(--text-muted)]">
                        Số dư khả dụng
                      </p>
                      <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[color:var(--text)]">
                        {heroPreview.balance}
                      </p>
                    </div>
                    <div className="rounded-full bg-[color:var(--accent-soft)] px-3 py-1 text-xs font-semibold text-[color:var(--brand-strong)]">
                      Ví hoàn tiền
                    </div>
                  </div>

                  <div className="mt-4 rounded-[var(--radius-lg)] bg-[linear-gradient(135deg,var(--brand),var(--accent))] p-4 text-white shadow-[var(--shadow-glow)]">
                    <p className="text-sm text-white/80">Hoàn tiền trong tháng</p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight">
                      {heroPreview.monthlyCashback}
                    </p>
                    <p className="mt-3 text-sm text-white/80">{heroPreview.upcomingPayout}</p>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[var(--radius-lg)] border border-[color:var(--line)] bg-[rgba(255,255,255,0.82)] p-4">
                      <p className="text-sm font-medium text-[color:var(--text-muted)]">
                        Đơn gần nhất
                      </p>
                      <p className="mt-2 font-semibold text-[color:var(--text)]">
                        Shopee
                      </p>
                      <p className="mt-1 text-sm font-medium text-[color:var(--success)]">
                        +18.000đ đã ghi nhận
                      </p>
                    </div>
                    <div className="rounded-[var(--radius-lg)] border border-[color:var(--line)] bg-[rgba(255,255,255,0.82)] p-4">
                      <p className="text-sm font-medium text-[color:var(--text-muted)]">
                        Tiến độ rút tiền
                      </p>
                      <div className="mt-3 h-2 rounded-full bg-[rgba(124,63,44,0.08)]">
                        <div className="h-2 w-2/3 rounded-full bg-[linear-gradient(90deg,var(--accent),var(--brand))]" />
                      </div>
                      <p className="mt-2 text-sm font-medium text-[color:var(--text)]">
                        68% để đạt mốc rút tiếp theo
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 pt-10 pb-6 sm:pt-12 lg:grid-cols-3">
          {homeFeatures.map((feature, index) => (
            <article
              key={feature.title}
              className="surface-card bg-[rgba(255,252,249,0.82)] p-6 sm:p-7"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--brand)]">
                0{index + 1}
              </p>
              <h2 className="mt-4 text-xl font-semibold tracking-[-0.03em] text-[color:var(--text)] sm:text-[1.35rem]">
                {feature.title}
              </h2>
              <p className="mt-3 text-sm leading-7 text-[color:var(--text-muted)]">
                {feature.description}
              </p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
