/**
 * Phase 20H.4a -- public cashback entry route.
 *
 * `/cashback` is a logged-OUT-accessible landing page that lets a
 * buyer paste a Shopee link, see the same preview card the in-app
 * cashback page uses, and is gated at the buy CTA to sign in. After
 * login they return here with the same `?productUrl=` preserved.
 *
 * No `AppShell`. The composition is intentionally minimal:
 *
 *   BrandLogo header (sticky-friendly)
 *   PublicCashbackFlow (hero + form + 3-step + trust notes)
 *   "Sắp ra mắt" signpost band (mirrors the in-app surface)
 *
 * The page is a Server Component so:
 *
 *   - It can use the Supabase server client to detect whether the
 *     visitor already has a session before serialising the page. No
 *     client-side hydration flash on the CTA copy.
 *   - It can parse `?productUrl=` from the request and pass it into
 *     the form as `initialProductUrl`.
 *   - It can render the BrandLogo header without pulling the
 *     client-side `AppShell` dependency chain.
 *
 * The flow content is delegated to `<PublicCashbackFlow/>` which is
 * the only client component in this page; everything else is pure
 * server-rendered markup.
 */

import Link from "next/link";

import PublicCashbackFlowWithPreview from "@/features/cashback/PublicCashbackFlowWithPreview";
import BrandLogo from "@/components/shared/BrandLogo";
import { createClient } from "@/lib/supabase/server";

type CashbackPageProps = {
  searchParams: Promise<{
    productUrl?: string | string[];
  }>;
};

function readStringParam(
  value: string | string[] | undefined,
): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return typeof value === "string" ? value : "";
}

const COMING_SOON_PLATFORMS = [
  "Shopee Food",
  "Lazada",
  "Tiki",
  "Sendo",
] as const;

export default async function PublicCashbackPage({
  searchParams,
}: CashbackPageProps) {
  const params = await searchParams;
  const rawProductUrl = readStringParam(params.productUrl).trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAuthenticated = user !== null;

  return (
    <main className="min-h-screen px-4 py-5 sm:px-6 sm:py-8">
      <div className="page-shell">
        <header className="mb-6 flex flex-col gap-4 border-b border-[color:var(--line)] pb-5 sm:flex-row sm:items-center sm:justify-between">
          <BrandLogo />
          <nav
            className="flex flex-wrap items-center gap-3 text-sm font-medium text-[color:var(--text-muted)]"
              aria-label="Tài khoản"
          >
            {isAuthenticated ? (
              <Link
                href="/app"
                className="rounded-full border border-[rgba(124,63,44,0.18)] bg-[rgba(255,250,246,0.84)] px-4 py-2 text-[color:var(--text)] shadow-[var(--shadow-sm)]"
              >
                Mở ví hoàn tiền
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-full px-4 py-2 text-[color:var(--text-muted)]"
                >
                  Đăng nhập
                </Link>
                <Link
                  href="/register"
                  className="rounded-full bg-[color:var(--brand)] px-4 py-2 !text-white shadow-[var(--shadow-sm)]"
                >
                  Tạo tài khoản
                </Link>
              </>
            )}
          </nav>
        </header>

        <PublicCashbackFlowWithPreview
          isAuthenticated={isAuthenticated}
          initialProductUrl={rawProductUrl || null}
        />

        <section
          aria-labelledby="public-cashback-coming-soon"
          className="mt-8 rounded-[var(--radius-xl)] border border-[rgba(124,63,44,0.1)] bg-[rgba(255,250,246,0.72)] p-5 shadow-[var(--shadow-sm)]"
        >
          <h2
            id="public-cashback-coming-soon"
            className="mb-3 text-base font-semibold text-[color:var(--text)]"
          >
            Sắp ra mắt
          </h2>
          <div className="flex flex-wrap gap-2">
            {COMING_SOON_PLATFORMS.map((item) => (
              <span
                key={item}
                className="rounded-full border border-[rgba(124,63,44,0.12)] bg-[rgba(255,252,249,0.74)] px-3 py-1 text-xs font-medium text-[color:var(--text-muted)] opacity-75"
                aria-disabled="true"
              >
                {item}
              </span>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
