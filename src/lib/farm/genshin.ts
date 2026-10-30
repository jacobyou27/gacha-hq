/**
 * Genshin Impact: materials needed per build → inventory → runs per domain / boss / ley line.
 * Mirrors the Resin Planner sheet (Characters tab hidden columns AD..BV).
 */
import { GENSHIN_DATA as D } from "@/data/farm/genshin";
import type { Character, FarmBuild, FarmDay, FarmInventoryRow } from "@/lib/types";
import type { Bucket, PlanChar } from "./schedule";

export type DropCase = "avg" | "p80" | "worst" | "best";

/** build.inputs for Genshin */
export type GenshinInputs = {
  lv_now?: number; lv_goal?: number;
  na_now?: number; na_goal?: number; skill_now?: number; skill_goal?: number; burst_now?: number; burst_goal?: number;
  wpn_rarity?: number; wpn_series?: string; wpn_now?: number; wpn_goal?: number;
};

export type GenshinSettings = {
  wl: number; // 0–9
  bookOpt: 0 | 1 | 2; // 0 none, 1 Xingqiu refund, 2 Eula / Layla double
  wpnOpt: 0 | 1 | 2; // 0 none, 1 Mona refund, 2 Albedo / Ayaka / Alhaitham / Wriothesley double
  ley: boolean; // farm mora & EXP with resin
  solvent: boolean; // plenty of Dream Solvent (any weekly mat from the boss counts)
  allow60: boolean;
  cap: number; // resin you can bank (0 = leftovers go to artifacts)
  monBoss: boolean;
  extraWeek: number;
  fragile: number;
  order: "priority" | "deadline";
  daysOff: string;
  stygianSkip: boolean;
  weeklyDay: number; // -1 any
  dropCase: DropCase;
  resinPerDay: number;
  overflow: boolean; // use overflow weeks (double drops)
};

export const BREAKPOINTS = [20, 40, 50, 60, 70, 80];
const RATIO = [3, 2.75, 3 / 1.1] as const; // crafting: none / 25% refund / 10% double
export const COST = { book: 20, wpn: 20, boss: 40, wit: 20, mora: 20, weekly: 30, weekly60: 60 } as const;
const Z80 = 0.8416212327;

export function genshinSettings(s: Record<string, unknown>, staminaPerDay: number): GenshinSettings {
  const n = (k: string, d: number) => { const v = Number(s[k]); return s[k] === undefined || s[k] === null || s[k] === "" || isNaN(v) ? d : v; };
  const b = (k: string, d: boolean) => (s[k] === undefined || s[k] === null ? d : s[k] === true || s[k] === "true");
  const opt = (k: string) => Math.max(0, Math.min(2, Math.round(n(k, 0)))) as 0 | 1 | 2;
  return {
    wl: Math.max(0, Math.min(9, Math.round(n("wl", 8)))), bookOpt: opt("book_opt"), wpnOpt: opt("wpn_opt"),
    ley: b("ley", true), solvent: b("solvent", false), allow60: b("allow60", false), cap: n("bank_cap", 0), monBoss: b("mon_boss", false),
    extraWeek: n("extra_week", 0), fragile: n("fuel", 0), order: s.order === "deadline" ? "deadline" : "priority",
    daysOff: String(s.days_off ?? ""), stygianSkip: b("stygian_skip", false), weeklyDay: n("weekly_day", -1),
    dropCase: (["avg", "p80", "worst", "best"].includes(String(s.drop_case)) ? String(s.drop_case) : "avg") as DropCase,
    resinPerDay: n("stamina_per_day", staminaPerDay),
    overflow: b("overflow", true),
  };
}

export const clampLv = (v: unknown, lo: number, hi: number, dflt: number) => { const n = Math.round(Number(v)); return v === undefined || v === null || v === "" || isNaN(n) ? dflt : Math.min(hi, Math.max(lo, n)); };
const phase = (lv: number) => BREAKPOINTS.filter((b) => b < lv).length;

