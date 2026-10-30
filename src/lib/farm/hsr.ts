/**
 * Honkai: Star Rail — materials needed per build → inventory → runs per Stagnant Shadow / Calyx / Echo of War.
 * Mirrors the TP Planner sheet (Characters tab hidden columns AR..CK).
 */
import { HSR_DATA as D } from "@/data/farm/hsr";
import type { Character, FarmBuild, FarmDay, FarmInventoryRow } from "@/lib/types";
import { runsFor, clampLv, type DropCase } from "./genshin";
import type { Bucket, PlanChar } from "./schedule";

/** build.inputs for HSR */
export type HsrInputs = {
  lv_now?: number; lv_goal?: number;
  basic_now?: number; basic_goal?: number; skill_now?: number; skill_goal?: number; ult_now?: number; ult_goal?: number; talent_now?: number; talent_goal?: number;
  extra_now?: number; extra_goal?: number; // memosprite skill (Remembrance, 1–6) / Elation skill (1–10)
  extra2_now?: number; extra2_goal?: number; // memosprite talent (Remembrance, 1–6)
  bonus?: boolean[]; // bonus-trace groups still to add: [before A2, A2 group, A4 group, A6 + Lv75/80]
  lc?: string; lc_now?: number; lc_goal?: number; // light cone by name
};

export type HsrSettings = {
  staminaPerDay: number;
  eq: number; // Equilibrium Level 0–6
  extraWeek: number; fuel: number; reserve: number; // Fuel (60 TP each) + reserved TP, spent only when needed
  cap: number; order: "priority" | "deadline"; daysOff: string; dropCase: DropCase;
  gold: boolean; // farm EXP & credits with TP
  lcexp: boolean; // farm light cone EXP with TP
  echo: number; // Echo of War claims per week
  weeklyDay: number; // weekday the Echo of War runs wait for (1 = Monday, -1 any)
};

export const HSR_COST = { calyx: 10, shadow: 30, echo: 30 } as const;
const ASC_LEVELS = [20, 30, 40, 50, 60, 70];
const prom = (lv: number) => ASC_LEVELS.filter((a) => a < lv).length;

export function hsrSettings(s: Record<string, unknown>, staminaPerDay: number): HsrSettings {
  const n = (k: string, d: number) => { const v = Number(s[k]); return s[k] === undefined || s[k] === null || s[k] === "" || isNaN(v) ? d : v; };
  const b = (k: string, d: boolean) => (s[k] === undefined || s[k] === null ? d : s[k] === true || s[k] === "true");
  return {
    staminaPerDay: n("stamina_per_day", staminaPerDay),
    eq: Math.max(0, Math.min(6, Math.round(n("eq", 6)))),
    extraWeek: n("extra_week", 0), fuel: n("fuel", 0), reserve: n("reserve", 0),
    cap: n("bank_cap", 0), order: s.order === "deadline" ? "deadline" : "priority", daysOff: String(s.days_off ?? ""),
    dropCase: (["avg", "p80", "worst", "best"].includes(String(s.drop_case)) ? String(s.drop_case) : "avg") as DropCase,
    gold: b("gold", true), lcexp: b("lcexp", true), echo: n("echo", 3), weeklyDay: n("weekly_day", 1),
  };
}

export type HsrNeeds = {
  exp: number; credits: number; boss: number; trace: number; weekly: number; lcExp: number; lcTrace: number;
  family: string; bossMat: string; weeklyMat: string; lcFamily: string; lcStars: number; profile: string;
  lv: [number, number]; lc: string; lcLv: [number, number]; extraMax: number; extra2Max: number; path: string;
};

type CostKey = "t1" | "t2" | "t3" | "weekly" | "boss" | "credits";
/** Sum of a profile's slot rows with level in (lo, hi]. */
function cost(profile: string, slot: string, lo: number, hi: number, k: CostKey): number {
  let s = 0;
  for (const c of D.costs) if (c.profile === profile && c.slot === slot && c.level > lo && c.level <= hi) s += c[k];
  return s;
}
const t3eq = (profile: string, slot: string, lo: number, hi: number) => cost(profile, slot, lo, hi, "t1") / 9 + cost(profile, slot, lo, hi, "t2") / 3 + cost(profile, slot, lo, hi, "t3");

