"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

const NUM_KEYS = ["primos", "intertwined", "acquaint", "abyss_stars", "theater_acts", "stygian", "explore_pct", "hours_per_week"];
const BOOL_KEYS = ["commissions", "web", "events", "future_quests", "future_estimates"];
const DATE_KEYS = ["as_of", "welkin_until"];

/** Clean the settings object the planner sends (only known keys, right types). */
function cleanSettings(raw: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of NUM_KEYS) { const v = Number(String(raw[k] ?? "").replace(/,/g, "")); if (raw[k] !== "" && raw[k] !== undefined && raw[k] !== null && !isNaN(v)) out[k] = v; }
  for (const k of BOOL_KEYS) if (raw[k] !== undefined) out[k] = raw[k] === true || raw[k] === "true";
  for (const k of DATE_KEYS) { const v = String(raw[k] ?? ""); if (/^\d{4}-\d{2}-\d{2}$/.test(v)) out[k] = v; }
  out.bp = ["none", "free", "paid"].includes(String(raw.bp)) ? raw.bp : "free";
  out.caught_up_through = /^\d+\.\d+$/.test(String(raw.caught_up_through ?? "")) ? String(raw.caught_up_through) : "";
  return out;
}

/**
 * Save the whole plan at once: forecast settings + the ticks that changed.
 * marks = { item_id: "todo" | "skip" | "done" | "clear" } (clear = back to the default).
 */
export async function saveIncomePlan(form: FormData) {
  const supabase = await createClient();
  const id = str(form, "account_id");
  const back = (error?: string): never => redirect(`/accounts/${id}/income?saved=${Date.now()}${str(form, "until") ? `&until=${str(form, "until")}` : ""}${error ? `&error=${encodeURIComponent(error)}` : ""}`);
  let settingsIn: Record<string, unknown> = {}, marksIn: Record<string, string> = {};
  try { settingsIn = JSON.parse(str(form, "settings") || "{}"); marksIn = JSON.parse(str(form, "marks") || "{}"); } catch { back("Could not read the plan — try again."); }

  const { data: acct } = await supabase.from("game_accounts").select("settings").eq("id", id).single<{ settings: Record<string, unknown> }>();
  const settings = { ...(acct?.settings ?? {}), income: cleanSettings(settingsIn) };
  const { error: e1 } = await supabase.from("game_accounts").update({ settings }).eq("id", id);
  if (e1) back(e1.message);

  const now = new Date().toISOString();
  const upserts: { account_id: string; item_id: string; status: string; updated_at: string }[] = [];
  const clears: string[] = [];
  for (const [item, st] of Object.entries(marksIn)) {
    if (!/^[0-9a-f-]{36}$/.test(item)) continue;
    if (st === "clear") clears.push(item);
    else if (["todo", "skip", "done"].includes(st)) upserts.push({ account_id: id, item_id: item, status: st, updated_at: now });
  }
  for (let i = 0; i < upserts.length; i += 500) {
    const { error } = await supabase.from("account_income_items").upsert(upserts.slice(i, i + 500), { onConflict: "account_id,item_id" });
    if (error) back(error.message);
  }
  for (let i = 0; i < clears.length; i += 200) {
    const { error } = await supabase.from("account_income_items").delete().eq("account_id", id).in("item_id", clears.slice(i, i + 200));
    if (error) back(error.message);
  }
  revalidatePath(`/accounts/${id}/income`);
  revalidatePath("/calendar");
  back();
}
