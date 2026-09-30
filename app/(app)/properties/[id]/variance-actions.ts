"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { WEEKDAYS, type Weekday } from "@/lib/controllers/types";
import type { VarianceKind } from "@/lib/rules/variance";

export type VarianceState = { error: string | null; success: string | null };

const KINDS: VarianceKind[] = [
  "new_landscape",
  "large_property",
  "environmental",
  "other",
];

/**
 * Record an approval the utility granted.
 *
 * Deliberately strict about the reference number and the expiry date.
 * A variance with no reference cannot be checked with the utility, and
 * one with no end date quietly becomes a permanent excuse — both would
 * turn this feature into a way to silence Driplin rather than a way to
 * describe a property honestly.
 */
export async function addVariance(
  _prev: VarianceState,
  formData: FormData
): Promise<VarianceState> {
  const propertyId = String(formData.get("property_id") ?? "");
  const reference = String(formData.get("reference") ?? "").trim();
  const kind = String(formData.get("kind") ?? "other") as VarianceKind;
  const approvedOn = String(formData.get("approved_on") ?? "");
  const expiresOn = String(formData.get("expires_on") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  const anyDay = formData.get("any_day") === "on";
  const days = WEEKDAYS.filter((d) => formData.get(`day_${d}`) === "on");
  const windowStart = String(formData.get("window_start") ?? "").trim();
  const windowEnd = String(formData.get("window_end") ?? "").trim();

  const fail = (error: string): VarianceState => ({ error, success: null });

  if (!propertyId) return fail("Missing property.");
  if (!reference)
    return fail(
      "Enter the approval or reference number from the utility's letter. Driplin will not act on a variance nobody can look up."
    );
  if (!KINDS.includes(kind)) return fail("Choose a variance type.");
  if (!approvedOn) return fail("Enter the date the utility approved it.");
  if (!expiresOn)
    return fail(
      "Enter the date it expires. Driplin needs this so the property does not stay excused after the approval runs out."
    );
  if (expiresOn < approvedOn)
    return fail("The expiry date is before the approval date.");
  if (!anyDay && days.length === 0)
    return fail(
      "Tick the days the approval permits, or 'any day' if it sets no day limit."
    );

  const hasWindow = windowStart !== "" && windowEnd !== "";
  if ((windowStart === "") !== (windowEnd === ""))
    return fail("Enter both a start and an end time, or leave both blank.");
  if (hasWindow && windowEnd <= windowStart)
    return fail("The end time is not after the start time.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("You are no longer signed in.");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, org_id, full_name, email")
    .eq("id", user.id)
    .single();
  if (!profile) return fail("Your account has no organization.");

  // The stage in force now is the stage it was granted under. Austin
  // narrows which variances stay valid as stages tighten, so recording
  // this is what lets Driplin flag it later.
  const { data: property } = await supabase
    .from("properties")
    .select("jurisdiction")
    .eq("id", propertyId)
    .single();
  const { data: stageRow } = await supabase
    .from("drought_stage_status")
    .select("current_stage")
    .eq("jurisdiction", property?.jurisdiction ?? "austin")
    .maybeSingle();

  const { error } = await supabase.from("property_variances").insert({
    org_id: profile.org_id,
    property_id: propertyId,
    kind,
    reference,
    approved_on: approvedOn,
    expires_on: expiresOn,
    approved_at_stage: stageRow?.current_stage ?? 0,
    allowed_days: anyDay ? null : (days as Weekday[]),
    allowed_windows: hasWindow
      ? [{ start: windowStart, end: windowEnd }]
      : [],
    notes: notes || null,
    created_by: profile.id,
    created_by_name: profile.full_name?.trim() || profile.email || null,
  });

  if (error) return fail("Could not save that variance. Try again.");

  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/dashboard");
  return {
    error: null,
    success:
      "Variance recorded. Driplin will judge this property against it until it expires, and will not change the controller automatically while it applies.",
  };
}

/** Remove a variance that was entered in error. */
export async function removeVariance(formData: FormData): Promise<void> {
  const id = String(formData.get("variance_id") ?? "");
  const propertyId = String(formData.get("property_id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  // RLS scopes this to the viewer's organization.
  await supabase.from("property_variances").delete().eq("id", id);
  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/dashboard");
}
