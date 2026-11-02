"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const NUM_KEYS = ["primos", "intertwined", "acquaint", "abyss_stars", "theater_acts", "stygian", "hours_per_week"];
const BOOL_KEYS = ["commissions", "web"];
const DATE_KEYS = ["as_of", "welkin_until"];
const UUID = /^[0-9a-f-]{36}$/;

/** Only known settings keys, right types. */
function cleanSettings(raw: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of NUM_KEYS) { const v = Number(String(raw[k] ?? "").replace(/,/g, "")); if (raw[k] !== "" && raw[k] !== undefined && raw[k] !== null && !isNaN(v)) out[k] = v; }
  for (const k of BOOL_KEYS) if (raw[k] !== undefined) out[k] = raw[k] === true || raw[k] === "true";
  for (const k of DATE_KEYS) { const v = String(raw[k] ?? ""); if (/^\d{4}-\d{2}-\d{2}$/.test(v)) out[k] = v; }
  out.bp = ["none", "free", "paid"].includes(String(raw.bp)) ? raw.bp : "free";
  return out;
}

type EntryIn = { status?: unknown; amount?: unknown; counts?: unknown; primos_override?: unknown } | null;
const numOrNull = (v: unknown, max = Infinity) => { if (v === null || v === undefined || v === "") return null; const n = Number(v); return isNaN(n) ? null : Math.max(0, Math.min(max, n)); };

/**
 * Autosaved from the forecast page: the account's forecast settings (or null = unchanged) and the plan entries that
 * changed ({ item_id: entry } — null removes the item from the plan). RLS: only owners / editors can write.
 */
export async function savePlan(accountId: string, settingsIn: Record<string, unknown> | null, changes: Record<string, EntryIn>): Promise<{ error: string | null }> {
  if (!UUID.test(accountId)) return { error: "Unknown account." };
  const supabase = await createClient();
  if (settingsIn) {
    const { data: acct, error: e0 } = await supabase.from("game_accounts").select("settings").eq("id", accountId).single<{ settings: Record<string, unknown> | null }>();
    if (e0) return { error: e0.message };
    const { error } = await supabase.from("game_accounts").update({ settings: { ...(acct?.settings ?? {}), income: cleanSettings(settingsIn) } }).eq("id", accountId);
    if (error) return { error: error.message };
  }
  const now = new Date().toISOString();
  const upserts: Record<string, unknown>[] = [];
  const removes: string[] = [];
  for (const [item, e] of Object.entries(changes ?? {})) {
    if (!UUID.test(item)) continue;
    if (!e) { removes.push(item); continue; }
    let counts: Record<string, number> | null = null;
    if (e.counts && typeof e.counts === "object") {
      counts = {};
      for (const [k, v] of Object.entries(e.counts as Record<string, unknown>)) { const n = numOrNull(v, 10000); if (n !== null && /^[a-z0-9-]{1,40}$/.test(k)) counts[k] = Math.round(n); }
    }
    upserts.push({
      account_id: accountId, item_id: item, status: e.status === "done" ? "done" : "todo", updated_at: now,
      amount: numOrNull(e.amount, 100), counts, primos_override: numOrNull(e.primos_override, 1e6),
    });
  }
  for (let i = 0; i < upserts.length; i += 500) {
    const { error } = await supabase.from("account_income_items").upsert(upserts.slice(i, i + 500), { onConflict: "account_id,item_id" });
    if (error) return { error: error.message };
  }
  for (let i = 0; i < removes.length; i += 200) {
    const { error } = await supabase.from("account_income_items").delete().eq("account_id", accountId).in("item_id", removes.slice(i, i + 200));
    if (error) return { error: error.message };
  }
  revalidatePath("/calendar");
  return { error: null };
}
