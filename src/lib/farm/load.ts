import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Character, FarmBuild, FarmDay, FarmEvent, FarmInventoryRow, Game, GameAccount, GameVersion } from "@/lib/types";
import { planAccount, type AccountPlan } from "./plan";
import { moduleFor } from "./game";

export type FarmData = {
  account: GameAccount; game: Game; builds: FarmBuild[]; characters: Character[]; inventory: FarmInventoryRow[]; log: FarmDay[]; versions: GameVersion[]; events: FarmEvent[];
  canEdit: boolean; isAdmin: boolean; plan: AccountPlan;
};

/** Everything one account's planner pages need, plus the computed plan. */
export async function loadFarm(accountId: string): Promise<FarmData> {
  const supabase = await createClient();
  const { data: account } = await supabase.from("game_accounts").select("*").eq("id", accountId).maybeSingle<GameAccount>();
  if (!account) notFound();
  const [{ data: game }, { data: builds }, { data: characters }, { data: inventory }, { data: log }, { data: versions }, { data: events }, { data: { user } }] = await Promise.all([
    supabase.from("games").select("*").eq("id", account.game_id).single<Game>(),
    supabase.from("farm_builds").select("*").eq("account_id", accountId).order("priority").order("created_at").returns<FarmBuild[]>(),
    supabase.from("characters").select("*").eq("game_id", account.game_id).order("name").returns<Character[]>(),
    supabase.from("farm_inventory").select("*").eq("account_id", accountId).returns<FarmInventoryRow[]>(),
    supabase.from("farm_days").select("*").eq("account_id", accountId).order("day", { ascending: false }).order("logged_at").returns<FarmDay[]>(),
    supabase.from("game_versions").select("*").eq("game_id", account.game_id).returns<GameVersion[]>(),
    supabase.from("farm_events").select("*").eq("game_id", account.game_id).order("starts_on").returns<FarmEvent[]>(),
    supabase.auth.getUser(),
  ]);
  if (!game || !moduleFor(game.id)) notFound();
  let canEdit = account.user_id === user?.id;
  let isAdmin = false;
  if (user) {
    const [{ data: me }, { data: prof }] = await Promise.all([
      supabase.from("account_members").select("role").eq("account_id", accountId).eq("user_id", user.id).maybeSingle<{ role: string }>(),
      supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle<{ is_admin: boolean }>(),
    ]);
    if (!canEdit) canEdit = me?.role === "editor";
    isAdmin = !!prof?.is_admin;
  }
  const args = { game, account, builds: builds ?? [], characters: characters ?? [], inventory: inventory ?? [], log: log ?? [], versions: versions ?? [], events: events ?? [] };
  return { ...args, canEdit, isAdmin, plan: planAccount(args) };
}
