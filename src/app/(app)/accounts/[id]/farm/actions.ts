"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadFarm } from "@/lib/farm/load";
import { dayRowsFor, isoDay, parseDay } from "@/lib/farm/plan";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => { const v = str(f, k); return v === "" ? null : Number(v); };
const bool = (f: FormData, k: string) => f.get(k) === "on" || f.get(k) === "true";
function back(id: string, sub = "", error?: string, message?: string): never {
  const q = new URLSearchParams();
  if (error) q.set("error", error);
  if (message) q.set("message", message);
  const qs = q.toString();
  if (sub === "dashboard") redirect(`/dashboard${qs ? `?${qs}` : ""}`);
  redirect(`/accounts/${id}/farm${sub}${qs ? `?${qs}` : ""}`);
}
function revalidate(id: string) {
  ["", "/inventory", "/schedule", "/log"].forEach((p) => revalidatePath(`/accounts/${id}/farm${p}`));
  revalidatePath("/dashboard");
}

export async function saveFarmSettings(form: FormData) {
  const supabase = await createClient();
  const id = str(form, "account_id");
  const { data: acct } = await supabase.from("game_accounts").select("settings").eq("id", id).single<{ settings: Record<string, unknown> }>();
  const settings = { ...(acct?.settings ?? {}) };
  const set = (k: string, v: unknown) => { if (v === null || v === "" || v === undefined) delete settings[k]; else settings[k] = v; };
  set("stamina_per_day", num(form, "stamina_per_day"));
  set("wl", num(form, "wl"));
  set("book_opt", num(form, "book_opt"));
  set("wpn_opt", num(form, "wpn_opt"));
  set("extra_week", num(form, "extra_week"));
  set("fuel", num(form, "fuel"));
  set("bank_cap", num(form, "bank_cap"));
  set("weekly_day", num(form, "weekly_day"));
  set("days_off", str(form, "days_off"));
  set("order", str(form, "order") === "deadline" ? "deadline" : null);
  set("drop_case", str(form, "drop_case") === "avg" ? null : str(form, "drop_case"));
  settings.ley = bool(form, "ley");
  settings.solvent = bool(form, "solvent");
  settings.allow60 = bool(form, "allow60");
  settings.mon_boss = bool(form, "mon_boss");
  settings.stygian_skip = bool(form, "stygian_skip");
  settings.overflow = bool(form, "overflow");
  const { error } = await supabase.from("game_accounts").update({ settings }).eq("id", id);
  revalidate(id);
  if (error) back(id, "", error.message);
  back(id, "", undefined, "Settings saved.");
}

function inputsFrom(form: FormData) {
  const keys = ["lv_now", "lv_goal", "na_now", "na_goal", "skill_now", "skill_goal", "burst_now", "burst_goal", "wpn_rarity", "wpn_now", "wpn_goal"];
  const inputs: Record<string, unknown> = {};
  for (const k of keys) { const v = num(form, k); if (v !== null && !isNaN(v)) inputs[k] = v; }
  const series = str(form, "wpn_series");
  if (series) inputs.wpn_series = series;
  return inputs;
}

export async function addBuild(form: FormData) {
  const supabase = await createClient();
  const id = str(form, "account_id");
  const character_id = str(form, "character_id");
  if (!character_id) back(id, "", "Pick a character.");
  const { error } = await supabase.from("farm_builds").insert({
    account_id: id, character_id, priority: num(form, "priority") ?? 999, inputs: inputsFrom(form),
    deadline: str(form, "deadline") || null, banner: str(form, "banner") || null, notes: str(form, "notes") || null,
  });
  revalidate(id);
  if (error) back(id, "", error.message);
  back(id);
}

export async function updateBuild(form: FormData) {
  const supabase = await createClient();
  const id = str(form, "account_id"), bid = str(form, "build_id");
  const { data: old } = await supabase.from("farm_builds").select("inputs").eq("id", bid).single<{ inputs: Record<string, unknown> }>();
  const inputs = inputsFrom(form);
  // a change to a "now" level restarts the run counting (like the sheet's countedAt stamp)
  const nowKeys = ["lv_now", "na_now", "skill_now", "burst_now", "wpn_now", "wpn_series", "wpn_rarity"];
  const restart = nowKeys.some((k) => String(old?.inputs?.[k] ?? "") !== String(inputs[k] ?? ""));
  const { error } = await supabase.from("farm_builds").update({
    priority: num(form, "priority") ?? 999, inputs, deadline: str(form, "deadline") || null, banner: str(form, "banner") || null,
    notes: str(form, "notes") || null, done: bool(form, "done"), ...(restart ? { counted_at: new Date().toISOString() } : {}),
  }).eq("id", bid);
  revalidate(id);
  if (error) back(id, "", error.message);
  back(id);
}

