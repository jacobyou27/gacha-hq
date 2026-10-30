/**
 * Puts one account's planner together: settings → needs → inventory → runs → schedule.
 * Game-specific pieces live in ./genshin (HSR / ZZZ follow the same shape).
 */
import type { Character, FarmBuild, FarmDay, FarmEvent, FarmInventoryRow, Game, GameAccount, GameVersion } from "@/lib/types";
import { dayNum, dow, isoDay, parseDay, simulate, summary, type Claim, type PlanChar, type SimOpts, type Status } from "./schedule";
import {
  genshinAllocate, genshinHaves, genshinNeeds, genshinPlanChar, genshinRuns, genshinSettings, resinFor,
  type GenshinSettings, type Needs, type RunCounts, type Short,
} from "./genshin";

export type PlanRow = {
  build: FarmBuild; ch: Character; needs: Needs; short: Short; runs: RunCounts; resin: number;
  deadline: number | null; status: Status | null; order: number;
};
export type AccountPlan = {
  settings: GenshinSettings;
  today: number; start: number; carry: number;
  rows: PlanRow[];
  days: ReturnType<typeof simulate>["days"];
  day0: ReturnType<typeof simulate>["day0"]; left0: number;
  todayText: string; todayLogged: FarmDay[]; todaySkipped: boolean;
  notTicked: number; // past days since the plan start that aren't logged
  resinTotal: number; doneBy: number | null; deadlinesMissed: number; deadlines: number;
  stygian: [number, number] | null; // next / current Stygian week (abs start, length)
};

const SERVER_OFFSET: Record<string, number> = { America: -5, Europe: 1, Asia: 8, "TW/HK/MO": 8 };
export const gameToday = (server: string | null, now = new Date()) => Math.floor((now.getTime() / 36e5 + (SERVER_OFFSET[server ?? ""] ?? -5) - 4) / 24);

const DOWS: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
export function daysOffFlags(txt: string): boolean[] {
  const f = [false, false, false, false, false, false, false], t = txt.toLowerCase();
  if (/weekend/.test(t)) { f[0] = true; f[6] = true; }
  if (/weekday/.test(t)) [1, 2, 3, 4, 5].forEach((d) => (f[d] = true));
  for (const m of t.matchAll(/\b(sun|mon|tue|wed|thu|fri|sat)/g)) f[DOWS[m[1]]] = true;
  return f;
}

/** Version calendar: anchor version + 42-day cycles. Phase 2 starts 21 days in. */
export function versionCalendar(versions: GameVersion[], gameId: string, length = 42) {
  const v = versions.filter((x) => x.game_id === gameId && x.starts_on).sort((a, b) => parseDay(b.starts_on!) - parseDay(a.starts_on!))[0];
  if (!v) return null;
  const [maj, min] = v.version.split(".").map(Number);
  const anchor = parseDay(v.starts_on!);
  const per = gameId === "genshin" ? 8 : 9; // minor versions per major (x.0 … x.7 / x.8)
  const label = (n: number) => { const i = maj * per + min + n; return `${Math.floor(i / per)}.${i % per}${n > 1 ? "?" : ""}`; };
  return { anchor, length, label, start: (n: number) => anchor + length * n, banners: Array.from({ length: 16 }, (_, k) => { const n = Math.floor(k / 2) - 1, ph = (k % 2) + 1; const d = anchor + length * n + (ph === 2 ? 21 : 0); return { label: `${label(n)} Phase ${ph} · ${isoDay(d)}`, key: `${label(n).replace("?", "")} Phase ${ph}`, day: d }; }) };
}

export function bannerDay(cal: ReturnType<typeof versionCalendar>, banner: string | null): number | null {
  if (!cal || !banner) return null;
  const key = banner.split(" · ")[0].trim();
  return cal.banners.find((b) => b.key === key)?.day ?? null;
}

