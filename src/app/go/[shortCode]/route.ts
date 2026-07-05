import { NextResponse, type NextRequest } from "next/server";

import { buildCashbackClickRequestMetadata } from "@/lib/cashback/click-metadata";
import { createClient } from "@/lib/supabase/server";
import {
  CashbackTrackingLinkNotFoundError,
  recordCashbackClickAsync,
} from "@/repositories/cashback-click.repository";
import { recordShopeePurchaseIntentCorrelationAsync } from "@/lib/cashback/shopee-redirect-intent-correlation";

const SHORT_CODE_PATTERN = /^[A-Za-z0-9_-]{10,32}$/;

type CashbackRedirectRouteContext = {
  params: Promise<{
    shortCode: string;
  }>;
};

function applyPrivateRedirectHeaders(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");

  return response;
}

function createTextErrorResponse(
  message: string,
  status: 404 | 500,
): NextResponse {
  return new NextResponse(message, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}

export async function GET(
  request: NextRequest,
  context: CashbackRedirectRouteContext,
) {
  const { shortCode } = await context.params;

  if (!SHORT_CODE_PATTERN.test(shortCode)) {
    return createTextErrorResponse("Link hoàn tiền không hợp lệ.", 404);
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    const loginUrl = new URL("/login", request.url);

    loginUrl.searchParams.set(
      "next",
      request.nextUrl.pathname + request.nextUrl.search,
    );

    return applyPrivateRedirectHeaders(NextResponse.redirect(loginUrl, 302));
  }

  try {
    const metadata = buildCashbackClickRequestMetadata(
      request.headers,
      user.id,
    );

    const click = await recordCashbackClickAsync(supabase, shortCode, metadata);

    // Phase 20H.3c: best-effort, non-blocking correlation between the
    // persisted click audit and any recent `redirect_prepared` Shopee
    // purchase intent for the same (publisher, shortCode). The
    // correlation is logged only — it never blocks the redirect and
    // never mutates the click row. Legacy `/go/<shortCode>` links
    // without a matching intent must remain redirectable, so a `null`
    // result is the normal case.
    void recordShopeePurchaseIntentCorrelationAsync({
      publisherId: user.id,
      shortCode,
      clickId: click.clickId,
    });

    return applyPrivateRedirectHeaders(
      NextResponse.redirect(new URL(click.affiliateUrl), 302),
    );
  } catch (error) {
    if (error instanceof CashbackTrackingLinkNotFoundError) {
      // Phase 20H.3c: never reveal whether the link is paused, disabled,
      // missing, or owned by another user. Use neutral copy.
      return createTextErrorResponse(
        "Link hoàn tiền này hiện không khả dụng.",
        404,
      );
    }

    console.error("Unable to process cashback redirect", error);

    return createTextErrorResponse(
      "Không thể xử lý link hoàn tiền lúc này. Vui lòng thử lại sau.",
      500,
    );
  }
}