export async function reopenBuild(form: FormData) {
  const supabase = await createClient();
  const id = str(form, "account_id");
  const { error } = await supabase.from("farm_builds").update({ done: false }).eq("id", str(form, "build_id"));
  revalidate(id);
  if (error) back(id, "", error.message);
  back(id);
}

export async function deleteBuild(form: FormData) {
  const supabase = await createClient();
  const id = str(form, "account_id");
  const { error } = await supabase.from("farm_builds").delete().eq("id", str(form, "build_id"));
  revalidate(id);
  if (error) back(id, "", error.message);
  back(id);
}

/** Done / Skip / Undo for one game day. mode = done | skip | undo. */
export async function logDay(form: FormData) {
  const supabase = await createClient();
  const id = str(form, "account_id"), mode = str(form, "mode"), ret = str(form, "return") || "";
  const dayIso = str(form, "day");
  const day = dayIso ? parseDay(dayIso) : null;
  if (day === null) back(id, ret, "No day given.");
  const data = await loadFarm(id);
  if (!data.canEdit) back(id, ret, "You can't edit this account.");
  await supabase.from("farm_days").delete().eq("account_id", id).eq("day", isoDay(day));
  if (mode === "skip") {
    const s = data.plan.settings;
    const prev = data.log.find((l) => parseDay(l.day) === day - 1);
    const pool = (s.cap > 0 ? Number(prev?.stamina_left ?? 0) : 0) + s.resinPerDay;
    await supabase.from("farm_days").insert({ account_id: id, day: isoDay(day), character: "(skipped)", status: "skipped", runs: {}, stamina_left: Math.round(Math.min(pool, s.cap)), text: `Skipped — ${data.game.stamina_name} spent elsewhere` });
  } else if (mode === "done") {
    const rows = dayRowsFor(data.plan, data, day).map((r) => ({ ...r, account_id: id, day: isoDay(day) }));
    const { error } = await supabase.from("farm_days").insert(rows);
    if (error) { revalidate(id); back(id, ret, error.message); }
  }
  revalidate(id);
  back(id, ret);
}

export async function deleteDay(form: FormData) {
  const supabase = await createClient();
  const id = str(form, "account_id");
  await supabase.from("farm_days").delete().eq("id", str(form, "day_id"));
  revalidate(id);
  back(id, "/log");
}

/** Real drops typed on a log row (optional) — the planner then counts those instead of average drops. */
export async function saveDrops(form: FormData) {
  const supabase = await createClient();
  const id = str(form, "account_id");
  const drops: Record<string, number> = {};
  for (const k of ["bookT", "bookG", "bookP", "wpn2", "wpn3", "wpn4", "wpn5", "boss", "wk"]) { const v = num(form, k); if (v !== null && !isNaN(v)) drops[k] = v; }
  await supabase.from("farm_days").update({ drops }).eq("id", str(form, "day_id"));
  revalidate(id);
  back(id, "/log");
}

/** Inventory: every input named kind|key. Blank = 0. Stamps the count so earlier logged runs stop being subtracted. */
export async function saveInventory(form: FormData) {
  const supabase = await createClient();
  const id = str(form, "account_id");
  const rows: { account_id: string; kind: string; key: string; qty: number }[] = [];
  for (const [name, value] of form.entries()) {
    if (!name.includes("|")) continue;
    const [kind, key] = name.split("|");
    const v = String(value).replace(/,/g, "").trim();
    rows.push({ account_id: id, kind, key, qty: v === "" ? 0 : Number(v) || 0 });
  }
  const { error } = await supabase.from("farm_inventory").upsert(rows, { onConflict: "account_id,kind,key" });
  if (!error) {
    const { data: acct } = await supabase.from("game_accounts").select("settings").eq("id", id).single<{ settings: Record<string, unknown> }>();
    await supabase.from("game_accounts").update({ settings: { ...(acct?.settings ?? {}), inv_counted_at: new Date().toISOString() } }).eq("id", id);
  }
  revalidate(id);
  if (error) back(id, "/inventory", error.message);
  back(id, "/inventory", undefined, "Inventory saved.");
}

/** Admin: overflow weeks (double-drop events) for a game. */
export async function addEvent(form: FormData) {
  const supabase = await createClient();
  const id = str(form, "account_id");
  const { error } = await supabase.from("farm_events").insert({ game_id: str(form, "game_id"), kind: str(form, "kind"), starts_on: str(form, "starts_on"), ends_on: str(form, "ends_on"), note: str(form, "note") || null });
  revalidate(id);
  if (error) back(id, "", error.message);
  back(id);
}
export async function deleteEvent(form: FormData) {
  const supabase = await createClient();
  const id = str(form, "account_id");
  await supabase.from("farm_events").delete().eq("id", str(form, "event_id"));
  revalidate(id);
  back(id);
}
