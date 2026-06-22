import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

function getSafeRedirectUrl(request: NextRequest) {
  const fallbackUrl = new URL("/app", request.url);
  const next = request.nextUrl.searchParams.get("next");

  if (!next || !next.startsWith("/")) {
    return fallbackUrl;
  }

  try {
    const redirectUrl = new URL(next, request.url);

    if (redirectUrl.origin !== request.nextUrl.origin) {
      return fallbackUrl;
    }

    return redirectUrl;
  } catch {
    return fallbackUrl;
  }
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=auth-callback-failed", request.url),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL("/login?error=auth-callback-failed", request.url),
    );
  }

  return NextResponse.redirect(getSafeRedirectUrl(request));
}
