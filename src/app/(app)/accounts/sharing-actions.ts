"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function back(accountId: string, error?: string, message?: string): never {
  const q = error ? `?error=${encodeURIComponent(error)}` : message ? `?message=${encodeURIComponent(message)}` : "";
  redirect(`/accounts/${accountId}${q}`);
}

export async function setVisibility(form: FormData) {
  const supabase = await createClient();
  const id = str(form, "id");
  const visibility = str(form, "visibility") === "public" ? "public" : "private";
  const { error } = await supabase.from("game_accounts").update({ visibility }).eq("id", id);
  revalidatePath(`/accounts/${id}`);
  revalidatePath(`/p/${id}`);
  if (error) back(id, error.message);
  back(id, undefined, visibility === "public" ? "Account is now public." : "Account is now private.");
}

export async function inviteMember(form: FormData) {
  const supabase = await createClient();
  const id = str(form, "id");
  const role = str(form, "role") === "editor" ? "editor" : "viewer";
  const { error } = await supabase.rpc("invite_member", {
    acct: id,
    member_email: str(form, "email"),
    member_role: role,
  });
  revalidatePath(`/accounts/${id}`);
  if (error) back(id, error.message);
  back(id, undefined, `Added as ${role}.`);
}

export async function removeMember(form: FormData) {
  const supabase = await createClient();
  const id = str(form, "id");
  const { error } = await supabase.rpc("remove_member", { acct: id, member: str(form, "user_id") });
  revalidatePath(`/accounts/${id}`);
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
  if (error) back(id, error.message);
  // If you removed yourself you can no longer see the page (unless it is public).
  if (form.get("self") === "1") redirect("/accounts");
  back(id);
}

export async function transferOwnership(form: FormData) {
  const supabase = await createClient();
  const id = str(form, "id");
  const { error } = await supabase.rpc("transfer_ownership", { acct: id, new_owner: str(form, "user_id") });
  revalidatePath(`/accounts/${id}`);
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
  if (error) back(id, error.message);
  back(id, undefined, "Ownership transferred. You are now an editor.");
}
