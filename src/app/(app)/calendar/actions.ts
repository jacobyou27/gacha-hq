"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (form: FormData, error?: string): never => {
  const q = new URLSearchParams({ game: str(form, "game_id") });
  if (str(form, "account")) q.set("account", str(form, "account"));
  if (error) q.set("error", error);
  redirect(`/calendar?${q.toString()}`);
};
function refresh() { revalidatePath("/calendar"); revalidatePath("/dashboard"); }

/** Admins: set a version's start (and optional end). Everything after the newest version is projected in 42-day steps. */
export async function saveVersion(form: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from("game_versions").upsert({
    game_id: str(form, "game_id"), version: str(form, "version"), starts_on: str(form, "starts_on") || null, ends_on: str(form, "ends_on") || null, is_estimate: form.get("is_estimate") === "on",
  }, { onConflict: "game_id,version" });
  refresh();
  back(form, error?.message);
}

export async function deleteVersion(form: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from("game_versions").delete().eq("game_id", str(form, "game_id")).eq("version", str(form, "version"));
  refresh();
  back(form, error?.message);
}

/** Admins: put a character on a banner phase. */
export async function addBanner(form: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from("banners").insert({
    game_id: str(form, "game_id"), version: str(form, "version"), phase: Number(str(form, "phase")) === 2 ? 2 : 1, character_id: str(form, "character_id"),
    is_rerun: form.get("is_rerun") === "on", is_estimate: form.get("is_estimate") === "on",
  });
  refresh();
  back(form, error?.message);
}

export async function deleteBanner(form: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from("banners").delete().eq("id", str(form, "id"));
  refresh();
  back(form, error?.message);
}
