/**
 * Zenless Zone Zero — materials needed per build → inventory → runs per Expert Challenge / Combat Simulation / Notorious Hunt.
 * Mirrors the Battery Planner sheet (Characters tab hidden columns AR..DJ).
 */
import { ZZZ_DATA as D } from "@/data/farm/zzz";
import type { Character, FarmBuild, FarmDay, FarmInventoryRow } from "@/lib/types";
import { runsFor, clampLv, type DropCase } from "./genshin";
import type { Bucket, PlanChar } from "./schedule";

/** build.inputs for ZZZ */
export type ZzzInputs = {
  lv_now?: number; lv_goal?: number;
  basic_now?: number; basic_goal?: number; dodge_now?: number; dodge_goal?: number; assist_now?: number; assist_goal?: number;
  special_now?: number; special_goal?: number; chain_now?: number; chain_goal?: number; // skills 1–12
  core_now?: number; core_goal?: number; // Core Skill: 0 = None, 1–6 = A–F
  lc?: string; lc_now?: number; lc_goal?: number; // W-Engine by name
};

export type ZzzSettings = {
  staminaPerDay: number;
  ik: number; // Inter-Knot Level 1–60 (picks the drop-rate row)
  extraWeek: number; fuel: number; reserve: number; // Ether Batteries (60 each) + Backup Battery Charge, spent only when needed
  cap: number; order: "priority" | "deadline"; daysOff: string; dropCase: DropCase;
  gold: boolean; // farm Agent EXP & Dennies with Battery
  lcexp: boolean; // farm W-Engine EXP with Battery
  echo: number; // free Notorious Hunt claims per week
  echoPaid: boolean; // buy extra Notorious Hunt runs (60 Battery) once the free claims are used
  weeklyDay: number; // weekday the Notorious Hunt claims wait for (1 = Monday, -1 any)
};

export const ZZZ_COST = { sim: 20, expert: 40, hunt: 0, huntPaid: 60 } as const;
export const CORE_LABELS = ["None", "A", "B", "C", "D", "E", "F"] as const;
const ASC_LEVELS = [10, 20, 30, 40, 50];
const prom = (lv: number) => ASC_LEVELS.filter((a) => a < lv).length;

export function zzzSettings(s: Record<string, unknown>, staminaPerDay: number): ZzzSettings {
  const n = (k: string, d: number) => { const v = Number(s[k]); return s[k] === undefined || s[k] === null || s[k] === "" || isNaN(v) ? d : v; };
  const b = (k: string, d: boolean) => (s[k] === undefined || s[k] === null ? d : s[k] === true || s[k] === "true");
  return {
    staminaPerDay: n("stamina_per_day", staminaPerDay),
    ik: Math.max(1, Math.min(60, Math.round(n("ik", 60)))),
    extraWeek: n("extra_week", 0), fuel: n("fuel", 0), reserve: n("reserve", 0),
    cap: n("bank_cap", 0), order: s.order === "deadline" ? "deadline" : "priority", daysOff: String(s.days_off ?? ""),
    dropCase: (["avg", "p80", "worst", "best"].includes(String(s.drop_case)) ? String(s.drop_case) : "avg") as DropCase,
    gold: b("gold", true), lcexp: b("lcexp", true), echo: n("echo", 3), echoPaid: b("echo_paid", true), weeklyDay: n("weekly_day", 1),
  };
}

