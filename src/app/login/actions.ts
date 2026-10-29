"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

function str(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

export async function signIn(form: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: str(form, "email"),
    password: str(form, "password"),
  });
  const next = str(form, "next");
  const safeNext = next.startsWith("/") ? next : "/dashboard";
  if (error) {
    redirect(
      `/login?error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(safeNext)}`,
    );
  }
  redirect(safeNext);
}

export async function signUp(form: FormData) {
  const supabase = await createClient();
  const origin = (await headers()).get("origin") ?? "";
  const email = str(form, "email");

  const { data, error } = await supabase.auth.signUp({
    email,
    password: str(form, "password"),
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      data: { display_name: str(form, "display_name") || email.split("@")[0] },
    },
  });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);

  // With "Confirm email" off in Supabase, sign-up returns a session: go straight in.
  if (data.session) redirect("/dashboard");

  redirect(
    `/login?message=${encodeURIComponent(
      "Check your email for a confirmation link, then sign in.",
    )}`,
  );
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
