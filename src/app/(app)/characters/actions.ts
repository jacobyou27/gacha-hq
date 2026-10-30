"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (game: string, error?: string, message?: string): never => {
  const q = new URLSearchParams({ game });
  if (error) q.set("error", error);
  if (message) q.set("message", message);
  redirect(`/characters?${q.toString()}`);
};

const FARM_KEYS = ["books", "boss", "weekly", "specialty", "common", "family", "profile", "extra_max", "extra2_max"] as const;
/** Farming attributes typed on the form (farm_* fields): Genshin books / boss / weekly …; "a|b|c" books = one series per talent (Traveler). */
function farmFrom(form: FormData, old: Record<string, unknown> = {}) {
  const farm: Record<string, unknown> = { ...old };
  for (const k of FARM_KEYS) {
    if (!form.has(`farm_${k}`)) continue;
    const v = str(form, `farm_${k}`);
    if (!v) delete farm[k];
    else farm[k] = k === "books" && v.includes("|") ? v.split("|").map((x) => x.trim()) : k === "extra_max" || k === "extra2_max" ? Number(v) || 0 : v;
  }
  return farm;
}

/** Admin only (enforced by RLS). Works for leaks too: untick "released", set source = leak. */
export async function createCharacter(form: FormData) {
  const supabase = await createClient();
  const game_id = str(form, "game_id");
  const { error } = await supabase.from("characters").insert({
    game_id,
    name: str(form, "name"),
    rarity: Number(str(form, "rarity") || 5),
    element: str(form, "element") || null,
    weapon_type: str(form, "weapon_type") || null,
    region: str(form, "region") || null,
    version: str(form, "version") || null,
    is_limited: form.get("is_limited") === "on",
    is_free: form.get("is_free") === "on",
    is_released: form.get("is_released") === "on",
    source: str(form, "source") || (form.get("is_released") === "on" ? "official" : "leak"),
    notes: str(form, "notes") || null,
    farm: farmFrom(form),
  });
  revalidatePath("/characters");
  if (error) back(game_id, error.message.includes("duplicate") ? "That character already exists for this game." : error.message);
  back(game_id, undefined, "Added.");
}

/** Admin: quick edits on an existing row (version / released / limited / rarity / element / weapon). */
export async function updateCharacter(form: FormData) {
  const supabase = await createClient();
  const game_id = str(form, "game_id");
  const { data: old } = await supabase.from("characters").select("farm").eq("id", str(form, "id")).single<{ farm: Record<string, unknown> }>();
  const { error } = await supabase
    .from("characters")
    .update({
      farm: farmFrom(form, old?.farm ?? {}),
      name: str(form, "name"),
      rarity: Number(str(form, "rarity") || 5),
      element: str(form, "element") || null,
      weapon_type: str(form, "weapon_type") || null,
      region: str(form, "region") || null,
      version: str(form, "version") || null,
      is_limited: form.get("is_limited") === "on",
      is_free: form.get("is_free") === "on",
      is_released: form.get("is_released") === "on",
      source: str(form, "source") || null,
    })
    .eq("id", str(form, "id"));
  revalidatePath("/characters");
  if (error) back(game_id, error.message);
  back(game_id);
}

export async function deleteCharacter(form: FormData) {
  const supabase = await createClient();
  const game_id = str(form, "game_id");
  const { error } = await supabase.from("characters").delete().eq("id", str(form, "id"));
  revalidatePath("/characters");
  if (error) back(game_id, error.message);
  back(game_id);
}

/** Any user: my own "game want" for a character. Empty = clear. */
export async function setWant(form: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const game_id = str(form, "game_id");
  const character_id = str(form, "character_id");
  const want = str(form, "want");
  const note = str(form, "note") || null;
  const q = want
    ? supabase.from("character_wants").upsert({ user_id: user!.id, character_id, want, note, updated_at: new Date().toISOString() }, { onConflict: "user_id,character_id" })
    : supabase.from("character_wants").delete().eq("user_id", user!.id).eq("character_id", character_id);
  const { error } = await q;
  revalidatePath("/characters");
  if (error) back(game_id, error.message);
  back(game_id);
}
