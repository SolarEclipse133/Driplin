import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/sign-out-button";

// Everything behind login depends on the visitor's session cookie, so these
// pages must render per-request, never be pre-built at compile time.
export const dynamic = "force-dynamic";

// Shared shell for every page behind login: top navigation bar with the
// company name and sign-out. The middleware already blocks logged-out
// visitors, but we re-check here as defense in depth.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Load the user's profile and organization for the header.
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, organizations(name)")
    .eq("id", user.id)
    .single();

  // Supabase types a joined relation as object-or-array; normalize it.
  const org = Array.isArray(profile?.organizations)
    ? profile?.organizations[0]
    : profile?.organizations;
  const orgName = org?.name ?? "";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="text-lg font-bold text-sky-700">
              Driplin
            </Link>
            <nav className="flex gap-1">
              <Link
                href="/dashboard"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              >
                Dashboard
              </Link>
              <Link
                href="/properties"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              >
                Properties
              </Link>
              <Link
                href="/settings"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              >
                Settings
              </Link>
              {profile?.role === "admin" && (
                <Link
                  href="/admin"
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50"
                >
                  Admin
                </Link>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 sm:inline">
              {orgName}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {children}
      </main>
    </div>
  );
}
