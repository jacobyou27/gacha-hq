"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Admin only (enforced by RLS; the form is also hidden for non-admins). */
export async function createCharacter(form: FormData) {
  const supabase = await createClient();
  const game_id = str(form, "game_id");

  const { error } = await supabase.from("characters").insert({
    game_id,
    name: str(form, "name"),
    rarity: Number(str(form, "rarity") || 5),
    element: str(form, "element") || null,
    weapon_type: str(form, "weapon_type") || null,
    version: str(form, "version") || null,
    is_limited: form.get("is_limited") === "on",
    is_free: form.get("is_free") === "on",
    is_released: form.get("is_released") === "on",
  });

  if (error) redirect(`/characters?game=${game_id}&error=${encodeURIComponent(error.message)}`);
  revalidatePath("/characters");
  redirect(`/characters?game=${game_id}`);
}

export async function deleteCharacter(form: FormData) {
  const supabase = await createClient();
  const game_id = str(form, "game_id");
  const { error } = await supabase.from("characters").delete().eq("id", str(form, "id"));
  if (error) redirect(`/characters?game=${game_id}&error=${encodeURIComponent(error.message)}`);
  revalidatePath("/characters");
}
