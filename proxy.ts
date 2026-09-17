import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Runs before every page request: refreshes the login session and
// redirects logged-out visitors away from protected pages.
// (In Next.js 16 this file is called proxy.ts; it was middleware.ts before.)
export default async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Run on all paths except static assets and images.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
