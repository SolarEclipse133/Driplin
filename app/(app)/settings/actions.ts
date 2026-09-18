"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SettingsState = { error: string | null; success: string | null };

/** US phone in E.164, e.g. +15125551234 (what Twilio needs). */
const PHONE_RE = /^\+1[0-9]{10}$/;

export async function updateProfile(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const phoneRaw = String(formData.get("phone") ?? "").trim();

  if (!fullName) return { error: "Please enter your name.", success: null };

  // Normalize common phone formats to +1XXXXXXXXXX; empty clears it.
  let phone: string | null = null;
  if (phoneRaw) {
    const digits = phoneRaw.replace(/[^0-9]/g, "");
    const normalized =
      digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith("1") ? `+${digits}` : phoneRaw;
    if (!PHONE_RE.test(normalized))
      return {
        error: "Enter a US phone number like (512) 555-1234, or leave it blank.",
        success: null,
      };
    phone = normalized;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are no longer signed in.", success: null };

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName, phone })
    .eq("id", user.id);
  if (error) return { error: "Could not save your settings.", success: null };

  revalidatePath("/settings");
  return {
    error: null,
    success: phone
      ? "Saved. Compliance alerts will be texted to your phone and emailed."
      : "Saved. Compliance alerts will be emailed (no phone number set).",
  };
}
