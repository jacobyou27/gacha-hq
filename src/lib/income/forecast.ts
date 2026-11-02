/**
 * Primogem forecast (Genshin): how many primogems / fates an account will have by a given day.
 *
 * Two parts:
 *  - regular income, modelled day by day from the account's settings (commissions, Welkin, Battle Pass, Paimon's
 *    Bargains, Abyss on the 16th, Imaginarium Theater on the 1st, Stygian once per version, codes / mail / check-in);
 *  - the account's plan: catalog items (income_items) the account added. Only planned items count. Each can be done
 *    partly (amount %, or "x of y" chests per rarity) and can carry the account's own primogem value. Planned items are
 *    worked through with the account's hours per week, so a primogem counts on the day its quest would be finished;
 *    events have to be finished before their version ends.
 * Versions not out yet are ordinary catalog rows marked is_estimate (seeded from the average of recent versions).
 */
import type { IncomeItem, IncomePlanEntry } from "@/lib/types";
import { versionAt, vkey, type VersionRow } from "@/lib/calendar";
import { isoDay } from "@/lib/farm/schedule";

export type IncomeSettings = {
  asOf: number | null; primos: number; intertwined: number; acquaint: number; // what the account has, counted on asOf (default today)
  commissions: boolean; welkinUntil: number | null; bp: "none" | "free" | "paid";
  abyssStars: number; theaterActs: number; stygian: number; // endgame depth
  web: boolean; // codes, mail, web events, check-in
  hoursPerWeek: number; // play time for planned quests / events / exploration (0 = no limit)
};

const parseD = (s: unknown) => { const t = Date.parse(String(s ?? "").slice(0, 10) + "T00:00:00Z"); return isNaN(t) ? null : Math.round(t / 864e5); };
export function incomeSettings(raw: Record<string, unknown> | undefined): IncomeSettings {
  const s = raw ?? {};
  const n = (k: string, d: number) => { const v = Number(s[k]); return s[k] === undefined || s[k] === null || s[k] === "" || isNaN(v) ? d : v; };
  const b = (k: string, d: boolean) => (s[k] === undefined || s[k] === null ? d : s[k] === true || s[k] === "true");
  return {
    asOf: parseD(s.as_of), primos: n("primos", 0), intertwined: n("intertwined", 0), acquaint: n("acquaint", 0),
    commissions: b("commissions", true), welkinUntil: parseD(s.welkin_until), bp: s.bp === "paid" ? "paid" : s.bp === "none" ? "none" : "free",
    abyssStars: Math.max(0, Math.min(36, n("abyss_stars", 36))), theaterActs: Math.max(0, Math.min(12, n("theater_acts", 10))), stygian: Math.max(0, Math.min(6, n("stygian", 3))),
    web: b("web", true), hoursPerWeek: Math.max(0, n("hours_per_week", 7)),
  };
}

/** What one planned item is worth for this account: its own primogem value, the % it'll do, chests per rarity. */
export function planValue(it: IncomeItem, e: IncomePlanEntry | undefined) {
  const base = e?.primos_override ?? it.primos;
  let frac = Math.max(0, Math.min(100, e?.amount ?? 100)) / 100;
  let primos = base * frac;
  if (it.pools?.length && e?.counts) {
    let chest = 0, opened = 0, all = 0, poolPrimos = 0;
    for (const p of it.pools) {
      const c = Math.max(0, Math.min(p.count, Number(e.counts[p.key] ?? p.count)));
      chest += c * p.each; opened += c; all += p.count; poolPrimos += p.count * p.each;
    }
    frac = all ? opened / all : 1;
    const rest = Math.max(0, it.primos - poolPrimos) * frac; // puzzles / seelies / challenges: same share as the chests
    primos = chest + rest;
    if (e.primos_override !== null && e.primos_override !== undefined && it.primos > 0) primos *= e.primos_override / it.primos;
  }
  return { primos, intertwined: it.intertwined * frac, acquaint: it.acquaint * frac, minutes: Math.max(1, Math.round((it.minutes ?? 15) * frac)), frac };
}

/** Spiral Abyss (floors 9–12, resets on the 16th): per floor 50 at 3★, +50 at 6★, +100 at 9★ — 800 at 36★. */
export const abyssPrimos = (stars: number) => { const f = Math.floor(stars / 9), r = stars % 9; return f * 200 + (r >= 3 ? 50 : 0) + (r >= 6 ? 50 : 0); };
/** Imaginarium Theater (monthly, the 1st): about 1,000 at all 12 acts. Estimate: 80 per act for acts 1–10, 100 each for 11–12. */
export const theaterPrimos = (acts: number) => Math.min(acts, 10) * 80 + Math.max(0, acts - 10) * 100;
/** Stygian Onslaught (once per version): 150 primos for each of difficulties I–III (IV–VI give other rewards). */
export const stygianPrimos = (level: number) => Math.min(level, 3) * 150;
export const pullsOf = (primos: number, intertwined: number) => primos / 160 + intertwined;