/** Materials a build still needs (before inventory). */
export function hsrNeeds(build: FarmBuild, ch: Character, s: HsrSettings): HsrNeeds {
  void s;
  const i = build.inputs as HsrInputs;
  const farm = (ch.farm ?? {}) as Record<string, unknown>;
  const profile = String(farm.profile ?? "P2");
  const extraMax = Number(farm.extra_max ?? 0) || 0, extra2Max = Number(farm.extra2_max ?? 0) || 0;
  const lvNow = clampLv(i.lv_now, 1, 80, 1), lvGoal = Math.max(lvNow, clampLv(i.lv_goal, 1, 80, lvNow));
  const pair = (now: unknown, goal: unknown, hi: number): [number, number] => { const a = clampLv(now, 1, hi, 1); return [a, Math.max(a, clampLv(goal, 1, hi, a))]; };
  const basic = pair(i.basic_now, i.basic_goal, 7), skill = pair(i.skill_now, i.skill_goal, 12), ult = pair(i.ult_now, i.ult_goal, 12), talent = pair(i.talent_now, i.talent_goal, 12);
  const extra = extraMax > 0 ? pair(i.extra_now, i.extra_goal, extraMax) : [0, 0], extra2 = extra2Max > 0 ? pair(i.extra2_now, i.extra2_goal, extra2Max) : [0, 0];
  const bonus = Array.isArray(i.bonus) ? i.bonus.map(Boolean) : [false, false, false, false];
  const pn = prom(lvNow), pg = prom(lvGoal);
  const slots: [string, number, number][] = [["BASIC", basic[0], basic[1]], ["SKILL", skill[0], skill[1]], ["ULT", ult[0], ult[1]], ["TALENT", talent[0], talent[1]], ["EXTRA", extra[0], extra[1]], ["EXTRA2", extra2[0], extra2[1]]];
  let trace = 0, weekly = 0, credits = cost(profile, "ASC", pn, pg, "credits");
  for (const [slot, lo, hi] of slots) { trace += t3eq(profile, slot, lo, hi); weekly += cost(profile, slot, lo, hi, "weekly"); credits += cost(profile, slot, lo, hi, "credits"); }
  bonus.forEach((on, g) => { if (on) { trace += t3eq(profile, "BONUS", g, g + 1); weekly += cost(profile, "BONUS", g, g + 1, "weekly"); credits += cost(profile, "BONUS", g, g + 1, "credits"); } });
  const exp = D.charExp[lvGoal - 1] - D.charExp[lvNow - 1];
  credits += exp * 0.1;
  // light cone
  const lcName = String(i.lc ?? "");
  const lc = D.lcs.find((l) => l.name === lcName);
  const lcNow = clampLv(i.lc_now, 1, 80, 1), lcGoal = Math.max(lcNow, clampLv(i.lc_goal, 1, 80, lcNow));
  let lcExp = 0, lcTrace = 0;
  if (lc) {
    const tbl = D.lcExp[String(lc.stars) as "3" | "4" | "5"];
    lcExp = tbl[lcGoal - 1] - tbl[lcNow - 1];
    lcTrace = t3eq(lc.profile, "LCASC", prom(lcNow), prom(lcGoal));
    credits += cost(lc.profile, "LCASC", prom(lcNow), prom(lcGoal), "credits") + lcExp * 0.5;
  }
  return {
    exp, credits, boss: cost(profile, "ASC", pn, pg, "boss"), trace, weekly, lcExp, lcTrace,
    family: String(farm.family ?? ""), bossMat: String(farm.boss ?? ""), weeklyMat: String(farm.weekly ?? ""), lcFamily: lc?.family ?? "", lcStars: lc?.stars ?? 0, profile,
    lv: [lvNow, lvGoal], lc: lc ? lc.name : "", lcLv: [lcNow, lcGoal], extraMax, extra2Max, path: String(ch.weapon_type ?? ""),
  };
}

/** Inventory as the engine sees it (trace families in tier-3 equivalents). */
export function hsrHaves(inv: FarmInventoryRow[]) {
  const q = (kind: string, key = "") => Number(inv.find((r) => r.kind === kind && r.key === key)?.qty ?? 0);
  const fam = new Map<string, number>(), boss = new Map<string, number>(), wk = new Map<string, number>();
  for (const r of inv) {
    const v = Number(r.qty) || 0;
    if (r.kind === "famT1") fam.set(r.key, (fam.get(r.key) ?? 0) + v / 9);
    if (r.kind === "famT2") fam.set(r.key, (fam.get(r.key) ?? 0) + v / 3);
    if (r.kind === "famT3") fam.set(r.key, (fam.get(r.key) ?? 0) + v);
    if (r.kind === "boss") boss.set(r.key, v);
    if (r.kind === "wk") wk.set(r.key, v);
  }
  return { credits: q("credit"), exp: q("tg") * 20000 + q("al") * 5000 + q("te") * 1000, lcExp: q("ra") * 6000 + q("ca") * 2000 + q("sa") * 500, fam, boss, wk };
}
export type HsrHaves = ReturnType<typeof hsrHaves>;

export type HsrShort = { boss: number; trace: number; weekly: number; exp: number; credits: number; lcExp: number; lcTrace: number };

