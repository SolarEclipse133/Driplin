import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "@/components/settings-form";
import { updateProfile } from "./actions";

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  sent: { label: "Sent", className: "bg-green-50 text-green-800" },
  logged: { label: "Logged (not sent)", className: "bg-slate-100 text-slate-600" },
  failed: { label: "Failed", className: "bg-red-50 text-red-700" },
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone, email")
    .eq("id", user!.id)
    .single();

  const { data: notifications } = await supabase
    .from("notification_log")
    .select("id, channel, recipient, subject, body, status, error, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  const smsConfigured = !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER
  );
  const emailConfigured = !!process.env.RESEND_API_KEY;

  return (
    <div>
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="mt-1 text-sm text-slate-500">
        How Driplin reaches you when a property needs attention.
      </p>

      <div className="mt-6">
        <SettingsForm
          action={updateProfile}
          initial={{
            full_name: profile?.full_name ?? "",
            phone: profile?.phone ?? "",
            email: profile?.email ?? user?.email ?? "",
          }}
        />
      </div>

      <h2 className="mt-10 text-lg font-semibold">Notification history</h2>
      {(!smsConfigured || !emailConfigured) && (
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {!emailConfigured && !smsConfigured
            ? "Email and SMS sending are in log-only mode: messages are composed and recorded below, but not delivered until the Resend/Twilio keys are configured (see SETUP.md)."
            : !emailConfigured
              ? "Email sending is in log-only mode until the Resend key is configured."
              : "SMS sending is in log-only mode until the Twilio keys are configured."}
        </p>
      )}
      {(notifications?.length ?? 0) === 0 ? (
        <p className="mt-2 text-sm text-slate-500">
          Nothing yet — alert messages will appear here.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {notifications!.map((n) => {
            const badge = STATUS_LABELS[n.status] ?? STATUS_LABELS.logged;
            return (
              <li key={n.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-medium uppercase text-slate-700">
                    {n.channel}
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 font-medium ${badge.className}`}>
                    {badge.label}
                  </span>
                  <span className="text-slate-500">to {n.recipient}</span>
                  <span className="text-slate-400">
                    {new Date(n.created_at).toLocaleString("en-US", {
                      timeZone: "America/Chicago",
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                </div>
                {n.subject && (
                  <p className="mt-2 text-sm font-medium">{n.subject}</p>
                )}
                <p className="mt-1 whitespace-pre-line text-sm text-slate-600">
                  {n.body}
                </p>
                {n.error && (
                  <p className="mt-1 text-xs text-red-700">{n.error}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
