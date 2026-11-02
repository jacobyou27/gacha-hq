/**
 * Primogem forecast (Genshin): how many primogems / fates an account will have by a given day.
 *
 * Repeating income is modelled day by day (commissions, Welkin, Battle Pass, Paimon's Bargains, Abyss on the 16th,
 * Imaginarium Theater on the 1st, Stygian once per version, daily check-in). One-off content comes from the income
 * catalog (the bookkeeping sheet): events must be finished inside their version, quests / exploration need their
 * prerequisites, and everything costs play time — items are worked through with the account's hours per week, so
 * a primogem is counted on the day its quest would be finished. Versions past the catalog use the average of the
 * last six catalogued versions (estimate).
 */
import type { IncomeItem, IncomeKind, IncomeStatus } from "@/lib/types";
import { versionAt, vkey, type VersionRow } from "@/lib/calendar";
import { isoDay } from "@/lib/farm/schedule";

export type IncomeSettings = {
  asOf: number | null; primos: number; intertwined: number; acquaint: number; // what the account has, counted on asOf (default today)
  commissions: boolean; welkinUntil: number | null; bp: "none" | "free" | "paid";
  abyssStars: number; theaterActs: number; stygian: number; // endgame depth
  explorePct: number; archon: boolean; story: boolean; world: boolean; events: boolean; other: boolean; web: boolean;
  hoursPerWeek: number; // play time for quests / events / exploration (0 = no limit)
  caughtUpThrough: string | null; // content of this version and older counts as done unless marked otherwise
  futureEstimates: boolean;
};

const parseD = (s: unknown) => { const t = Date.parse(String(s ?? "").slice(0, 10) + "T00:00:00Z"); return isNaN(t) ? null : Math.round(t / 864e5); };
export function incomeSettings(raw: Record<string, unknown> | undefined, defaultCaughtUp: string | null): IncomeSettings {
  const s = raw ?? {};
  const n = (k: string, d: number) => { const v = Number(s[k]); return s[k] === undefined || s[k] === null || s[k] === "" || isNaN(v) ? d : v; };
  const b = (k: string, d: boolean) => (s[k] === undefined || s[k] === null ? d : s[k] === true || s[k] === "true");
  return {
    asOf: parseD(s.as_of), primos: n("primos", 0), intertwined: n("intertwined", 0), acquaint: n("acquaint", 0),
    commissions: b("commissions", true), welkinUntil: parseD(s.welkin_until), bp: s.bp === "paid" ? "paid" : s.bp === "none" ? "none" : "free",
    abyssStars: Math.max(0, Math.min(36, n("abyss_stars", 36))), theaterActs: Math.max(0, Math.min(12, n("theater_acts", 10))), stygian: Math.max(0, Math.min(6, n("stygian", 3))),
    explorePct: Math.max(0, Math.min(100, n("explore_pct", 100))), archon: b("future_quests", b("archon", true)), story: b("future_quests", b("story", true)), world: b("future_quests", b("world", true)),
    events: b("events", true), other: b("future_quests", b("other", true)), web: b("web", true), hoursPerWeek: Math.max(0, n("hours_per_week", 7)),
    caughtUpThrough: s.caught_up_through === undefined ? defaultCaughtUp : (String(s.caught_up_through) || null), futureEstimates: b("future_estimates", true),
  };
}

/** Spiral Abyss (floors 9–12, resets on the 16th): per floor 50 at 3★, +50 at 6★, +100 at 9★ — 800 at 36★. */
export const abyssPrimos = (stars: number) => { const f = Math.floor(stars / 9), r = stars % 9; return f * 200 + (r >= 3 ? 50 : 0) + (r >= 6 ? 50 : 0); };
/** Imaginarium Theater (monthly, the 1st): about 1,000 at all 12 acts. Estimate: 80 per act for acts 1–10, 100 each for 11–12. */
export const theaterPrimos = (acts: number) => Math.min(acts, 10) * 80 + Math.max(0, acts - 10) * 100;
/** Stygian Onslaught (once per version): 150 primos for each of difficulties I–III (IV–VI give other rewards). */
export const stygianPrimos = (level: number) => Math.min(level, 3) * 150;
export const pullsOf = (primos: number, intertwined: number) => primos / 160 + intertwined;