/** Shortfalls after inventory, haves going to higher-priority builds first (a build's own traces before its light cone's). */
export function hsrAllocate(rows: { build: FarmBuild; needs: HsrNeeds }[], haves: HsrHaves): Map<string, HsrShort> {
  const h = { credits: haves.credits, exp: haves.exp, lcExp: haves.lcExp, fam: new Map(haves.fam), boss: new Map(haves.boss), wk: new Map(haves.wk) };
  const take = (m: Map<string, number>, k: string, need: number) => { const have = m.get(k) ?? 0; const used = Math.min(have, need); m.set(k, have - used); return need - used; };
  const pool = (k: "credits" | "exp" | "lcExp", need: number) => { const used = Math.min(h[k], need); h[k] -= used; return need - used; };
  const out = new Map<string, HsrShort>();
  for (const { build, needs } of rows) {
    out.set(build.id, {
      boss: take(h.boss, needs.bossMat, needs.boss), trace: take(h.fam, needs.family, needs.trace), weekly: take(h.wk, needs.weeklyMat, needs.weekly),
      exp: pool("exp", needs.exp), credits: pool("credits", needs.credits), lcExp: pool("lcExp", needs.lcExp), lcTrace: take(h.fam, needs.lcFamily, needs.lcTrace),
    });
  }
  return out;
}

type Stat = { mean: number; var: number; min: number; max: number };
/** Per-run yields for the account's Equilibrium Level (Levels tab: average, with worst / best and the Pessimistic spread). */
export function hsrStats(s: HsrSettings) {
  const y = D.yields[Math.max(0, Math.min(6, s.eq))];
  const w = { t1: Math.max(0, y.t1 - 1), t2: Math.max(0, y.t2 - 0.5), t3: 0, boss: Math.max(1, y.boss - 0.5), weekly: Math.max(1, y.weekly - 0.5), exp: y.exp * 0.8, lcExp: y.lcExp * 0.8 };
  const b = { t1: y.t1 + 1, t2: y.t2 + 0.5, t3: Math.min(1, y.t3 + 0.4), boss: y.boss + 0.5, weekly: y.weekly + 0.5, exp: y.exp * 1.2, lcExp: y.lcExp * 1.2 };
  const trace: Stat = { mean: y.t1 / 9 + y.t2 / 3 + y.t3, var: y.t1 / 81 + y.t2 / 9 + y.t3, min: w.t1 / 9 + w.t2 / 3 + w.t3, max: b.t1 / 9 + b.t2 / 3 + b.t3 };
  return {
    trace, boss: { mean: y.boss, var: y.boss, min: w.boss, max: b.boss } as Stat, weekly: { mean: y.weekly, var: y.weekly, min: w.weekly, max: b.weekly } as Stat,
    exp: { mean: y.exp, var: 0, min: w.exp, max: b.exp } as Stat, lcExp: { mean: y.lcExp, var: 0, min: w.lcExp, max: b.lcExp } as Stat,
    credits: { mean: y.credits, var: 0, min: y.credits, max: y.credits } as Stat,
  };
}

export type HsrRuns = { weekly: number; boss: number; trace: number; lcTrace: number; exp: number; lcExp: number; credit: number; stamina: number };
const ceilRuns = (x: number) => (x > 0 ? Math.ceil(x - 1e-9) : 0);

/** Runs still to do: shortfall → runs, minus runs logged since the build / inventory were last counted. `stamina` keeps the sheet's fractional total. */
export function hsrRuns(short: HsrShort, needs: HsrNeeds, s: HsrSettings, log: FarmDay[], since: number): HsrRuns {
  const st = hsrStats(s);
  const counted = (l: FarmDay, k: string) => {
    const d = l.drops ?? {}, has = (...ks: string[]) => ks.some((x) => d[x] !== undefined && d[x] !== null);
    const planned = Number(l.runs?.[k] ?? 0);
    if (k === "trace" && has("traceT1", "traceT2", "traceT3") && st.trace.mean > 0) return ((d.traceT1 ?? 0) / 9 + (d.traceT2 ?? 0) / 3 + (d.traceT3 ?? 0)) / st.trace.mean;
    if (k === "lcTrace" && has("lcT1", "lcT2", "lcT3") && st.trace.mean > 0) return ((d.lcT1 ?? 0) / 9 + (d.lcT2 ?? 0) / 3 + (d.lcT3 ?? 0)) / st.trace.mean;
    if (k === "boss" && has("boss") && st.boss.mean > 0) return (d.boss ?? 0) / st.boss.mean;
    if (k === "weekly" && has("wk") && st.weekly.mean > 0) return (d.wk ?? 0) / st.weekly.mean;
    return planned;
  };
  const logged = (k: string) => log.filter((l) => Date.parse(l.logged_at) > since).reduce((a, l) => a + counted(l, k), 0);
  const left = (q: number, stat: Stat, k: string) => Math.max(0, runsFor(q, stat, s.dropCase) - logged(k));
  const raw = {
    weekly: left(short.weekly, st.weekly, "weekly"), boss: left(short.boss, st.boss, "boss"), trace: left(short.trace, st.trace, "trace"),
    lcTrace: needs.lc ? left(short.lcTrace, st.trace, "lcTrace") : 0,
    exp: s.gold ? left(short.exp, st.exp, "exp") : 0, lcExp: s.lcexp && needs.lc ? left(short.lcExp, st.lcExp, "lcExp") : 0, credit: s.gold ? left(short.credits, st.credits, "credit") : 0,
  };
  const stamina = raw.boss * HSR_COST.shadow + (raw.trace + raw.lcTrace + raw.exp + raw.lcExp + raw.credit) * HSR_COST.calyx + Math.min(raw.weekly, 999) * HSR_COST.echo;
  return { weekly: ceilRuns(raw.weekly), boss: ceilRuns(raw.boss), trace: ceilRuns(raw.trace), lcTrace: ceilRuns(raw.lcTrace), exp: ceilRuns(raw.exp), lcExp: ceilRuns(raw.lcExp), credit: ceilRuns(raw.credit), stamina };
}

