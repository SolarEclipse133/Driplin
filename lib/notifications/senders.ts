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

/**
 * Turn a provider's raw rejection into something a non-engineer can act
 * on. These are account/plan limits people hit constantly while setting
 * up, and the raw JSON tells them nothing.
 */
function explainProviderError(provider: "twilio" | "resend", body: string): string {
  if (provider === "twilio") {
    if (body.includes("572006") || body.includes("predefined SMS templates")) {
      return "Twilio trial accounts can only send their own canned templates, not custom alerts. Upgrade the Twilio account (add funds) to enable Driplin's SMS alerts.";
    }
    if (body.includes("21608") || body.includes("unverified")) {
      return "Twilio trial accounts can only text numbers you have verified. Verify this number in the Twilio console, or upgrade the account.";
    }
    if (body.includes("21211")) {
      return "That phone number isn't valid. Use the format +15125551234.";
    }
  }
  if (provider === "resend") {
    if (body.includes("only send testing emails to your own email address")) {
      return "Resend's free tier only delivers to the address the Resend account was created with. Verify a sending domain in Resend to email anyone else.";
    }
    if (body.includes("domain is invalid")) {
      return "Resend rejected the sender address. Check the RESEND_FROM setting, or leave it unset to use the default testing sender.";
    }
  }
  return body.slice(0, 300);
}

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
      return {
        status: "failed",
        error: explainProviderError("twilio", await res.text()),
      };
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
  // Truthy check, not ??: an env var present-but-empty (easy to do in a
  // hosting dashboard) would otherwise become an empty From address,
  // which Resend rejects with a confusing "domain is invalid".
  const from = process.env.RESEND_FROM || "Driplin <onboarding@resend.dev>";

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
      return {
        status: "failed",
        error: explainProviderError("resend", await res.text()),
      };
    }
    return { status: "sent" };
  } catch {
    return { status: "failed", error: "Network error reaching Resend." };
  }
}
