import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Game, GameAccount, GameVersion, IncomeItem, IncomeStatus } from "@/lib/types";
import { versionAt, versionRows, vkey } from "@/lib/calendar";
import { gameToday } from "@/lib/farm/plan";
import { incomeSettings, type IncomeSettings } from "./forecast";

export const INCOME_GAMES = ["genshin"];

/** All catalog items of a game (Supabase caps a select at 1,000 rows, so page through). */
export async function loadIncomeItems(supabase: Awaited<ReturnType<typeof createClient>>, gameId: string): Promise<IncomeItem[]> {
  const out: IncomeItem[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from("income_items").select("*").eq("game_id", gameId).order("version").order("seq").range(from, from + 999).returns<IncomeItem[]>();
    const rows = (data ?? []).map((r) => ({ ...r, primos: Number(r.primos), intertwined: Number(r.intertwined), acquaint: Number(r.acquaint), resin: Number(r.resin), mora: Number(r.mora) }));
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out.sort((a, b) => vkey(a.version) - vkey(b.version) || a.seq - b.seq);
}

/** The newest catalogued version before the one running today (content up to it defaults to "done"). */
export function defaultCaughtUp(items: IncomeItem[], current: string | null) {
  const vs = [...new Set(items.map((i) => i.version))].sort((a, b) => vkey(a) - vkey(b));
  if (!current) return vs[vs.length - 1] ?? null;
  return vs.filter((v) => vkey(v) < vkey(current)).pop() ?? null;
}

export async function loadAccountIncome(accountId: string) {
  const supabase = await createClient();
  const { data: account } = await supabase.from("game_accounts").select("*").eq("id", accountId).maybeSingle<GameAccount>();
  if (!account || !INCOME_GAMES.includes(account.game_id)) notFound();
  const [{ data: game }, items, { data: marksRows }, { data: versions }, { data: { user } }] = await Promise.all([
    supabase.from("games").select("*").eq("id", account.game_id).single<Game>(),
    loadIncomeItems(supabase, account.game_id),
    supabase.from("account_income_items").select("item_id, status").eq("account_id", accountId).returns<{ item_id: string; status: IncomeStatus }[]>(),
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
  const settings: IncomeSettings = incomeSettings(acc.income as Record<string, unknown> | undefined, defaultCaughtUp(items, current));
  const marks = new Map((marksRows ?? []).map((m) => [m.item_id, m.status]));
  return { account, game: game!, items, marks, rows, today, current, settings, canEdit };
}