export type Credit = { day: number; primos: number; intertwined: number; acquaint: number; group: string };
export type ScheduleRow = { item: IncomeItem; status: "done" | "scheduled" | "missed" | "blocked" | "later" | "skipped" | "gone"; day: number | null; primos: number; intertwined: number; minutes: number; why?: string };
export type Forecast = {
  start: number; until: number; settings: IncomeSettings; credits: Credit[]; schedule: ScheduleRow[];
  total: { primos: number; intertwined: number; acquaint: number }; byGroup: Record<string, { primos: number; intertwined: number }>;
  at: (day: number) => { primos: number; intertwined: number; acquaint: number; pulls: number };
  months: { month: string; primos: number; intertwined: number; pulls: number; cumPulls: number }[];
  minutesPlanned: number;
};

export const GROUPS = ["Commissions", "Welkin Moon", "Battle Pass", "Paimon's Bargains", "Endgame", "Events", "Quests & exploration", "Web / mail / codes", "Future versions (estimate)"] as const;
const PRIORITY: Record<string, number> = { archon: 0, story: 1, world: 1, exploration: 2, endgame: 2, other: 3 };

/** Status of one catalog item for an account: the account's own tick wins; otherwise everything up to the
 * "finished up to" version is done and the rest is planned (exploration only if % > 0, endgame one-offs only if
 * some endgame is played). The quest / event switches only shape the estimate for versions not announced yet. */
export function itemStatus(it: IncomeItem, s: IncomeSettings, marks: Map<string, IncomeStatus>): IncomeStatus {
  const m = marks.get(it.id);
  if (m) return m;
  if (s.caughtUpThrough && vkey(it.version) <= vkey(s.caughtUpThrough)) return "done";
  if (it.kind === "exploration") return s.explorePct > 0 ? "todo" : "skip";
  if (it.kind === "endgame") return s.abyssStars + s.theaterActs + s.stygian > 0 ? "todo" : "skip";
  return "todo";
}