export function planAccount(args: {
  game: Game; account: GameAccount; builds: FarmBuild[]; characters: Character[]; inventory: FarmInventoryRow[]; log: FarmDay[]; versions: GameVersion[]; events?: FarmEvent[]; now?: Date;
}): AccountPlan {
  const { game, account, builds, characters, inventory, log, versions } = args;
  const events = (args.events ?? []).map((e) => ({ kind: e.kind, from: parseDay(e.starts_on), to: parseDay(e.ends_on) }));
  const overflowOn = (abs: number) => { const e = events.find((x) => abs >= x.from && abs <= x.to); return e ? (e.kind === "overflow_artifacts" ? "artifacts" : e.kind === "overflow_ley" ? "ley" : "domain") : null; };
  const now = args.now ?? new Date();
  const acc = (account.settings ?? {}) as Record<string, unknown>;
  const s = genshinSettings(acc, game.stamina_per_day);
  const today = gameToday(account.server, now);
  const charById = new Map(characters.map((c) => [c.id, c]));
  const cal = versionCalendar(versions, game.id);

  // plan start / carry from the log (sheet: Calc H / I)
  const logDays = log.map((l) => parseDay(l.day));
  const lastLogged = log.filter((l) => l.status !== "skipped" || parseDay(l.day) <= today).reduce((m, l) => Math.max(m, parseDay(l.day)), 0);
  const start = lastLogged > 0 && lastLogged >= today - 3 ? lastLogged + 1 : today;
  const carry = s.cap > 0 ? Number(log.find((l) => parseDay(l.day) === start - 1)?.stamina_left ?? 0) : 0;
  const invCounted = Date.parse(String(acc.inv_counted_at ?? "")) || 0;

  // stygian week: 8 days after each version start, 7 days long, every cycle
  let stygian: [number, number] | null = null;
  if (cal) {
    let st = cal.anchor + 8;
    while (st + 7 <= today) st += cal.length;
    stygian = [st, 7];
  }
  const blocked = (abs: number) => !!(s.stygianSkip && stygian && ((((abs - stygian[0]) % cal!.length) + cal!.length) % cal!.length) < stygian[1]);

  // builds in plan order
  const active = builds.filter((b) => !b.done && charById.has(b.character_id));
  const withDl = active.map((b) => {
    const dl = b.deadline ? parseDay(b.deadline) : null, bd = bannerDay(cal, b.banner);
    const deadline = dl !== null && bd !== null ? Math.min(dl, bd) : dl ?? bd;
    const pr = Number.isFinite(b.priority) ? b.priority : 999;
    const order = s.order === "deadline" ? (deadline ?? 99999) + pr / 1000 : pr;
    return { build: b, deadline, order };
  }).sort((a, b) => a.order - b.order || a.build.created_at.localeCompare(b.build.created_at));

  const needsRows = withDl.map((x) => ({ build: x.build, needs: genshinNeeds(x.build, charById.get(x.build.character_id)!, s) }));
  const shorts = genshinAllocate(needsRows, genshinHaves(inventory, s));
  const rows: PlanRow[] = withDl.map((x, i) => {
    const ch = charById.get(x.build.character_id)!, needs = needsRows[i].needs, short = shorts.get(x.build.id)!;
    const since = Math.max(invCounted, Date.parse(x.build.counted_at) || 0);
    const runs = genshinRuns(short, needs, s, log.filter((l) => l.character === ch.name), since);
    return { build: x.build, ch, needs, short, runs, resin: resinFor(runs), deadline: x.deadline, status: null, order: x.order };
  });

  const chars: PlanChar[] = rows.map((r) => genshinPlanChar(r.build, r.ch, r.needs, r.runs, r.deadline === null ? null : r.deadline - start, r.order));
  const claims: Claim[] = log.filter((l) => Number(l.runs?.weekly ?? 0) > 0).map((l) => ({ day: parseDay(l.day), boss: String(l.runs.weekly_boss ?? ""), cost: Number(l.runs.weekly_cost ?? 30), n: Number(l.runs.weekly) }));
  const opt: SimOpts = {
    start, perDay: s.resinPerDay, extraWeek: s.extraWeek, fuel: s.fragile * 60, cap: s.cap, carry,
    allowExtraWeekly: s.allow60, monBoss: s.monBoss, weeklyDow: s.weeklyDay,
    weekly: { perWeek: 3, cost: 30, extraCost: 60, oncePerBoss: true },
    claims, seen: logDays, skip: new Set(log.filter((l) => l.status === "skipped").map((l) => parseDay(l.day))),
    offDow: daysOffFlags(s.daysOff), blocked, lostLabel: "resin → artifacts", staminaName: "resin",
    overflow: s.overflow ? overflowOn : undefined,
  };
  const sim = simulate(chars, opt, true);
  const st = summary(chars, opt);
  rows.forEach((r) => { r.status = st.get(r.build.id) ?? null; });

  const todayLogged = log.filter((l) => parseDay(l.day) === today);
  const todaySkipped = todayLogged.some((l) => l.status === "skipped");
  const d = today - start;
  const hit = sim.days.find((x) => x.d === d);
  const todayText = chars.length === 0 ? "No builds yet" : hit ? hit.text : sim.days.length && d > sim.days[sim.days.length - 1].d ? "Everything farmed" : d < 0 ? "Already logged for today" : "Nothing farmable today";
  let notTicked = 0;
  const logged = new Set(logDays);
  for (let q = start; q < today; q++) if (!logged.has(q) && !opt.offDow[dow(q)] && !blocked(q)) notTicked++;
  const finishes = rows.map((r) => r.status?.finish ?? null);
  return {
    settings: s, today, start, carry, rows, days: sim.days, day0: sim.day0, left0: sim.left0,
    todayText, todayLogged, todaySkipped, notTicked,
    resinTotal: rows.reduce((a, r) => a + r.resin, 0),
    doneBy: finishes.some((f) => f === null) ? null : finishes.length ? Math.max(...(finishes as number[])) : null,
    deadlinesMissed: rows.filter((r) => r.status?.status.startsWith("■")).length,
    deadlines: rows.filter((r) => r.deadline !== null).length,
    stygian,
  };
}

