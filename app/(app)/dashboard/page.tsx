import { createClient } from "@/lib/supabase/server";

// Placeholder dashboard — the full portfolio view (metric cards, property
// list, alerts feed) is feature 5. For now it proves that auth works and
// that the organization/profile rows were created correctly at sign-up.
export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, organizations(name)")
    .eq("id", user!.id)
    .single();

  // Supabase types a joined relation as object-or-array; normalize it.
  const org = Array.isArray(profile?.organizations)
    ? profile?.organizations[0]
    : profile?.organizations;
  const orgName = org?.name ?? "your company";

  return (
    <div>
      <h1 className="text-2xl font-semibold">
        Welcome{profile?.full_name ? `, ${profile.full_name}` : ""}
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Signed in as {user?.email} · {orgName}
      </p>

      <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <p className="text-sm text-slate-500">
          Your portfolio dashboard will appear here. Next step: add your
          properties.
        </p>
      </div>
    </div>
  );
}
