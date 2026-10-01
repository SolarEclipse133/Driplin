import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Turns the one-time code in an emailed link into a session.
 *
 * Runs on the server so the session cookie is set the normal way, which
 * is what lets the page it forwards to behave like any other signed-in
 * page.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  // Only ever forward to a path inside Driplin. Without this check a
  // crafted link could carry next=//example.com and use Driplin's own
  // domain to bounce someone to a convincing fake sign-in page.
  const safeNext =
    next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=link_invalid`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    // Expired, already used, or opened in a different browser than the one
    // that asked for it — the code verifier lives in this browser only.
    return NextResponse.redirect(`${origin}/login?error=link_expired`);
  }

  return NextResponse.redirect(`${origin}${safeNext}`);
}
