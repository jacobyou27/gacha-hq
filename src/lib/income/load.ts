import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Game, GameAccount, GameVersion, IncomeItem, IncomePlanEntry } from "@/lib/types";
import { versionAt, versionRows, vkey } from "@/lib/calendar";
import { gameToday } from "@/lib/farm/plan";
import { incomeSettings, type IncomeSettings } from "./forecast";

export const INCOME_GAMES = ["genshin"];

/** All catalog items of a game (Supabase caps a select at 1,000 rows, so page through). */
export async function loadIncomeItems(supabase: Awaited<ReturnType<typeof createClient>>, gameId: string): Promise<IncomeItem[]> {
  const out: IncomeItem[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from("income_items").select("*").eq("game_id", gameId).order("version").order("seq").range(from, from + 999).returns<IncomeItem[]>();
    const rows = (data ?? []).map((r) => ({ ...r, pools: r.pools ?? null, region: r.region ?? null, primos: Number(r.primos), intertwined: Number(r.intertwined), acquaint: Number(r.acquaint), resin: Number(r.resin), mora: Number(r.mora) }));
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out.sort((a, b) => vkey(a.version) - vkey(b.version) || a.seq - b.seq);
}

export type PlanRow = IncomePlanEntry & { item_id: string };
/** An account's plan (Supabase numeric columns come back as strings). */
export async function loadPlan(supabase: Awaited<ReturnType<typeof createClient>>, accountId: string): Promise<Map<string, IncomePlanEntry>> {
  const { data } = await supabase.from("account_income_items").select("item_id, status, amount, counts, primos_override").eq("account_id", accountId).returns<PlanRow[]>();
  return new Map((data ?? []).filter((r) => r.status !== "skip").map((r) => [r.item_id, {
    status: r.status, amount: r.amount === null ? null : Number(r.amount), counts: r.counts ?? null, primos_override: r.primos_override === null ? null : Number(r.primos_override),
  }]));
}

export async function loadAccountIncome(accountId: string) {
  const supabase = await createClient();
  const { data: account } = await supabase.from("game_accounts").select("*").eq("id", accountId).maybeSingle<GameAccount>();
  if (!account || !INCOME_GAMES.includes(account.game_id)) notFound();
  const [{ data: game }, items, plan, { data: versions }, { data: { user } }] = await Promise.all([
    supabase.from("games").select("*").eq("id", account.game_id).single<Game>(),
    loadIncomeItems(supabase, account.game_id),
    loadPlan(supabase, accountId),
    supabase.from("game_versions").select("*").eq("game_id", account.game_id).returns<GameVersion[]>(),
    supabase.auth.getUser(),
  ]);
  let canEdit = account.user_id === user?.id;
  if (user && !canEdit) {
    const { data: me } = await supabase.from("account_members").select("role").eq("account_id", accountId).eq("user_id", user.id).maybeSingle<{ role: string }>();
    canEdit = me?.role === "editor";
  }
  const rows = versionRows(versions ?? [], account.game_id, 12);
  const today = gameToday(account.server);
  const current = versionAt(rows, today)?.version ?? null;
  const acc = (account.settings ?? {}) as Record<string, unknown>;
  const settings: IncomeSettings = incomeSettings(acc.income as Record<string, unknown> | undefined);
  return { account, game: game!, items, plan, rows, today, current, settings, canEdit };
}
