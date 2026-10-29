"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function dismissNotice(form: FormData) {
  const supabase = await createClient();
  const id = String(form.get("id") ?? "");
  await supabase.from("notices").update({ read_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/dashboard");
}