export type ZzzNeeds = {
  exp: number; credits: number; boss: number; trace: number; seal: number; weekly: number; lcExp: number; lcTrace: number;
  family: string; sealFamily: string; bossMat: string; weeklyMat: string; lcFamily: string; lcStars: number; profile: string;
  lv: [number, number]; lc: string; lcLv: [number, number]; extraMax: number; specialty: string;
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
export function zzzNeeds(build: FarmBuild, ch: Character, s: ZzzSettings): ZzzNeeds {
  void s;
  const i = build.inputs as ZzzInputs;
  const farm = (ch.farm ?? {}) as Record<string, unknown>;
  const profile = String(farm.profile ?? "P1");
  const extraMax = Number(farm.extra_max ?? 12) || 0;
  const lvNow = clampLv(i.lv_now, 1, 60, 1), lvGoal = Math.max(lvNow, clampLv(i.lv_goal, 1, 60, lvNow));
  const pair = (now: unknown, goal: unknown, hi: number): [number, number] => { const a = clampLv(now, 1, hi, 1); return [a, Math.max(a, clampLv(goal, 1, hi, a))]; };
  const basic = pair(i.basic_now, i.basic_goal, 12), dodge = pair(i.dodge_now, i.dodge_goal, 12), assist = pair(i.assist_now, i.assist_goal, 12), special = pair(i.special_now, i.special_goal, 12);
  const chain = extraMax > 0 ? pair(i.chain_now, i.chain_goal, extraMax) : [0, 0];
  const coreNow = clampLv(i.core_now, 0, 6, 0), coreGoal = Math.max(coreNow, clampLv(i.core_goal, 0, 6, coreNow));
  const pn = prom(lvNow), pg = prom(lvGoal);
  const slots: [string, number, number][] = [["BASIC", basic[0], basic[1]], ["SKILL", dodge[0], dodge[1]], ["ULT", assist[0], assist[1]], ["TALENT", special[0], special[1]], ["EXTRA", chain[0], chain[1]], ["BONUS", coreNow, coreGoal]];
  let trace = 0, weekly = 0, boss = cost(profile, "ASC", pn, pg, "boss"), credits = cost(profile, "ASC", pn, pg, "credits");
  for (const [slot, lo, hi] of slots) { trace += t3eq(profile, slot, lo, hi); weekly += cost(profile, slot, lo, hi, "weekly"); boss += cost(profile, slot, lo, hi, "boss"); credits += cost(profile, slot, lo, hi, "credits"); }
  const seal = t3eq(profile, "ASC", pn, pg);
  const exp = D.charExp[lvGoal - 1] - D.charExp[lvNow - 1];
  // W-Engine
  const lcName = String(i.lc ?? "");
  const lc = D.lcs.find((l) => l.name === lcName);
  const lcNow = clampLv(i.lc_now, 1, 60, 1), lcGoal = Math.max(lcNow, clampLv(i.lc_goal, 1, 60, lcNow));
  let lcExp = 0, lcTrace = 0;
  if (lc) {
    const tbl = D.lcExp[String(lc.stars) as "3" | "4" | "5"];
    lcExp = tbl[lcGoal - 1] - tbl[lcNow - 1];
    lcTrace = t3eq(lc.profile, "LCASC", prom(lcNow), prom(lcGoal));
    credits += cost(lc.profile, "LCASC", prom(lcNow), prom(lcGoal), "credits");
  }
  return {
    exp, credits, boss, trace, seal, weekly, lcExp, lcTrace,
    family: String(farm.family ?? ""), sealFamily: String(farm.seal ?? ""), bossMat: String(farm.boss ?? ""), weeklyMat: String(farm.weekly ?? ""), lcFamily: lc?.family ?? "", lcStars: lc?.stars ?? 0, profile,
    lv: [lvNow, lvGoal], lc: lc ? lc.name : "", lcLv: [lcNow, lcGoal], extraMax, specialty: String(ch.weapon_type ?? ""),
  };
}

/** Inventory as the engine sees it (chips / seals / components in top-tier equivalents). */
export function zzzHaves(inv: FarmInventoryRow[]) {
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
  return { credits: q("credit"), exp: q("sil") * 3000 + q("oil") * 600 + q("til") * 100, lcExp: q("wem") * 3000 + q("wps") * 600 + q("wbt") * 100, fam, boss, wk };
}
export type ZzzHaves = ReturnType<typeof zzzHaves>;

export type ZzzShort = { boss: number; trace: number; seal: number; weekly: number; exp: number; credits: number; lcExp: number; lcTrace: number };

/** Shortfalls after inventory, haves going to higher-priority builds first (a build's own chips before its W-Engine's components). */
export function zzzAllocate(rows: { build: FarmBuild; needs: ZzzNeeds }[], haves: ZzzHaves): Map<string, ZzzShort> {
  const h = { credits: haves.credits, exp: haves.exp, lcExp: haves.lcExp, fam: new Map(haves.fam), boss: new Map(haves.boss), wk: new Map(haves.wk) };
  const take = (m: Map<string, number>, k: string, need: number) => { const have = m.get(k) ?? 0; const used = Math.min(have, need); m.set(k, have - used); return need - used; };
  const pool = (k: "credits" | "exp" | "lcExp", need: number) => { const used = Math.min(h[k], need); h[k] -= used; return need - used; };
  const out = new Map<string, ZzzShort>();
  for (const { build, needs } of rows) {
    out.set(build.id, {
      boss: take(h.boss, needs.bossMat, needs.boss), trace: take(h.fam, needs.family, needs.trace), seal: take(h.fam, needs.sealFamily, needs.seal), weekly: take(h.wk, needs.weeklyMat, needs.weekly),
      exp: pool("exp", needs.exp), credits: pool("credits", needs.credits), lcExp: pool("lcExp", needs.lcExp), lcTrace: take(h.fam, needs.lcFamily, needs.lcTrace),
    });
  }
  return out;
}

type Stat = { mean: number; var: number; min: number; max: number };
/** Per-run yields for the account's Inter-Knot Level (Levels tab: average, with worst / best and the Pessimistic spread). */
export function zzzStats(s: ZzzSettings) {
  let y: (typeof D.yields)[number] = D.yields[0];
  for (const row of D.yields) if (row.from <= s.ik) y = row;
  const w = { t1: Math.max(0, y.t1 - 1), t2: Math.max(0, y.t2 - 0.5), t3: Math.max(0, y.t3 - 0.3), boss: Math.max(1, y.boss - 0.5), weekly: Math.max(1, y.weekly - 0.5), exp: y.exp * 0.8, lcExp: y.lcExp * 0.8 };
  const b = { t1: y.t1 + 1, t2: y.t2 + 0.5, t3: y.t3 + 0.3, boss: y.boss + 0.5, weekly: y.weekly + 0.5, exp: y.exp * 1.2, lcExp: y.lcExp * 1.2 };
  const trace: Stat = { mean: y.t1 / 9 + y.t2 / 3 + y.t3, var: y.t1 / 81 + y.t2 / 9 + y.t3, min: w.t1 / 9 + w.t2 / 3 + w.t3, max: b.t1 / 9 + b.t2 / 3 + b.t3 };
  return {
    trace, boss: { mean: y.boss, var: y.boss, min: w.boss, max: b.boss } as Stat, weekly: { mean: y.weekly, var: y.weekly, min: w.weekly, max: b.weekly } as Stat,
    exp: { mean: y.exp, var: 0, min: w.exp, max: b.exp } as Stat, lcExp: { mean: y.lcExp, var: 0, min: w.lcExp, max: b.lcExp } as Stat,
    credits: { mean: y.credits, var: 0, min: y.credits, max: y.credits } as Stat,
  };
}

export type ZzzRuns = { weekly: number; boss: number; trace: number; seal: number; lcTrace: number; exp: number; lcExp: number; credit: number; stamina: number };
const ceilRuns = (x: number) => (x > 0 ? Math.ceil(x - 1e-9) : 0);

/** Runs still to do: shortfall → runs, minus runs logged since the build / inventory were last counted. `stamina` keeps the sheet's fractional total. */
export function zzzRuns(short: ZzzShort, needs: ZzzNeeds, s: ZzzSettings, log: FarmDay[], since: number): ZzzRuns {
  const st = zzzStats(s);
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
    weekly: left(short.weekly, st.weekly, "weekly"), boss: left(short.boss, st.boss, "boss"), trace: left(short.trace, st.trace, "trace"), seal: left(short.seal, st.trace, "seal"),
    lcTrace: needs.lc ? left(short.lcTrace, st.trace, "lcTrace") : 0,
    exp: s.gold ? left(short.exp, st.exp, "exp") : 0, lcExp: s.lcexp && needs.lc ? left(short.lcExp, st.lcExp, "lcExp") : 0, credit: s.gold ? left(short.credits, st.credits, "credit") : 0,
  };
  const stamina = raw.boss * ZZZ_COST.expert + (raw.trace + raw.seal + raw.lcTrace + raw.exp + raw.lcExp + raw.credit) * ZZZ_COST.sim + Math.min(raw.weekly, 999) * ZZZ_COST.hunt;
  return { weekly: ceilRuns(raw.weekly), boss: ceilRuns(raw.boss), trace: ceilRuns(raw.trace), seal: ceilRuns(raw.seal), lcTrace: ceilRuns(raw.lcTrace), exp: ceilRuns(raw.exp), lcExp: ceilRuns(raw.lcExp), credit: ceilRuns(raw.credit), stamina };
}