export type Needs = {
  wit: number; mora: number; boss: number; books: number; weekly: number; crowns: number; wpn: number; wpnExp: number;
  bookSeries: string[]; // talent i uses bookSeries[i] (Traveler) or bookSeries[0] for everyone
  bossDrop: string; weeklyMat: string; weeklyBoss: string; wpnSeries: string; wpnRarity: number;
  booksBySeries: [string, number][]; // guide-eq needed per book series (talent i uses bookSeries[i] — Traveler — else all one series)
  lv: [number, number]; na: [number, number]; skill: [number, number]; burst: [number, number]; wpnLv: [number, number];
};

const talentDelta = (now: number, goal: number, r: number) => {
  const a = D.talent[now - 1], b = D.talent[goal - 1];
  return {
    books: (b.teachings - a.teachings) / r + (b.guide - a.guide) + (b.philosophies - a.philosophies) * r,
    weekly: b.weekly - a.weekly, crown: b.crown - a.crown, mora: b.mora - a.mora,
  };
};

/** Materials a build still needs (before inventory). */
export function genshinNeeds(build: FarmBuild, ch: Character, s: GenshinSettings): Needs {
  const i = build.inputs as GenshinInputs;
  const farm = (ch.farm ?? {}) as Record<string, unknown>;
  const lvNow = clampLv(i.lv_now, 1, 100, 1), lvGoal = Math.max(lvNow, clampLv(i.lv_goal, 1, 100, lvNow));
  const tal = (k: "na" | "skill" | "burst"): [number, number] => { const now = clampLv(i[`${k}_now`], 1, 10, 1); return [now, Math.max(now, clampLv(i[`${k}_goal`], 1, 10, now))]; };
  const na = tal("na"), skill = tal("skill"), burst = tal("burst");
  const rt = RATIO[s.bookOpt], rw = RATIO[s.wpnOpt];
  const cexp = D.charExp[Math.min(100, lvGoal)] - D.charExp[Math.min(100, lvNow)];
  const pa = D.charAscension[phase(lvNow)], pb = D.charAscension[phase(lvGoal)];
  const t = [talentDelta(na[0], na[1], rt), talentDelta(skill[0], skill[1], rt), talentDelta(burst[0], burst[1], rt)];
  // weapon
  const wpnRarity = [3, 4, 5].includes(Number(i.wpn_rarity)) ? Number(i.wpn_rarity) : 0;
  const wpnSeries = String(i.wpn_series ?? "");
  const wNow = clampLv(i.wpn_now, 1, 90, 1), wGoal = Math.max(wNow, clampLv(i.wpn_goal, 1, 90, wNow));
  let wexp = 0, wmora = 0, wpn = 0;
  if (wpnRarity && wpnSeries) {
    const tbl = D.weaponExp[String(wpnRarity) as "3" | "4" | "5"], asc = D.weaponAscension[String(wpnRarity) as "3" | "4" | "5"];
    wexp = tbl[wGoal] - tbl[wNow];
    const a = asc[phase(wNow)], b = asc[phase(wGoal)];
    wmora = b.mora - a.mora;
    wpn = (b.wep2 - a.wep2) / rw + (b.wep3 - a.wep3) + (b.wep4 - a.wep4) * rw + (b.wep5 - a.wep5) * rw * rw;
  }
  const booksRaw = farm.books;
  const bookSeries = Array.isArray(booksRaw) ? booksRaw.map(String) : booksRaw ? [String(booksRaw)] : [];
  const weeklyMat = String(farm.weekly ?? "");
  const wb = D.weeklyBosses.find((w) => w.mat === weeklyMat);
  return {
    wit: cexp / 20000,
    mora: cexp / 5 + (pb.mora - pa.mora) + t.reduce((x, y) => x + y.mora, 0) + Math.floor(wexp / 10) + wmora,
    boss: pb.boss - pa.boss,
    books: t.reduce((x, y) => x + y.books, 0),
    weekly: t.reduce((x, y) => x + y.weekly, 0),
    crowns: t.reduce((x, y) => x + y.crown, 0),
    wpn, wpnExp: wexp / 10000,
    bookSeries, bossDrop: String(farm.boss ?? ""), weeklyMat, weeklyBoss: wb?.short ?? "", wpnSeries, wpnRarity,
    booksBySeries: t.reduce<[string, number][]>((acc, x, i) => { const k = bookSeries[Math.min(i, bookSeries.length - 1)] ?? ""; const hit = acc.find((e) => e[0] === k); if (hit) hit[1] += x.books; else acc.push([k, x.books]); return acc; }, []),
    lv: [lvNow, lvGoal], na, skill, burst, wpnLv: [wNow, wGoal],
  };
}

