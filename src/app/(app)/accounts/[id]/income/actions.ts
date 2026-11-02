"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const bool = (f: FormData, k: string) => f.get(k) === "on" || f.get(k) === "true";
function back(id: string, qs = "", error?: string): never {
  const q = new URLSearchParams(qs);
  if (error) q.set("error", error);
  const s = q.toString();
  redirect(`/accounts/${id}/income${s ? `?${s}` : ""}`);
}

export async function saveIncomeSettings(form: FormData) {
  const supabase = await createClient();
  const id = str(form, "account_id");
  const { data: acct } = await supabase.from("game_accounts").select("settings").eq("id", id).single<{ settings: Record<string, unknown> }>();
  const settings = { ...(acct?.settings ?? {}) };
  const income: Record<string, unknown> = {};
  for (const k of ["primos", "intertwined", "acquaint", "abyss_stars", "theater_acts", "stygian", "explore_pct", "hours_per_week"]) {
    const v = str(form, k).replace(/,/g, "");
    if (v !== "" && !isNaN(Number(v))) income[k] = Number(v);
  }
  for (const k of ["as_of", "welkin_until"]) { const v = str(form, k); if (v) income[k] = v; }
  income.bp = ["none", "free", "paid"].includes(str(form, "bp")) ? str(form, "bp") : "free";
  income.caught_up_through = str(form, "caught_up_through");
  for (const k of ["commissions", "archon", "story", "world", "events", "other", "web", "future_estimates"]) income[k] = bool(form, k);
  if (!income.as_of) income.as_of = new Date().toISOString().slice(0, 10);
  settings.income = income;
  const { error } = await supabase.from("game_accounts").update({ settings }).eq("id", id);
  revalidatePath(`/accounts/${id}/income`);
  back(id, str(form, "qs"), error?.message);
}

/** Mark one catalog item done / skip / to do for this account ("clear" = back to the default). */
export async function markIncomeItem(form: FormData) {
  const supabase = await createClient();
  const id = str(form, "account_id"), item = str(form, "item_id"), status = str(form, "status");
  const { error } = status === "clear"
    ? await supabase.from("account_income_items").delete().eq("account_id", id).eq("item_id", item)
    : await supabase.from("account_income_items").upsert({ account_id: id, item_id: item, status, updated_at: new Date().toISOString() }, { onConflict: "account_id,item_id" });
  revalidatePath(`/accounts/${id}/income`);
  back(id, str(form, "qs"), error?.message);
}

/** Mark every quest / event / exploration item of one version at once. */
export async function markIncomeVersion(form: FormData) {
  const supabase = await createClient();
  const id = str(form, "account_id"), version = str(form, "version"), status = str(form, "status");
  const { data: acct } = await supabase.from("game_accounts").select("game_id").eq("id", id).single<{ game_id: string }>();
  const { data: items } = await supabase.from("income_items").select("id").eq("game_id", acct?.game_id ?? "").eq("version", version).in("section", ["event", "new"]).returns<{ id: string }[]>();
  const ids = (items ?? []).map((i) => i.id);
  let error: { message: string } | null = null;
  if (ids.length) {
    if (status === "clear") ({ error } = await supabase.from("account_income_items").delete().eq("account_id", id).in("item_id", ids));
    else ({ error } = await supabase.from("account_income_items").upsert(ids.map((item_id) => ({ account_id: id, item_id, status, updated_at: new Date().toISOString() })), { onConflict: "account_id,item_id" }));
  }
  revalidatePath(`/accounts/${id}/income`);
  back(id, str(form, "qs"), error?.message);
}
