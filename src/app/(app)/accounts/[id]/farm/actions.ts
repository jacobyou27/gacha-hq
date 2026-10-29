"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => {
  const v = str(f, k);
  return v === "" ? null : Number(v);
};
function back(id: string, error?: string): never {
  redirect(`/accounts/${id}/farm${error ? `?error=${encodeURIComponent(error)}` : ""}`);
}

export async function saveFarmSettings(form: FormData) {
  const supabase = await createClient();
  const id = str(form, "account_id");
  const { data: acct } = await supabase.from("game_accounts").select("settings").eq("id", id).single<{ settings: Record<string, unknown> }>();
  const settings = { ...(acct?.settings ?? {}) };
  const set = (k: string, v: unknown) => { if (v === null || v === "" ) delete settings[k]; else settings[k] = v; };
  set("stamina_per_day", num(form, "stamina_per_day"));
  set("fuel", num(form, "fuel"));
  set("fuel_value", num(form, "fuel_value"));
  set("days_off", str(form, "days_off"));
  set("bank_cap", num(form, "bank_cap"));
  const { error } = await supabase.from("game_accounts").update({ settings }).eq("id", id);
  revalidatePath(`/accounts/${id}/farm`);
  if (error) back(id, error.message);
  back(id);
}

export async function addGoal(form: FormData) {
  const supabase = await createClient();
  const id = str(form, "account_id");
  const character_id = str(form, "character_id") || null;
  const label = str(form, "label") || null;
  if (!character_id && !label) back(id, "Pick a character or type a label.");
  const { error } = await supabase.from("farm_goals").insert({
    account_id: id,
    character_id,
    label,
    stamina_needed: num(form, "stamina_needed") ?? 0,
    priority: num(form, "priority") ?? 0,
    notes: str(form, "notes") || null,
  });
  revalidatePath(`/accounts/${id}/farm`);
  if (error) back(id, error.message);
  back(id);
}

export async function updateGoal(form: FormData) {
  const supabase = await createClient();
  const id = str(form, "account_id");
  const { error } = await supabase
    .from("farm_goals")
    .update({
      stamina_needed: num(form, "stamina_needed") ?? 0,
      priority: num(form, "priority") ?? 0,
      done: form.get("done") === "on",
      notes: str(form, "notes") || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", str(form, "goal_id"));
  revalidatePath(`/accounts/${id}/farm`);
  if (error) back(id, error.message);
  back(id);
}

export async function deleteGoal(form: FormData) {
  const supabase = await createClient();
  const id = str(form, "account_id");
  await supabase.from("farm_goals").delete().eq("id", str(form, "goal_id"));
  revalidatePath(`/accounts/${id}/farm`);
  back(id);
}

export async function addLog(form: FormData) {
  const supabase = await createClient();
  const id = str(form, "account_id");
  const { error } = await supabase.from("farm_log").insert({
    account_id: id,
    day: str(form, "day") || new Date().toISOString().slice(0, 10),
    goal_id: str(form, "goal_id") || null,
    stamina: num(form, "stamina") ?? 0,
    note: str(form, "note") || null,
  });
  revalidatePath(`/accounts/${id}/farm`);
  if (error) back(id, error.message);
  back(id);
}

export async function deleteLog(form: FormData) {
  const supabase = await createClient();
  const id = str(form, "account_id");
  await supabase.from("farm_log").delete().eq("id", str(form, "log_id"));
  revalidatePath(`/accounts/${id}/farm`);
  back(id);
}