export type Credit = { day: number; primos: number; intertwined: number; acquaint: number; group: string };
export type ScheduleRow = { item: IncomeItem; status: "done" | "scheduled" | "missed" | "later" | "gone"; day: number | null; primos: number; intertwined: number; acquaint: number; minutes: number; frac: number; why?: string };
export type Forecast = {
  start: number; until: number; settings: IncomeSettings; credits: Credit[]; schedule: ScheduleRow[];
  total: { primos: number; intertwined: number; acquaint: number }; byGroup: Record<string, { primos: number; intertwined: number }>;
  at: (day: number) => { primos: number; intertwined: number; acquaint: number; pulls: number };
  months: { month: string; primos: number; intertwined: number; pulls: number; cumPulls: number }[];
  minutesPlanned: number;
};

export const GROUPS = ["Commissions", "Welkin Moon", "Battle Pass", "Paimon's Bargains", "Endgame", "Web / mail / codes", "Events", "Quests & exploration"] as const;
const PRIORITY: Record<string, number> = { archon: 0, story: 1, world: 1, exploration: 2, endgame: 2, other: 3 };
/** Catalog items you add to a plan (the rest — repeating income, codes / mail — is covered by the settings). */
export const isPlannable = (it: IncomeItem) => it.section === "event" || it.section === "new";

