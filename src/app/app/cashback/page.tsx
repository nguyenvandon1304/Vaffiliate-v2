import AppShell from "@/components/layout/AppShell";
import AppSection from "@/components/layout/AppSection";
import PageHeader from "@/components/layout/PageHeader";
import CashbackForm from "@/features/cashback/CashbackForm";

export default function CashbackPage() {
  const desktopContent = (
    <div className="space-y-6">
      <section className="surface-card overflow-hidden bg-[linear-gradient(180deg,rgba(255,252,249,0.92),rgba(248,238,231,0.96))] p-6">
        <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
          Nhận hoàn tiền từ hoa hồng đã được duyệt
        </p>
        <h1 className="text-[2rem] font-semibold tracking-[-0.04em] text-[color:var(--text)]">
          Lấy link hoàn tiền
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[color:var(--text-muted)]">
          Hoàn tiền chỉ khả dụng sau khi đơn được ghi nhận, đối soát và hoa hồng được sàn duyệt.
        </p>
      </section>

      <CashbackForm />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="rounded-[var(--radius-xl)] border border-[rgba(124,63,44,0.1)] bg-[rgba(255,250,246,0.72)] p-5 shadow-[var(--shadow-sm)]">
          <h2 className="mb-3 text-base font-semibold text-[color:var(--text)]">
            Sắp ra mắt
          </h2>
          <div className="flex flex-wrap gap-2">
            {["Shopee Food", "Lazada", "Tiki", "Sendo"].map((item) => (
              <span
                key={item}
                className="rounded-full border border-[rgba(124,63,44,0.12)] bg-[rgba(255,252,249,0.74)] px-3 py-1 text-xs font-medium text-[color:var(--text-muted)] opacity-75"
                aria-disabled="true"
              >
                {item}
              </span>
            ))}
          </div>
        </div>

        <p className="rounded-[var(--radius-lg)] border border-[rgba(124,63,44,0.08)] bg-[rgba(255,250,246,0.7)] px-4 py-3 text-sm leading-6 text-[color:var(--text-muted)] shadow-[var(--shadow-sm)]">
          Lưu ý: Hãy mua hàng qua link vừa tạo và hạn chế chuyển sang link khác trước khi thanh toán để đơn có cơ hội được ghi nhận chính xác.
        </p>
      </section>
    </div>
  );

  return (
    <AppShell desktopContent={desktopContent}>
      <AppSection>
        <PageHeader
          eyebrow={
            <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
              Nhận hoàn tiền từ hoa hồng đã được duyệt
            </p>
          }
          title="Lấy link hoàn tiền"
          description="Hoàn tiền chỉ khả dụng sau khi đơn được ghi nhận, đối soát và hoa hồng được sàn duyệt."
        />
      </AppSection>

      <AppSection>
        <CashbackForm />
      </AppSection>

      <AppSection className="mt-4 pb-8">
        <div className="rounded-[var(--radius-xl)] border border-[rgba(124,63,44,0.1)] bg-[rgba(255,250,246,0.62)] p-4 shadow-[var(--shadow-sm)]">
          <h2 className="mb-3 text-base font-semibold text-[color:var(--text)]">
            Sắp ra mắt
          </h2>
          <div className="flex flex-wrap gap-2">
            {["Shopee Food", "Lazada", "Tiki", "Sendo"].map((item) => (
              <span
                key={item}
                className="cursor-not-allowed rounded-full border border-[rgba(124,63,44,0.12)] bg-[rgba(255,252,249,0.74)] px-3 py-1 text-xs font-medium text-[color:var(--text-muted)] opacity-75"
                aria-disabled="true"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </AppSection>
    </AppShell>
  );
}
