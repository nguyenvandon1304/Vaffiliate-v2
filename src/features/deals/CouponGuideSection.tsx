/**
 * Phase 20I.7 -- mobile-first coupon / cashback guide section.
 *
 * Renders the buyer-facing guide content defined in
 * `lib/seo/coupon-guide-content.ts` as a stacked article.
 *
 * Layout:
 *
 *   - One heading per section from the typed guide data.
 *   - Bullets (when present) render as a list with adequate
 *     spacing for thumb-tap targets (>= 40px line-height).
 *   - FAQ items render as a `<details>`/`<summary>` disclosure so
 *     the page stays quiet on mobile but the answer is still
 *     indexable (text lives inside the markup; no client JS).
 *
 * The component intentionally does NOT fetch any data, mutate
 * state, or include any client interactivity. The `<details>`
 * disclosure is plain HTML so the buyer gets the FAQ content even
 * with JavaScript off.
 *
 * Server component. Zero client JS shipped.
 */

import type {
  GuideFaqItem,
  GuideSection,
} from "@/lib/seo/coupon-guide-content";

export type CouponGuideSectionProps = {
  readonly heading: string;
  readonly sections?: ReadonlyArray<GuideSection>;
  readonly faqs?: ReadonlyArray<GuideFaqItem>;
  readonly faqIdPrefix?: string;
};

import {
  COUPON_GUIDE_SECTIONS,
  COUPON_GUIDE_FAQS,
} from "@/lib/seo/coupon-guide-content";

export default function CouponGuideSection({
  heading,
  sections = COUPON_GUIDE_SECTIONS,
  faqs = COUPON_GUIDE_FAQS,
  faqIdPrefix = "coupon-guide",
}: CouponGuideSectionProps) {
  const faqSectionIdx = sections.findIndex((s) =>
    /câu hỏi thường gặp/i.test(s.heading),
  );
  const introSections =
    faqSectionIdx >= 0 ? sections.slice(0, faqSectionIdx) : sections;

  return (
    <article
      aria-label={heading}
      className="mt-8 flex flex-col gap-6 rounded-[var(--radius-xl)] border border-[rgba(124,63,44,0.1)] bg-[rgba(255,252,249,0.86)] p-5 sm:p-6"
    >
      <header className="flex flex-col gap-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--brand-strong)]">
          Hướng dẫn
        </p>
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-[color:var(--text)] sm:text-2xl">
          {heading}
        </h2>
      </header>

      {introSections.map((section) => (
        <section
          key={section.heading}
          aria-labelledby={`${faqIdPrefix}-${section.heading}`}
          className="flex flex-col gap-2"
        >
          <h3
            id={`${faqIdPrefix}-${section.heading}`}
            className="text-base font-semibold text-[color:var(--text)] sm:text-lg"
          >
            {section.heading}
          </h3>
          {section.paragraphs.map((p, idx) => (
            <p
              key={`${section.heading}-p-${idx}`}
              className="text-sm leading-7 text-[color:var(--text-muted)] sm:text-base sm:leading-8"
            >
              {p}
            </p>
          ))}
          {section.bullets && section.bullets.length > 0 ? (
            <ul className="mt-1 flex flex-col gap-2 pl-5 text-sm leading-7 text-[color:var(--text-muted)] sm:text-base sm:leading-8">
              {section.bullets.map((bullet, idx) => (
                <li
                  key={`${section.heading}-b-${idx}`}
                  className="list-disc"
                >
                  {bullet}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}

      {faqs.length > 0 ? (
        <section
          aria-labelledby={`${faqIdPrefix}-faq`}
          className="flex flex-col gap-3"
        >
          <h3
            id={`${faqIdPrefix}-faq`}
            className="text-base font-semibold text-[color:var(--text)] sm:text-lg"
          >
            Câu hỏi thường gặp
          </h3>
          <div className="flex flex-col gap-3">
            {faqs.map((faq, idx) => (
              <details
                key={`${faqIdPrefix}-faq-${idx}`}
                className="rounded-[var(--radius-lg)] border border-[rgba(124,63,44,0.12)] bg-[rgba(255,252,249,0.92)] p-3 sm:p-4"
              >
                <summary className="cursor-pointer text-sm font-semibold text-[color:var(--text)] sm:text-base">
                  {faq.question}
                </summary>
                <p className="mt-2 text-sm leading-7 text-[color:var(--text-muted)] sm:text-base sm:leading-8">
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>
        </section>
      ) : null}
    </article>
  );
}
