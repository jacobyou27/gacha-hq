"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => { const v = Number(str(f, k).replace(/,/g, "")); return isNaN(v) ? 0 : v; };
const KINDS = ["event", "archon", "story", "world", "exploration", "endgame", "other", "web", "recurring"];
const SECTION: Record<string, string> = { event: "event", web: "web", recurring: "recurring" };

/** "Common 79 x 2" per line -> [{ key: "common", label: "Common", count: 79, each: 2 }] (null when empty). */
function parsePools(text: string) {
  const out = text.split(/\n/).map((l) => l.trim().match(/^(.+?)\s+(\d+)\s*[x×*]\s*(\d+(?:\.\d+)?)$/i)).filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ key: m[1].toLowerCase().replace(/[^a-z0-9]+/g, "-"), label: m[1], count: Number(m[2]), each: Number(m[3]) }));
  return out.length ? out : null;
}

function fields(form: FormData) {
  const kind = KINDS.includes(str(form, "kind")) ? str(form, "kind") : "world";
  const minutes = str(form, "minutes");
  return {
    kind, section: SECTION[kind] ?? "new", name: str(form, "name"), primos: num(form, "primos"), intertwined: num(form, "intertwined"), acquaint: num(form, "acquaint"),
    minutes: minutes === "" ? null : Math.round(Number(minutes)) || 0,
    requires: str(form, "requires").split(/\n|;/).map((x) => x.trim()).filter(Boolean),
    is_estimate: form.get("is_estimate") === "on", note: str(form, "note") || null,
    region: str(form, "region") || null, pools: parsePools(str(form, "pools")),
  };
}
const back = (game: string, v: string, error?: string): never => redirect(`/income?game=${game}&v=${encodeURIComponent(v)}${error ? `&error=${encodeURIComponent(error)}` : ""}`);

/** Admins: edit one catalog line (RLS only lets admins write). */
export async function saveIncomeItem(form: FormData) {
  const supabase = await createClient();
  const game = str(form, "game_id"), v = str(form, "version");
  const { error } = await supabase.from("income_items").update(fields(form)).eq("id", str(form, "id"));
  revalidatePath("/income");
  back(game, v, error?.message);
}

export async function addIncomeItem(form: FormData) {
  const supabase = await createClient();
  const game = str(form, "game_id"), v = str(form, "version");
  if (!v || !str(form, "name")) back(game, v, "Version and name are required.");
  const { data: last } = await supabase.from("income_items").select("seq").eq("game_id", game).eq("version", v).order("seq", { ascending: false }).limit(1).maybeSingle<{ seq: number }>();
  const { error } = await supabase.from("income_items").insert({ game_id: game, version: v, seq: (last?.seq ?? 0) + 1, ...fields(form) });
  revalidatePath("/income");
  back(game, v, error?.message);
}

export async function deleteIncomeItem(form: FormData) {
  const supabase = await createClient();
  const game = str(form, "game_id"), v = str(form, "version");
  const { error } = await supabase.from("income_items").delete().eq("id", str(form, "id"));
  revalidatePath("/income");
  back(game, v, error?.message);
}
