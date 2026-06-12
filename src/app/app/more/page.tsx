import ResponsiveAppShell from "@/components/app/ResponsiveAppShell";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import SectionHeader from "@/components/ui/SectionHeader";
import { moreMenuItems } from "@/lib/mock-data";

export default function MorePage() {
  const desktopContent = (
    <div className="space-y-6">
      <section className="surface-card overflow-hidden bg-[linear-gradient(180deg,rgba(255,252,249,0.92),rgba(248,238,231,0.96))] p-6">
        <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
          Tiện ích và thông tin tài khoản
        </p>
        <h1 className="text-[2rem] font-semibold tracking-[-0.04em] text-[color:var(--text)]">
          Thêm
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[color:var(--text-muted)]">
          Xem hướng dẫn, điều kiện đơn hợp lệ và các mục thiết lập cần thiết cho trải nghiệm hoàn tiền.
        </p>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.35fr)]">
        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-[color:var(--text-muted)]">
                Hạng thành viên
              </p>
              <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[color:var(--text)]">
                Bạc
              </p>
              <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
                Còn 10 đơn hợp lệ để lên hạng Vàng.
              </p>
            </div>
            <Badge>Hạng Bạc</Badge>
          </div>
          <button
            type="button"
            className="mt-4 text-sm font-semibold text-[color:var(--brand-strong)]"
          >
            Xem quyền lợi →
          </button>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
          {moreMenuItems.map((item) => (
            <Card key={item.title} className="p-5">
              <div className="flex min-h-[148px] flex-col justify-between">
                <div>
                  <p className="font-semibold text-[color:var(--text)]">{item.title}</p>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
                    {item.subtitle}
                  </p>
                </div>
                <span className="mt-4 text-sm font-semibold text-[color:var(--brand-strong)]">
                  Mở mục →
                </span>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );

  return (
    <ResponsiveAppShell desktopContent={desktopContent}>
      <section className="mb-4">
        <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
          Tiện ích và thông tin tài khoản
        </p>
        <div className="surface-card overflow-hidden bg-[linear-gradient(180deg,rgba(255,252,249,0.9),rgba(248,238,231,0.92))] p-5">
          <h1 className="text-[1.75rem] font-semibold tracking-[-0.04em] text-[color:var(--text)]">
            Thêm
          </h1>
          <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
            Xem hướng dẫn, điều kiện đơn hợp lệ và các mục thiết lập cần thiết cho trải nghiệm hoàn tiền.
          </p>
        </div>
      </section>

      <section className="mb-4">
        <Card className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-[color:var(--text-muted)]">
                Hạng thành viên
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--text)]">
                Bạc
              </p>
              <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
                Còn 10 đơn hợp lệ để lên hạng Vàng.
              </p>
            </div>
            <Badge>Hạng Bạc</Badge>
          </div>
          <button
            type="button"
            className="mt-4 text-sm font-semibold text-[color:var(--brand-strong)]"
          >
            Xem quyền lợi →
          </button>
        </Card>
      </section>

      <section className="pb-8">
        <SectionHeader title="Tiện ích" />
        <div className="grid gap-3">
          {moreMenuItems.map((item) => (
            <Card key={item.title} className="p-4">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1 pr-3">
                  <p className="font-semibold text-[color:var(--text)]">{item.title}</p>
                  <p className="mt-1 text-sm leading-6 text-[color:var(--text-muted)]">
                    {item.subtitle}
                  </p>
                </div>
                <span className="text-sm font-semibold text-[color:var(--text-muted)]">
                  ›
                </span>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </ResponsiveAppShell>
  );
}