/** Inventory as the engine sees it (series haves in guide-eq / 3★-eq). */
export function genshinHaves(inv: FarmInventoryRow[], s: GenshinSettings) {
  const q = (kind: string, key = "") => Number(inv.find((r) => r.kind === kind && r.key === key)?.qty ?? 0);
  const rt = RATIO[s.bookOpt], rw = RATIO[s.wpnOpt];
  const books = new Map<string, number>(), wpns = new Map<string, number>(), boss = new Map<string, number>(), wk = new Map<string, number>();
  for (const r of inv) {
    if (r.kind === "bookT") books.set(r.key, (books.get(r.key) ?? 0) + Number(r.qty) / rt);
    if (r.kind === "bookG") books.set(r.key, (books.get(r.key) ?? 0) + Number(r.qty));
    if (r.kind === "bookP") books.set(r.key, (books.get(r.key) ?? 0) + Number(r.qty) * rt);
    if (r.kind === "wpn2") wpns.set(r.key, (wpns.get(r.key) ?? 0) + Number(r.qty) / rw);
    if (r.kind === "wpn3") wpns.set(r.key, (wpns.get(r.key) ?? 0) + Number(r.qty));
    if (r.kind === "wpn4") wpns.set(r.key, (wpns.get(r.key) ?? 0) + Number(r.qty) * rw);
    if (r.kind === "wpn5") wpns.set(r.key, (wpns.get(r.key) ?? 0) + Number(r.qty) * rw * rw);
    if (r.kind === "boss") boss.set(r.key, Number(r.qty));
    if (r.kind === "wk") wk.set(r.key, Number(r.qty));
  }
  return { wit: q("wit") + q("adv") / 4 + q("wand") / 20, mora: q("mora"), solvent: q("solvent"), books, wpns, boss, wk };
}
export type Haves = ReturnType<typeof genshinHaves>;

export type Short = { wit: number; mora: number; boss: number; books: number[]; weekly: number; wpn: number };

/** Shortfalls after inventory, haves going to higher-priority builds first (builds must be in plan order). */
export function genshinAllocate(rows: { build: FarmBuild; needs: Needs }[], haves: Haves): Map<string, Short> {
  const h = { wit: haves.wit, mora: haves.mora, solvent: haves.solvent, books: new Map(haves.books), wpns: new Map(haves.wpns), boss: new Map(haves.boss), wk: new Map(haves.wk) };
  const take = (m: Map<string, number>, k: string, need: number) => { const have = m.get(k) ?? 0; const used = Math.min(have, need); m.set(k, have - used); return need - used; };
  const out = new Map<string, Short>();
  for (const { build, needs } of rows) {
    const books = needs.booksBySeries.map(([k, n]) => take(h.books, k, n));
    let weekly = take(h.wk, needs.weeklyMat, needs.weekly);
    const sv = Math.min(h.solvent, weekly); h.solvent -= sv; weekly -= sv;
    const wit = Math.max(0, needs.wit - h.wit); h.wit = Math.max(0, h.wit - needs.wit);
    const mora = Math.max(0, needs.mora - h.mora); h.mora = Math.max(0, h.mora - needs.mora);
    out.set(build.id, { wit, mora, boss: take(h.boss, needs.bossDrop, needs.boss), books, weekly, wpn: take(h.wpns, needs.wpnSeries, needs.wpn) });
  }
  return out;
}

