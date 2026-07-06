/**
 * Phase 20H.4a -- public landing hero for the `/cashback` route.
 *
 * Pure presentational, server-renderable. Designed to slot directly
 * under the existing `BrandLogo` header on the public page and to
 * pair visually with `<ShopeeCashbackPreviewForm />`.
 *
 *  - Headline stays within `text-4xl md:text-5xl` and a single line
 *    in English / Vietnamese so it fits the initial viewport at
 *    mobile + desktop.
 *  - Subhead is intentionally short (<= 20 words) so the CTA stays
 *    visible above the fold.
 *  - One eyebrow above the section; inner pages do NOT add more.
 *  - No em-dashes, no fabricated metrics, no version labels.
 *
 * The hero renders the same eyebrow colour and gradient backdrop as
 * the in-app entry hero in `src/app/app/cashback/page.tsx` so users
 * see one consistent brand surface across the public + private
 * cashback flows.
 */

const ENTRY_HERO_EYEBROW = "Mua sắm hoàn tiền Shopee";

const ENTRY_HERO_TITLE =
  "Dán link Shopee để kiểm tra hoàn tiền.";

const ENTRY_HERO_DESCRIPTION =
  "Vaffiliate lấy ảnh, tên, giá tham khảo và " +
  "mức hoàn tiền dự kiến theo hoa hồng Shopee, " +
  "không phải theo giá sản phẩm. Mua qua link " +
  "Vaffiliate để nhận hoàn tiền khi Shopee " +
  "đối soát xong.";

const SUPPORTED_PLATFORMS = ["Shopee"] as const;

const TRUST_BADGES = [
  "Hoàn tiền dựa trên hoa hồng Shopee, " +
    "không phải giá sản phẩm.",
  "Giá chỉ để tham khảo.",
  "Không phải sản phẩm nào cũng có " +
    "hoa hồng.",
  "Hoàn tiền chỉ xác nhận sau khi Shopee " +
    "đối soát.",
] as const;

export default function PublicCashbackHero() {
  return (
    <section
      data-testid="public-cashback-hero"
      className="relative overflow-hidden rounded-[calc(var(--radius-2xl)+0.25rem)] border border-[color:var(--line)] bg-[linear-gradient(180deg,rgba(255,250,246,0.94),rgba(250,242,235,0.94))] px-5 py-6 shadow-[var(--shadow-md)] sm:px-7 sm:py-8"
    >
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
      >
        <div className="absolute -left-12 top-8 h-36 w-36 rounded-full bg-[rgba(216,138,82,0.16)] blur-3xl" />
        <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-[rgba(124,63,44,0.1)] blur-3xl" />
      </div>

      <div className="relative">
        <p
          className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--brand-strong)]"
          data-testid="public-cashback-hero-eyebrow"
        >
          {ENTRY_HERO_EYEBROW}
        </p>

        <h1
          className="text-3xl font-semibold tracking-[-0.05em] text-[color:var(--text)] sm:text-4xl md:text-5xl"
          data-testid="public-cashback-hero-title"
        >
          {ENTRY_HERO_TITLE}
        </h1>

        <p className="mt-3 max-w-2xl text-sm leading-7 text-[color:var(--text-muted)] sm:text-base">
          {ENTRY_HERO_DESCRIPTION}
        </p>

        <div
          className="mt-4 flex flex-wrap gap-2"
          data-testid="public-cashback-hero-platforms"
        >
          {SUPPORTED_PLATFORMS.map((platform) => (
            <span
              key={platform}
              className="inline-flex items-center rounded-full border border-[rgba(124,63,44,0.14)] bg-white/70 px-3 py-1 text-xs font-medium text-[color:var(--text)]"
            >
              {platform}
            </span>
          ))}
        </div>

        <ul
          className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2"
          data-testid="public-cashback-hero-trust-badges"
        >
          {TRUST_BADGES.map((badge) => (
            <li
              key={badge}
              className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[rgba(124,63,44,0.1)] bg-white/70 px-3 py-2 text-xs leading-5 text-[color:var(--text-muted)]"
            >
              <span
                aria-hidden="true"
                className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--brand-strong)]"
              />
              <span>{badge}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