/** The scheduler's view of a build (Expert Challenge, chips, seals, W-Engine components, EXP, W-Engine EXP, Dennies). */
export function zzzPlanChar(build: FarmBuild, ch: Character, needs: ZzzNeeds, runs: ZzzRuns, deadline: number | null, order: number, lockedUntil: (mat: string) => number | undefined): PlanChar {
  const b: Bucket[] = [];
  if (runs.boss > 0) b.push({ key: "boss", label: needs.bossMat || "Expert Challenge", cost: ZZZ_COST.expert, rem: runs.boss, lockedUntil: lockedUntil(needs.bossMat) });
  if (runs.trace > 0) b.push({ key: "trace", label: needs.family || "Skill chips", cost: ZZZ_COST.sim, rem: runs.trace, lockedUntil: lockedUntil(needs.family) });
  if (runs.seal > 0) b.push({ key: "seal", label: needs.sealFamily || "Promotion seals", cost: ZZZ_COST.sim, rem: runs.seal, lockedUntil: lockedUntil(needs.sealFamily) });
  if (runs.lcTrace > 0) b.push({ key: "lcTrace", label: `W-Engine: ${needs.lcFamily || "components"}`, cost: ZZZ_COST.sim, rem: runs.lcTrace, lockedUntil: lockedUntil(needs.lcFamily) });
  if (runs.exp > 0) b.push({ key: "exp", label: "Combat Sim: Agent EXP", cost: ZZZ_COST.sim, rem: runs.exp });
  if (runs.lcExp > 0) b.push({ key: "lcExp", label: "Combat Sim: W-Engine EXP", cost: ZZZ_COST.sim, rem: runs.lcExp });
  if (runs.credit > 0) b.push({ key: "credit", label: "Combat Sim: Denny", cost: ZZZ_COST.sim, rem: runs.credit });
  return { id: build.id, name: ch.name, order, deadline, weekly: runs.weekly > 0 && needs.weeklyMat ? { rem: runs.weekly, boss: needs.weeklyMat, lockedUntil: lockedUntil(needs.weeklyMat) } : null, buckets: b };
}

export const zzzFarm = (fam: string) => D.families.find((f) => f.t3 === fam)?.farm ?? "";

/** Inventory layout for the UI. */
export function zzzInventoryLayout() {
  return {
    global: [["credit", "", "Dennies"], ["sil", "", "Senior Investigator Log (3,000 EXP)"], ["oil", "", "Official Investigator Log (600)"], ["til", "", "Trainee Investigator Log (100)"], ["wem", "", "W-Engine Energy Module (3,000 EXP)"], ["wps", "", "W-Engine Power Supply (600)"], ["wbt", "", "W-Engine Battery (100)"]] as [string, string, string][],
    chips: D.families.filter((f) => f.farm.endsWith("Agent Skill")), seals: D.families.filter((f) => f.farm.endsWith("Agent Promotion")), components: D.families.filter((f) => f.farm.endsWith("W-Engine")),
    bosses: D.bosses, weeklies: D.weeklies, lcs: D.lcs,
  };
}
