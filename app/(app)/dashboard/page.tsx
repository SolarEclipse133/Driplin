import { createClient } from "@/lib/supabase/server";
import { StageBanner } from "@/components/stage-banner";
import { RecheckButton } from "@/components/recheck-button";
import { recheckCompliance } from "./actions";

// Interim dashboard: stage verification banner + compliance re-check.
// The full portfolio view (metric cards, property list, alerts feed)
// arrives with feature 5.
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

      <div className="mt-6">
        <StageBanner />
      </div>

      <div className="mt-4">
        <RecheckButton action={recheckCompliance} />
      </div>

      <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <p className="text-sm text-slate-500">
          Your portfolio dashboard will appear here. Compliance results show
          on each property&apos;s page for now.
        </p>
      </div>
    </div>
  );
}