export function forecast(args: { items: IncomeItem[]; marks: Map<string, IncomeStatus>; settings: IncomeSettings; rows: VersionRow[]; today: number; until: number }): Forecast {
  const { items, marks, settings: s, rows, today } = args;
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

  // ---- web / mail / codes per catalogued version (check-in handled daily)
  for (const v of rows) {
    if (v.end < start || v.start > until || !catalog.has(v.version) || !s.web) continue;
    for (const it of items) {
      if (it.version !== v.version || it.section !== "web" || /Daily Check-In/i.test(it.name)) continue;
      add(/Stream Code/i.test(it.name) ? Math.max(v.start, v.end - 10) : v.start, it.primos, it.intertwined, it.acquaint, "Web / mail / codes");
    }
  }

  // ---- future versions beyond the catalog: average of the last six catalogued versions
  if (s.futureEstimates) {
    const recent = catVersions.slice(-6);
    const avg = (pred: (i: IncomeItem) => boolean, scale = 1) => {
      let p = 0, f = 0, a = 0;
      for (const i of items) if (recent.includes(i.version) && pred(i)) { p += i.primos * scale; f += i.intertwined * scale; a += i.acquaint * scale; }
      return { p: p / recent.length, f: f / recent.length, a: a / recent.length };
    };
    const ev = avg((i) => i.section === "event");
    const wb = avg((i) => i.section === "web" && !/Daily Check-In/i.test(i.name));
    const kindAvg = (k: IncomeKind) => avg((i) => i.section === "new" && i.kind === k);
    for (const v of rows) {
      if (catalog.has(v.version) || v.end < start || v.start > until) continue;
      const grp = "Future versions (estimate)";
      if (s.events) add(v.start + 21, ev.p, ev.f, ev.a, grp);
      if (s.web) add(v.start, wb.p, wb.f, wb.a, grp);
      const kinds: [IncomeKind, number][] = [["archon", s.archon ? 1 : 0], ["story", s.story ? 1 : 0], ["world", s.world ? 1 : 0], ["exploration", s.explorePct / 100], ["other", s.other ? 1 : 0], ["endgame", s.abyssStars + s.theaterActs + s.stygian > 0 ? 1 : 0]];
      for (const [k, f] of kinds) { if (!f) continue; const x = kindAvg(k); add(v.start + 14, x.p * f, x.f * f, x.a * f, grp); }
    }
  }

  // ---- one-off content: events + quests + exploration, worked through with the play-time budget
  const vrow = new Map(rows.map((r) => [r.version, r]));
  const firstRow = rows[0];
  const keyOf = (i: IncomeItem) => `${i.version}:${i.name}`;
  const byKey = new Map<string, IncomeItem>();
  for (const i of items) if (!byKey.has(keyOf(i))) byKey.set(keyOf(i), i);
  const content = items.filter((i) => i.section === "event" || i.section === "new");
  const st = new Map(content.map((i) => [i.id, itemStatus(i, s, marks)]));
  const factor = (i: IncomeItem) => (i.kind === "exploration" ? s.explorePct / 100 : 1);
  const schedule: ScheduleRow[] = [];
  const rowOf = new Map<string, ScheduleRow>();
  type Job = { it: IncomeItem; left: number; from: number; to: number | null; row: ScheduleRow };
  const jobs: Job[] = [];
  for (const it of content) {
    const f = factor(it), minutes = Math.max(1, Math.round((it.minutes ?? 15) * f));
    const row: ScheduleRow = { item: it, status: "later", day: null, primos: it.primos * f, intertwined: it.intertwined * f, minutes };
    rowOf.set(it.id, row); schedule.push(row);
    const status = st.get(it.id)!;
    if (status === "done") { row.status = "done"; continue; }
    if (status === "skip") { row.status = "skipped"; continue; }
    const v = vrow.get(it.version);
    // versions older than the calendar's first row are long released
    const from = v ? v.start : firstRow && vkey(it.version) < vkey(firstRow.version) ? -1e9 : 1e9;
    const to = it.section === "event" ? (v ? v.end : firstRow && vkey(it.version) < vkey(firstRow.version) ? -1e9 : null) : null;
    if (to !== null && to < start) { row.status = "gone"; row.why = "event is over"; continue; }
    jobs.push({ it, left: minutes, from, to, row });
  }
  // prerequisites: blocked if a required item is skipped / gone (and not done)
  const prereqOk = (j: Job): "ok" | "wait" | "blocked" => {
    for (const r of j.it.requires) {
      const p = byKey.get(r); if (!p) continue;
      const pr = rowOf.get(p.id);
      if (!pr || pr.status === "done" || (pr.status === "scheduled" && pr.day !== null)) continue;
      // not planned: assume it is already done (you wouldn't plan a quest you can't start) — just say so
      if (pr.status === "skipped" || pr.status === "gone" || pr.status === "blocked" || pr.status === "missed") { j.row.why = `needs ${p.name} (${p.version}) — counted as already done`; continue; }
      return "wait";
    }
    return "ok";
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
        if (d < j.from) continue;
        const ok = prereqOk(j);
        if (ok === "blocked") { j.row.status = "blocked"; continue; }
        if (ok === "wait") continue;
        const use = Math.min(budget, j.left);
        j.left -= use; budget -= use; progressed = true;
        if (j.left <= 1e-9) {
          j.row.status = "scheduled"; j.row.day = d;
          add(d, j.row.primos, j.row.intertwined, j.it.acquaint * factor(j.it), j.it.section === "event" ? "Events" : "Quests & exploration");
        }
        break; // re-scan from the top (priorities / new unlocks)
      }
    }
    open = open.filter((j) => j.row.status === "later");
  }
  for (const j of open) {
    if (j.to !== null && j.to <= until) { j.row.status = "missed"; j.row.why = "not finished before the event ended"; }
    else { const ok = prereqOk(j); if (ok === "blocked") j.row.status = "blocked"; }
  }

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
