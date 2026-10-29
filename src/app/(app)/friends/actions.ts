"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (error?: string, message?: string): never =>
  redirect(`/friends${error ? `?error=${encodeURIComponent(error)}` : message ? `?message=${encodeURIComponent(message)}` : ""}`);

export async function sendFriendRequest(form: FormData) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("friend_request", { friend_email: str(form, "email") });
  revalidatePath("/friends");
  if (error) back(error.message);
  back(undefined, data === "accepted" ? "You are now friends." : "Request sent.");
}

export async function acceptFriend(form: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("friendships")
    .update({ status: "accepted" })
    .eq("requester_id", str(form, "user_id"))
    .eq("addressee_id", user!.id);
  revalidatePath("/friends");
  if (error) back(error.message);
  back();
}

export async function removeFriend(form: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const other = str(form, "user_id");
  await supabase.from("friendships").delete().or(`and(requester_id.eq.${user!.id},addressee_id.eq.${other}),and(requester_id.eq.${other},addressee_id.eq.${user!.id})`);
  revalidatePath("/friends");
  back();
}