type Stat = { mean: number; var: number; min: number; max: number };
export function genshinStats(s: GenshinSettings) {
  const row = (opt: number) => D.stats[s.wl * 3 + opt];
  return { book: row(s.bookOpt).book, wpn: row(s.wpnOpt).wpn, boss: row(0).boss, weekly: row(0).weekly, andrius: row(0).andrius, wit: row(0).wit, mora: row(0).mora, weeklyUseful: row(0).weeklyUseful, andriusUseful: row(0).andriusUseful };
}

/** Runs needed for a shortfall q with per-run stats, for the chosen drop-rate case (fractional; ceil later). */
export function runsFor(q: number, st: Stat, c: DropCase): number {
  if (q <= 0) return 0;
  if (st.mean <= 0) return 9999;
  if (c === "worst") return st.min > 0 ? q / st.min : 9999;
  if (c === "best") return q / st.max;
  if (c === "p80" && st.var > 0) {
    const n = Math.pow((Z80 * Math.sqrt(st.var) + Math.sqrt(Z80 * Z80 * st.var + 4 * st.mean * q)) / (2 * st.mean), 2);
    return Math.min(st.min > 0 ? q / st.min : 1e9, n);
  }
  return q / st.mean;
}
const ceilRuns = (x: number) => (x > 0 ? Math.ceil(x - 1e-9) : 0);

export type RunCounts = { weekly: number; book: number[]; wpn: number; boss: number; wit: number; mora: number };

/** Runs still to do: shortfall → runs, minus runs logged since the build / inventory were last counted. */
export function genshinRuns(short: Short, needs: Needs, s: GenshinSettings, log: FarmDay[], since: number): RunCounts {
  const st = genshinStats(s);
  const andrius = needs.weeklyBoss === "Andrius";
  // without plenty of Dream Solvent only ~1/3 of a claim's drops are the mat you need (+ a 33% solvent chance)
  const wkStat = s.solvent ? (andrius ? st.andrius : st.weekly) : andrius ? st.andriusUseful : st.weeklyUseful;
  const rt = RATIO[s.bookOpt], rw = RATIO[s.wpnOpt];
  // counted-as-runs: real drops typed on the log row replace the planned run count (sheet Log X:AA)
  const counted = (l: FarmDay, k: string) => {
    const d = l.drops ?? {}, has = (...ks: string[]) => ks.some((x) => d[x] !== undefined && d[x] !== null);
    const planned = Number(l.runs?.[k] ?? 0);
    if (k === "book" && has("bookT", "bookG", "bookP") && st.book.mean > 0) return ((d.bookT ?? 0) / rt + (d.bookG ?? 0) + (d.bookP ?? 0) * rt) / st.book.mean;
    if (k === "wpn" && has("wpn2", "wpn3", "wpn4", "wpn5") && st.wpn.mean > 0) return ((d.wpn2 ?? 0) / rw + (d.wpn3 ?? 0) + (d.wpn4 ?? 0) * rw + (d.wpn5 ?? 0) * rw * rw) / st.wpn.mean;
    if (k === "boss" && has("boss") && st.boss.mean > 0) return (d.boss ?? 0) / st.boss.mean;
    if (k === "weekly" && has("wk") && wkStat.mean > 0) return (d.wk ?? 0) / wkStat.mean;
    return planned;
  };
  const logged = (k: string) => log.filter((l) => Date.parse(l.logged_at) > since).reduce((a, l) => a + counted(l, k), 0);
  const bookRuns = short.books.map((q) => runsFor(q, st.book, s.dropCase));
  const bookTotal = bookRuns.reduce((a, b) => a + b, 0);
  const bookLogged = logged("book");
  // logged book runs come off the whole, spread over the series in proportion (one series for everyone but the Traveler)
  const bookAfter = bookRuns.map((r) => (bookTotal > 0 ? Math.max(0, r - (bookLogged * r) / bookTotal) : 0));
  return {
    weekly: ceilRuns(Math.max(0, (short.weekly > 0 && wkStat.mean <= 0 ? 9999 : runsFor(short.weekly, wkStat, s.dropCase)) - logged("weekly"))),
    book: bookAfter.map(ceilRuns),
    wpn: ceilRuns(Math.max(0, runsFor(short.wpn, st.wpn, s.dropCase) - logged("wpn"))),
    boss: ceilRuns(Math.max(0, runsFor(short.boss, st.boss, s.dropCase) - logged("boss"))),
    wit: s.ley ? ceilRuns(Math.max(0, runsFor(short.wit, st.wit, s.dropCase) - logged("wit"))) : 0,
    mora: s.ley ? ceilRuns(Math.max(0, runsFor(short.mora, st.mora, s.dropCase) - logged("mora"))) : 0,
  };
}

