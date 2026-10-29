"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => {
  const v = str(f, k);
  return v === "" ? null : Number(v);
};
function back(id: string, year: string, error?: string, message?: string): never {
  const q = new URLSearchParams();
  if (year) q.set("year", year);
  if (error) q.set("error", error);
  if (message) q.set("message", message);
  redirect(`/accounts/${id}/plan?${q.toString()}`);
}

export async function saveSpendPlan(form: FormData) {
  const supabase = await createClient();
  const id = str(form, "account_id");
  const year = Number(str(form, "year"));
  const { error } = await supabase.from("spend_plans").upsert(
    {
      account_id: id,
      year,
      monthly_pass: form.get("monthly_pass") === "on",
      monthly_pass_months: num(form, "monthly_pass_months") ?? 12,
      battle_pass: form.get("battle_pass") === "on",
      battle_pass_count: num(form, "battle_pass_count") ?? 6,
      bundles_planned: num(form, "bundles_planned") ?? 0,
      pull_blocks_planned: num(form, "pull_blocks_planned") ?? 0,
      pull_block_usd: num(form, "pull_block_usd") ?? 300,
      pull_block_pulls: num(form, "pull_block_pulls") ?? 150,
      budget_usd: num(form, "budget_usd"),
      notes: str(form, "notes") || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "account_id,year" },
  );
  revalidatePath(`/accounts/${id}/plan`);
  revalidatePath("/overview");
  if (error) back(id, String(year), error.message);
  back(id, String(year), undefined, "Plan saved.");
}

export async function saveCostPerGroup(form: FormData) {
  const supabase = await createClient();
  const id = str(form, "account_id");
  const year = str(form, "year");
  const { data: acct } = await supabase.from("game_accounts").select("settings").eq("id", id).single<{ settings: Record<string, unknown> }>();
  const settings = { ...(acct?.settings ?? {}) };
  const v = num(form, "cost_per_group");
  if (v === null) delete settings.cost_per_group;
  else settings.cost_per_group = v;
  const { error } = await supabase.from("game_accounts").update({ settings }).eq("id", id);
  revalidatePath(`/accounts/${id}/plan`);
  if (error) back(id, year, error.message);
  back(id, year, undefined, "Budget saved.");
}

export async function addPurchase(form: FormData) {
  const supabase = await createClient();
  const id = str(form, "account_id");
  const year = str(form, "year");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("purchases").insert({
    account_id: id,
    bought_on: str(form, "bought_on") || new Date().toISOString().slice(0, 10),
    kind: str(form, "kind") || "other",
    amount_usd: num(form, "amount_usd") ?? 0,
    pulls: num(form, "pulls") ?? 0,
    note: str(form, "note") || null,
    created_by: user?.id ?? null,
  });
  revalidatePath(`/accounts/${id}/plan`);
  revalidatePath("/overview");
  if (error) back(id, year, error.message);
  back(id, year);
}

export async function deletePurchase(form: FormData) {
  const supabase = await createClient();
  const id = str(form, "account_id");
  await supabase.from("purchases").delete().eq("id", str(form, "purchase_id"));
  revalidatePath(`/accounts/${id}/plan`);
  revalidatePath("/overview");
  back(id, str(form, "year"));
}
