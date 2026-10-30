/**
 * One module per game: settings → needs → inventory → runs → scheduler buckets.
 * plan.ts drives any of them through this interface; the UI narrows by game id.
 */
import type { Character, FarmBuild, FarmDay, FarmInventoryRow, GameId } from "@/lib/types";
import type { DropCase } from "./genshin";
import {
  genshinAllocate, genshinHaves, genshinNeeds, genshinPlanChar, genshinRuns, genshinSettings, resinFor,
  type GenshinSettings, type Needs as GenshinNeeds, type RunCounts as GenshinRuns, type Short as GenshinShort,
} from "./genshin";
import { hsrAllocate, hsrHaves, hsrLockedMats, hsrNeeds, hsrPlanChar, hsrRuns, hsrSettings, type HsrNeeds, type HsrRuns, type HsrSettings, type HsrShort } from "./hsr";
import { zzzAllocate, zzzHaves, zzzNeeds, zzzPlanChar, zzzRuns, zzzSettings, ZZZ_COST, type ZzzNeeds, type ZzzRuns, type ZzzSettings, type ZzzShort } from "./zzz";
import type { PlanChar, SimOpts, WeeklyRule } from "./schedule";

/** Settings every game shares (the rest is game-specific). */
export type CommonSettings = {
  staminaPerDay: number; cap: number; extraWeek: number; order: "priority" | "deadline"; daysOff: string; dropCase: DropCase; weeklyDay: number;
};

export type PlanCtx = { characters: Character[]; today: number };

export type GameModule<S extends CommonSettings = CommonSettings, N = unknown, Sh = unknown, R = unknown> = {
  id: GameId;
  settings(acc: Record<string, unknown>, staminaPerDay: number): S;
  needs(build: FarmBuild, ch: Character, s: S): N;
  allocate(rows: { build: FarmBuild; needs: N }[], inventory: FarmInventoryRow[], s: S): Map<string, Sh>;
  runs(short: Sh, needs: N, s: S, log: FarmDay[], since: number): R;
  stamina(runs: R): number;
  planChar(build: FarmBuild, ch: Character, needs: N, runs: R, deadline: number | null, order: number, ctx: PlanCtx): PlanChar;
  /** the scheduler options this game decides (the rest come from the log / calendar) */
  simOpts(s: S): Pick<SimOpts, "fuel" | "allowExtraWeekly" | "monBoss" | "weeklyDow" | "weekly" | "lostLabel" | "weeklyPaid"> & { weekly: WeeklyRule };
  usesOverflow(s: S): boolean;
  usesStygian(s: S): boolean;
};

export const GENSHIN: GameModule<GenshinSettings, GenshinNeeds, GenshinShort, GenshinRuns> = {
  id: "genshin",
  settings: genshinSettings,
  needs: genshinNeeds,
  allocate: (rows, inventory, s) => genshinAllocate(rows, genshinHaves(inventory, s)),
  runs: genshinRuns,
  stamina: resinFor,
  planChar: (build, ch, needs, runs, deadline, order) => genshinPlanChar(build, ch, needs, runs, deadline, order),
  simOpts: (s) => ({ fuel: s.fragile * 60, allowExtraWeekly: s.allow60, monBoss: s.monBoss, weeklyDow: s.weeklyDay, weekly: { perWeek: 3, cost: 30, extraCost: 60, oncePerBoss: true }, lostLabel: "resin → artifacts" }),
  usesOverflow: (s) => s.overflow,
  usesStygian: (s) => s.stygianSkip,
};

export const HSR: GameModule<HsrSettings, HsrNeeds, HsrShort, HsrRuns> = {
  id: "hsr",
  settings: hsrSettings,
  needs: hsrNeeds,
  allocate: (rows, inventory) => hsrAllocate(rows, hsrHaves(inventory)),
  runs: hsrRuns,
  stamina: (r) => r.stamina,
  planChar: (build, ch, needs, runs, deadline, order, ctx) => { const lk = hsrLockedMats(ctx.characters); return hsrPlanChar(build, ch, needs, runs, deadline, order, (m) => lk.get(m)); },
  simOpts: (s) => ({ fuel: s.fuel * 60 + s.reserve, allowExtraWeekly: false, monBoss: false, weeklyDow: s.weeklyDay, weekly: { perWeek: s.echo, cost: 30, extraCost: null, oncePerBoss: false }, lostLabel: "TP → relics" }),
  usesOverflow: () => false,
  usesStygian: () => false,
};

export const ZZZ: GameModule<ZzzSettings, ZzzNeeds, ZzzShort, ZzzRuns> = {
  id: "zzz",
  settings: zzzSettings,
  needs: zzzNeeds,
  allocate: (rows, inventory) => zzzAllocate(rows, zzzHaves(inventory)),
  runs: zzzRuns,
  stamina: (r) => r.stamina,
  planChar: (build, ch, needs, runs, deadline, order, ctx) => { const lk = hsrLockedMats(ctx.characters, ["family", "boss", "weekly", "seal"]); return zzzPlanChar(build, ch, needs, runs, deadline, order, (m) => lk.get(m)); },
  simOpts: (s) => ({ fuel: s.fuel * 60 + s.reserve, allowExtraWeekly: false, monBoss: false, weeklyDow: s.weeklyDay, weekly: { perWeek: s.echo, cost: ZZZ_COST.hunt, extraCost: null, oncePerBoss: false }, weeklyPaid: s.echoPaid ? ZZZ_COST.huntPaid : undefined, lostLabel: "Battery → Drive Discs" }),
  usesOverflow: () => false,
  usesStygian: () => false,
};

export type AnyModule = GameModule<CommonSettings, unknown, unknown, unknown>;
export function moduleFor(id: string): AnyModule | null {
  if (id === "genshin") return GENSHIN as unknown as AnyModule;
  if (id === "hsr") return HSR as unknown as AnyModule;
  if (id === "zzz") return ZZZ as unknown as AnyModule;
  return null;
}
export const PLANNER_GAMES: GameId[] = ["genshin", "hsr", "zzz"];
