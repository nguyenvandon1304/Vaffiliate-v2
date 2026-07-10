import Link from "next/link";

import PolicyFooter from "@/components/policy/PolicyFooter";
import type { PolicyPage } from "@/lib/policy/policy-content";

/**
 * Phase 20I.6 -- shared policy page renderer.
 *
 * Wraps any {@link PolicyPage} entry with the standard layout used
 * by `/privacy`, `/terms`, `/cashback-terms` and `/data-deletion`.
 *
 * Layout choices:
 *
 *   - Mobile-first: max width `prose`, generous top spacing.
 *   - Server component: zero client JS shipped.
 *   - No marketing chrome: just a thin breadcrumb-style back link
 *     and the policy footer.
 *   - Copy is centralised in `policy-content.ts` so the unit test
 *     suite can audit it without rendering React.
 */

export type PolicyPageLayoutProps = {
  readonly page: PolicyPage;
  /**
   * Optional CTA rendered after the lead. Used by the
   * `/data-deletion` page so logged-out users see a clear
   * login CTA right under the lead, before the body copy.
   */
  readonly cta?: {
    readonly href: string;
    readonly label: string;
    readonly description: string;
  };
};

export default function PolicyPageLayout({ page, cta }: PolicyPageLayoutProps) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
      <nav
        aria-label="Quay lại"
        className="mb-4 text-sm text-[color:var(--text-muted)]"
      >
        <Link
          href="/"
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 hover:text-[color:var(--brand-strong)]"
        >
          <span aria-hidden="true">←</span> Trang chủ
        </Link>
      </nav>

      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-[-0.04em] text-[color:var(--text)] sm:text-3xl">
          {page.title}
        </h1>
        <p className="mt-3 text-sm leading-7 text-[color:var(--text-muted)] sm:text-base sm:leading-8">
          {page.lead}
        </p>
      </header>

      {cta ? (
        <aside
          aria-label="Đi đến thao tác xóa"
          className="mb-8 rounded-[var(--radius-lg)] border border-[rgba(124,63,44,0.16)] bg-[rgba(255,252,249,0.86)] p-4 shadow-[var(--shadow-sm)] sm:p-5"
        >
          <p className="text-sm font-semibold text-[color:var(--text)]">
            {cta.description}
          </p>
          <Link
            href={cta.href}
            className="mt-3 inline-flex items-center justify-center rounded-[var(--radius-lg)] bg-[linear-gradient(135deg,var(--brand),var(--brand-strong))] px-4 py-2 text-sm font-semibold text-white shadow-[var(--shadow-sm)]"
          >
            {cta.label}
          </Link>
        </aside>
      ) : null}

      <article className="space-y-6">
        {page.sections.map((section) => (
          <section key={section.heading} aria-labelledby={`${page.slug}-${section.heading}`}>
            <h2
              id={`${page.slug}-${section.heading}`}
              className="text-base font-semibold text-[color:var(--text)] sm:text-lg"
            >
              {section.heading}
            </h2>
            <div className="mt-2 space-y-3 text-sm leading-7 text-[color:var(--text-muted)] sm:text-base sm:leading-8">
              {section.paragraphs.map((paragraph, idx) => (
                <p key={`${section.heading}-${idx}`}>{paragraph}</p>
              ))}
            </div>
          </section>
        ))}
      </article>

      <aside
        aria-label="Ghi chú nền tảng"
        className="mt-10 rounded-[var(--radius-lg)] border border-dashed border-[color:var(--line)] bg-[rgba(255,250,246,0.7)] p-4 text-xs leading-6 text-[color:var(--text-muted)] sm:text-sm"
      >
        {page.foundationNote}
      </aside>

      <PolicyFooter />
    </main>
  );
}