export const resinFor = (r: RunCounts) =>
  r.book.reduce((a, b) => a + b, 0) * COST.book + r.wpn * COST.wpn + r.boss * COST.boss + r.wit * COST.wit + r.mora * COST.mora + Math.min(r.weekly, 999) * COST.weekly;

const DOMAIN_DAYS: Record<number, number[]> = { 1: [1, 4], 2: [2, 5], 3: [3, 6] }; // Mon/Thu, Tue/Fri, Wed/Sat (+ Sunday = everything)
export const bookDays = (series: string) => { const d = D.bookDomains.find((x) => x.series === series)?.day; return d ? DOMAIN_DAYS[d] : undefined; };
export const wpnDays = (series: string) => { const d = D.weaponDomains.find((x) => x.series === series)?.day; return d ? DOMAIN_DAYS[d] : undefined; };
export const bossShort = (drop: string) => D.bosses.find((b) => b.drop === drop)?.short ?? drop;

/** The scheduler's view of a build. */
export function genshinPlanChar(build: FarmBuild, ch: Character, needs: Needs, runs: RunCounts, deadline: number | null, order: number): PlanChar {
  const buckets: Bucket[] = [];
  runs.book.forEach((n, i) => {
    const series = needs.booksBySeries[i]?.[0] || "Talent books";
    if (n > 0) buckets.push({ key: "book", label: series, cost: COST.book, rem: n, days: bookDays(series) });
  });
  if (runs.wpn > 0) buckets.push({ key: "wpn", label: needs.wpnSeries || "Weapon mats", cost: COST.wpn, rem: runs.wpn, days: wpnDays(needs.wpnSeries) });
  if (runs.boss > 0) buckets.push({ key: "boss", label: bossShort(needs.bossDrop) || "Boss", cost: COST.boss, rem: runs.boss });
  if (runs.wit > 0) buckets.push({ key: "wit", label: "EXP ley line", cost: COST.wit, rem: runs.wit });
  if (runs.mora > 0) buckets.push({ key: "mora", label: "Mora ley line", cost: COST.mora, rem: runs.mora });
  return { id: build.id, name: ch.name, order, deadline, weekly: runs.weekly > 0 && needs.weeklyBoss ? { rem: runs.weekly, boss: needs.weeklyBoss } : null, buckets };
}

/** Inventory layout for the UI: sections with rows (kind/key/label). */
export function genshinInventoryLayout() {
  return {
    global: [["mora", "", "Mora"], ["wit", "", "Hero's Wit"], ["adv", "", "Adventurer's Experience"], ["wand", "", "Wanderer's Advice"], ["solvent", "", "Dream Solvent"]] as [string, string, string][],
    books: D.bookDomains.map((b) => ({ series: b.series, region: b.region, days: ["", "Mon / Thu", "Tue / Fri", "Wed / Sat"][b.day] })),
    wpns: D.weaponDomains.map((b) => ({ series: b.series, region: b.region, days: ["", "Mon / Thu", "Tue / Fri", "Wed / Sat"][b.day] })),
    bosses: D.bosses, weeklies: D.weeklyBosses,
  };
}
