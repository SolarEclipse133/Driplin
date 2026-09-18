/**
 * The only code that talks to notification providers (Twilio, Resend),
 * mirroring the controller-abstraction rule: everything else calls
 * sendSms/sendEmail and never a provider API.
 *
 * LOG-ONLY MODE: when a provider's API keys are not configured, the
 * send returns status 'logged' — the message is recorded in
 * notification_log but nothing leaves the building. Adding the keys in
 * Vercel (see SETUP.md) turns on real sending with no code changes.
 */

export type SendResult =
  | { status: "sent" }
  | { status: "logged" }
  | { status: "failed"; error: string };

export async function sendSms(to: string, body: string): Promise<SendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) return { status: "logged" };

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: from, Body: body }),
        cache: "no-store",
      }
    );
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      return { status: "failed", error: `Twilio HTTP ${res.status}: ${detail}` };
    }
    return { status: "sent" };
  } catch {
    return { status: "failed", error: "Network error reaching Twilio." };
  }
}

export async function sendEmail(
  to: string,
  subject: string,
  body: string
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { status: "logged" };
  const from = process.env.RESEND_FROM ?? "Driplin <onboarding@resend.dev>";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, text: body }),
      cache: "no-store",
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      return { status: "failed", error: `Resend HTTP ${res.status}: ${detail}` };
    }
    return { status: "sent" };
  } catch {
    return { status: "failed", error: "Network error reaching Resend." };
  }
}