export const hsrShadow = (mat: string) => D.bosses.find((b) => b.mat === mat)?.shadow ?? "";
export const hsrCalyx = (family: string) => D.families.find((f) => f.t3 === family)?.calyx ?? "";

/** The scheduler's view of a build. Materials only an unreleased character uses are locked until its release day. */
export function hsrPlanChar(build: FarmBuild, ch: Character, needs: HsrNeeds, runs: HsrRuns, deadline: number | null, order: number, lockedUntil: (mat: string) => number | undefined): PlanChar {
  const b: Bucket[] = [];
  if (runs.boss > 0) b.push({ key: "boss", label: needs.bossMat || "Stagnant Shadow", cost: HSR_COST.shadow, rem: runs.boss, lockedUntil: lockedUntil(needs.bossMat) });
  if (runs.trace > 0) b.push({ key: "trace", label: needs.family || "Trace mats", cost: HSR_COST.calyx, rem: runs.trace, lockedUntil: lockedUntil(needs.family) });
  if (runs.lcTrace > 0) b.push({ key: "lcTrace", label: `LC: ${needs.lcFamily || "trace mats"}`, cost: HSR_COST.calyx, rem: runs.lcTrace, lockedUntil: lockedUntil(needs.lcFamily) });
  if (runs.exp > 0) b.push({ key: "exp", label: "Bud of Memories", cost: HSR_COST.calyx, rem: runs.exp });
  if (runs.lcExp > 0) b.push({ key: "lcExp", label: "Bud of Aether", cost: HSR_COST.calyx, rem: runs.lcExp });
  if (runs.credit > 0) b.push({ key: "credit", label: "Bud of Treasures", cost: HSR_COST.calyx, rem: runs.credit });
  const wkLock = lockedUntil(needs.weeklyMat);
  return { id: build.id, name: ch.name, order, deadline, weekly: runs.weekly > 0 && needs.weeklyMat ? { rem: runs.weekly, boss: needs.weeklyMat, lockedUntil: wkLock } : null, buckets: b };
}

/** material → first day it can be farmed: mats only unreleased characters use are locked until that character's release date. */
export function hsrLockedMats(characters: Character[], keys: string[] = ["family", "boss", "weekly"]): Map<string, number> {
  const have = new Set<string>();
  const mats = (c: Character) => { const f = (c.farm ?? {}) as Record<string, unknown>; return keys.map((k) => String(f[k] ?? "")).filter(Boolean); };
  for (const c of characters) if (c.is_released) mats(c).forEach((m) => have.add(m));
  const out = new Map<string, number>();
  for (const c of characters) {
    if (c.is_released || !c.release_date) continue;
    const day = Math.round(Date.parse(c.release_date.slice(0, 10) + "T00:00:00Z") / 864e5);
    for (const m of mats(c)) if (!have.has(m)) out.set(m, Math.min(out.get(m) ?? 1e9, day));
  }
  return out;
}

/** Inventory layout for the UI. */
export function hsrInventoryLayout() {
  return {
    global: [["credit", "", "Credits"], ["tg", "", "Traveler's Guide (20,000 EXP)"], ["al", "", "Adventure Log (5,000)"], ["te", "", "Travel Encounters (1,000)"], ["ra", "", "Refined Aether (6,000 LC EXP)"], ["ca", "", "Condensed Aether (2,000)"], ["sa", "", "Sparse Aether (500)"]] as [string, string, string][],
    families: D.families, bosses: D.bosses, weeklies: D.weeklies, lcs: D.lcs,
  };
}