/** What logging "Done" for one day writes: a row per build that farmed something (or one "(nothing farmed)" row). */
export function dayRowsFor(plan: AccountPlan, args: { game: Game; account: GameAccount; builds: FarmBuild[]; characters: Character[]; inventory: FarmInventoryRow[]; log: FarmDay[]; versions: GameVersion[]; events?: FarmEvent[] }, day: number) {
  // re-simulate from that day with the log minus that day's rows (like the sheet's toggleDay_)
  const log = args.log.filter((l) => parseDay(l.day) !== day);
  const base = planAccount({ ...args, log });
  const carry = base.settings.cap > 0 ? Number(log.find((l) => parseDay(l.day) === day - 1)?.stamina_left ?? 0) : 0;
  const chars: PlanChar[] = base.rows.map((r) => genshinPlanChar(r.build, r.ch, r.needs, r.runs, r.deadline === null ? null : r.deadline - day, r.order));
  const s = base.settings;
  const sim = simulate(chars, {
    start: day, perDay: s.resinPerDay, extraWeek: s.extraWeek, fuel: s.fragile * 60, cap: s.cap, carry,
    allowExtraWeekly: s.allow60, monBoss: s.monBoss, weeklyDow: s.weeklyDay, weekly: { perWeek: 3, cost: 30, extraCost: 60, oncePerBoss: true },
    claims: log.filter((l) => Number(l.runs?.weekly ?? 0) > 0).map((l) => ({ day: parseDay(l.day), boss: String(l.runs.weekly_boss ?? ""), cost: Number(l.runs.weekly_cost ?? 30), n: Number(l.runs.weekly) })),
    seen: log.map((l) => parseDay(l.day)), skip: new Set(), offDow: daysOffFlags(s.daysOff), blocked: () => false, lostLabel: "resin → artifacts", staminaName: "resin",
    overflow: s.overflow ? (abs) => { const e = (args.events ?? []).find((x) => abs >= parseDay(x.starts_on) && abs <= parseDay(x.ends_on)); return e ? (e.kind === "overflow_artifacts" ? "artifacts" : e.kind === "overflow_ley" ? "ley" : "domain") : null; } : undefined,
  }, false);
  type Row = { build_id: string | null; character: string; status: "done"; runs: Record<string, number | string>; stamina_left: number; text: string };
  const out: Row[] = sim.day0.filter((x) => x.weekly + Object.values(x.runs).reduce((a, b) => a + b, 0) > 0).map((x) => ({
    build_id: x.id, character: x.name, status: "done" as const,
    runs: { weekly: x.weekly, weekly_boss: x.weekly ? x.weeklyBoss : "", weekly_cost: x.weekly ? x.weeklyCost : 0, ...x.runs },
    stamina_left: sim.left0, text: x.text,
  }));
  if (!out.length) out.push({ build_id: null, character: "(nothing farmed)", status: "done", runs: {}, stamina_left: sim.day0.length ? sim.left0 : carry, text: "Nothing farmed" });
  return out;
}

export { dayNum, isoDay, parseDay };