export function forecast(args: { items: IncomeItem[]; plan: Map<string, IncomePlanEntry>; settings: IncomeSettings; rows: VersionRow[]; today: number; until: number }): Forecast {
  const { items, plan, settings: s, rows, today } = args;
  const start = s.asOf !== null && s.asOf <= today ? s.asOf : today;
  const until = Math.max(start, args.until);
  const credits: Credit[] = [];
  const add = (day: number, primos: number, intertwined: number, acquaint: number, group: string) => { if (day >= start && day <= until && (primos || intertwined || acquaint)) credits.push({ day, primos, intertwined, acquaint, group }); };
  const catalog = new Set(items.map((i) => i.version));
  const catVersions = [...catalog].sort((a, b) => vkey(a) - vkey(b));
  const recurring = (name: RegExp) => { for (let i = catVersions.length - 1; i >= 0; i--) { const r = items.find((x) => x.version === catVersions[i] && x.section === "recurring" && name.test(x.name)); if (r) return r; } return null; };
  const bpFree = recurring(/^Battle Pass - F2P/), bpPaid = recurring(/^Battle Pass - Paid/);

  // ---- repeating income, day by day
  for (let d = start; d <= until; d++) {
    const date = new Date(d * 864e5), dom = date.getUTCDate();
    const v = versionAt(rows, d), vlen = v ? v.end - v.start + 1 : 42;
    if (s.commissions) add(d, 60, 0, 0, "Commissions");
    if (s.welkinUntil !== null && d <= s.welkinUntil) add(d, 90, 0, 0, "Welkin Moon");
    if (s.web) add(d, 82.85 / 42, 0, 0, "Web / mail / codes"); // HoYoLAB daily check-in
    if (s.bp !== "none" && bpFree) add(d, bpFree.primos / vlen, bpFree.intertwined / vlen, bpFree.acquaint / vlen, "Battle Pass");
    if (s.bp === "paid" && bpPaid) add(d, bpPaid.primos / vlen, bpPaid.intertwined / vlen, bpPaid.acquaint / vlen, "Battle Pass");
    if (dom === 1) add(d, 0, 5, 5, "Paimon's Bargains");
    if (dom === 1 && s.theaterActs > 0) add(d, theaterPrimos(s.theaterActs), 0, 0, "Endgame");
    if (dom === 16 && s.abyssStars > 0) add(d, abyssPrimos(s.abyssStars), 0, 0, "Endgame");
    if (v && d === v.start + 8 && s.stygian > 0) add(d, stygianPrimos(s.stygian), 0, 0, "Endgame");
  }

  // ---- web / mail / codes per version (check-in handled daily; versions not out yet use their estimate line)
  for (const v of rows) {
    if (v.end < start || v.start > until || !catalog.has(v.version) || !s.web) continue;
    for (const it of items) {
      if (it.version !== v.version || it.section !== "web" || /Daily Check-In/i.test(it.name)) continue;
      add(/Stream Code/i.test(it.name) ? Math.max(v.start, v.end - 10) : it.is_estimate ? v.start + 14 : v.start, it.primos, it.intertwined, it.acquaint, "Web / mail / codes");
    }
  }

  // ---- the plan: events + quests + exploration the account added, worked through with the play-time budget
  const vrow = new Map(rows.map((r) => [r.version, r]));
  const firstRow = rows[0];
  const keyOf = (i: IncomeItem) => `${i.version}:${i.name}`;
  const byKey = new Map<string, IncomeItem>();
  for (const i of items) if (!byKey.has(keyOf(i))) byKey.set(keyOf(i), i);
  const schedule: ScheduleRow[] = [];
  const rowOf = new Map<string, ScheduleRow>();
  type Job = { it: IncomeItem; left: number; from: number; to: number | null; row: ScheduleRow };
  const jobs: Job[] = [];
  for (const it of items) {
    const e = plan.get(it.id);
    if (!e || e.status === "skip" || !isPlannable(it)) continue;
    const val = planValue(it, e);
    const row: ScheduleRow = { item: it, status: "later", day: null, primos: val.primos, intertwined: val.intertwined, acquaint: val.acquaint, minutes: val.minutes, frac: val.frac };
    rowOf.set(it.id, row); schedule.push(row);
    if (e.status === "done") { row.status = "done"; continue; }
    const v = vrow.get(it.version);
    // versions older than the calendar's first row are long released
    const old = firstRow && vkey(it.version) < vkey(firstRow.version);
    const from = v ? v.start : old ? -1e9 : 1e9;
    const to = it.section === "event" ? (v ? v.end : old ? -1e9 : null) : null;
    if (to !== null && to < start) { row.status = "gone"; row.why = "event is over"; continue; }
    if (val.frac <= 0) { row.status = "scheduled"; row.day = Math.max(start, from); continue; }
    jobs.push({ it, left: val.minutes, from, to, row });
  }
  // prerequisites: wait for a required item that is also in the plan; one that isn't is taken as already done
  const prereqOk = (j: Job): boolean => {
    for (const r of j.it.requires) {
      const p = byKey.get(r); if (!p) continue;
      const pr = rowOf.get(p.id);
      if (!pr || pr.status === "done" || pr.status === "gone" || pr.status === "missed" || (pr.status === "scheduled" && pr.day !== null)) continue;
      return false;
    }
    return true;
  };
  const order = (a: Job, b: Job) => {
    const ae = a.to !== null, be = b.to !== null;
    if (ae !== be) return ae ? -1 : 1;
    if (ae && be && a.to !== b.to) return (a.to as number) - (b.to as number);
    return (PRIORITY[a.it.kind] ?? 2) - (PRIORITY[b.it.kind] ?? 2) || vkey(a.it.version) - vkey(b.it.version) || a.it.seq - b.it.seq;
  };
  jobs.sort(order);
  const perDay = s.hoursPerWeek > 0 ? (s.hoursPerWeek * 60) / 7 : Infinity;
  let open = jobs.slice();
  for (let d = start; d <= until && open.length; d++) {
    let budget = perDay;
    let progressed = true;
    while (budget > 1e-9 && progressed) {
      progressed = false;
      for (const j of open) {
        if (j.row.status !== "later") continue;
        if (j.to !== null && d > j.to) { j.row.status = "missed"; j.row.why = "not finished before the event ended"; continue; }
        if (d < j.from || !prereqOk(j)) continue;
        const use = Math.min(budget, j.left);
        j.left -= use; budget -= use; progressed = true;
        if (j.left <= 1e-9) {
          j.row.status = "scheduled"; j.row.day = d;
          add(d, j.row.primos, j.row.intertwined, j.row.acquaint, j.it.section === "event" ? "Events" : "Quests & exploration");
        }
        break; // re-scan from the top (priorities / new unlocks)
      }
    }
    open = open.filter((j) => j.row.status === "later");
  }
  for (const j of open) if (j.to !== null && j.to <= until) { j.row.status = "missed"; j.row.why = "not finished before the event ended"; }

  // ---- totals
  credits.sort((a, b) => a.day - b.day);
  const total = { primos: 0, intertwined: 0, acquaint: 0 };
  const byGroup: Record<string, { primos: number; intertwined: number }> = {};
  for (const c of credits) {
    total.primos += c.primos; total.intertwined += c.intertwined; total.acquaint += c.acquaint;
    const g = (byGroup[c.group] ??= { primos: 0, intertwined: 0 }); g.primos += c.primos; g.intertwined += c.intertwined;
  }
  const at = (day: number) => {
    let p = s.primos, f = s.intertwined, a = s.acquaint;
    for (const c of credits) { if (c.day > day) break; p += c.primos; f += c.intertwined; a += c.acquaint; }
    return { primos: p, intertwined: f, acquaint: a, pulls: pullsOf(p, f) };
  };
  const months: Forecast["months"] = [];
  let cum = pullsOf(s.primos, s.intertwined);
  for (const c of credits) {
    const m = isoDay(c.day).slice(0, 7);
    let row = months[months.length - 1];
    if (!row || row.month !== m) { row = { month: m, primos: 0, intertwined: 0, pulls: 0, cumPulls: cum }; months.push(row); }
    row.primos += c.primos; row.intertwined += c.intertwined; row.pulls = pullsOf(row.primos, row.intertwined); cum += pullsOf(c.primos, c.intertwined); row.cumPulls = cum;
  }
  const minutesPlanned = schedule.filter((r) => r.status === "scheduled").reduce((a, r) => a + r.minutes, 0);
  return { start, until, settings: s, credits, schedule, total, byGroup, at, months, minutesPlanned };
}
