import ResponsiveAppShell from "@/components/app/ResponsiveAppShell";
import MembershipCard from "@/features/more/MembershipCard";
import MoreMenuGrid from "@/features/more/MoreMenuGrid";

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
        <MembershipCard />
        <MoreMenuGrid />
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
        <MembershipCard />
      </section>

      <section className="pb-8">
        <MoreMenuGrid />
      </section>
    </ResponsiveAppShell>
  );
}
