"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => {
  const v = str(f, k);
  return v === "" ? null : Number(v);
};

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

// ---------------------------------------------------------------- accounts

export async function createAccount(form: FormData) {
  const { supabase, user } = await requireUser();
  const game_id = str(form, "game_id");
  const name = str(form, "name");
  if (!game_id || !name) return;

  const { data, error } = await supabase
    .from("game_accounts")
    .insert({
      user_id: user.id,
      game_id,
      name,
      server: str(form, "server") || null,
      uid: str(form, "uid") || null,
    })
    .select("id")
    .single();

  if (error) {
    const msg =
      error.code === "23505" && /game_uid/.test(error.message)
        ? "That UID is already claimed by another account. If it is yours, prove it on the Claim page."
        : error.message;
    redirect(`/accounts?game=${game_id}&error=${encodeURIComponent(msg)}`);
  }
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
  redirect(`/accounts/${data.id}`);
}

export async function updateAccount(form: FormData) {
  const { supabase } = await requireUser();
  const id = str(form, "id");
  const { error } = await supabase
    .from("game_accounts")
    .update({
      name: str(form, "name"),
      server: str(form, "server") || null,
      uid: str(form, "uid") || null,
      status: str(form, "status"),
      world_level: num(form, "world_level"),
      color: str(form, "color") || null,
      sort_order: num(form, "sort_order") ?? 0,
      notes: str(form, "notes") || null,
    })
    .eq("id", id);

  if (error) {
    const msg =
      error.code === "23505" && /game_uid/.test(error.message)
        ? "That UID is already claimed by another account. If it is yours, prove it on the Claim page."
        : error.message;
    redirect(`/accounts/${id}?error=${encodeURIComponent(msg)}`);
  }
  revalidatePath(`/accounts/${id}`);
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
}

export async function deleteAccount(form: FormData) {
  const { supabase } = await requireUser();
  const id = str(form, "id");
  const game_id = str(form, "game_id");
  await supabase.from("game_accounts").delete().eq("id", id);
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
  redirect(`/accounts?game=${game_id}`);
}

// ------------------------------------------------------ account characters

export async function addAccountCharacter(form: FormData) {
  const { supabase } = await requireUser();
  const account_id = str(form, "account_id");
  const character_id = str(form, "character_id");
  if (!account_id || !character_id) return;

  const { error } = await supabase.from("account_characters").insert({
    account_id,
    character_id,
    owned: form.get("owned") === "on",
    wanted: form.get("wanted") === "on",
  });
  if (error) redirect(`/accounts/${account_id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/accounts/${account_id}`);
}

export async function updateAccountCharacter(form: FormData) {
  const { supabase } = await requireUser();
  const id = str(form, "id");
  const account_id = str(form, "account_id");

  const { error } = await supabase
    .from("account_characters")
    .update({
      owned: form.get("owned") === "on",
      dupes: num(form, "dupes") ?? 0,
      signature: num(form, "signature") ?? 0,
      goal_dupes: num(form, "goal_dupes"),
      goal_signature: num(form, "goal_signature"),
      wanted: form.get("wanted") === "on" || num(form, "goal_dupes") !== null,
      want_level: str(form, "want_level") || null,
      free_copies: num(form, "free_copies") ?? 0,
      level: num(form, "level"),
      goal_level: num(form, "goal_level"),
      priority: num(form, "priority") ?? 0,
      notes: str(form, "notes") || null,
    })
    .eq("id", id);

  if (error) redirect(`/accounts/${account_id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/accounts/${account_id}`);
}

export async function removeAccountCharacter(form: FormData) {
  const { supabase } = await requireUser();
  const id = str(form, "id");
  const account_id = str(form, "account_id");
  await supabase.from("account_characters").delete().eq("id", id);
  revalidatePath(`/accounts/${account_id}`);
}
