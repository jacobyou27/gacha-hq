/**
 * Puts one account's planner together: settings → needs → inventory → runs → schedule.
 * Game-specific pieces live in ./genshin, ./hsr and ./zzz behind the GameModule interface (./game).
 */
import type { Character, FarmBuild, FarmDay, FarmEvent, FarmInventoryRow, Game, GameAccount, GameVersion } from "@/lib/types";
import { dayNum, dow, isoDay, parseDay, simulate, summary, type Claim, type PlanChar, type SimOpts, type Status } from "./schedule";
import { moduleFor, type AnyModule, type CommonSettings } from "./game";

export type PlanRow<N = unknown, Sh = unknown, R = unknown> = {
  build: FarmBuild; ch: Character; needs: N; short: Sh; runs: R; resin: number; // resin = stamina still needed
  deadline: number | null; status: Status | null; order: number;
};
export type AccountPlan<S extends CommonSettings = CommonSettings, N = unknown, Sh = unknown, R = unknown> = {
  gameId: string;
  settings: S;
  today: number; start: number; carry: number;
  rows: PlanRow<N, Sh, R>[];
  days: ReturnType<typeof simulate>["days"];
  day0: ReturnType<typeof simulate>["day0"]; left0: number;
  todayText: string; todayLogged: FarmDay[]; todaySkipped: boolean;
  notTicked: number; // past days since the plan start that aren't logged
  resinTotal: number; doneBy: number | null; deadlinesMissed: number; deadlines: number;
  stygian: [number, number] | null; // next / current Stygian week (abs start, length) — Genshin
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

/** Version calendar: every known version (Phase 2 = 21 days in) plus 42-day projections after the latest. */
export function versionCalendar(versions: GameVersion[], gameId: string, length = 42) {
  const known = versions.filter((x) => x.game_id === gameId && x.starts_on).sort((a, b) => parseDay(a.starts_on!) - parseDay(b.starts_on!));
  const v = known[known.length - 1];
  if (!v) return null;
  const [maj, min] = v.version.split(".").map(Number);
  const anchor = parseDay(v.starts_on!);
  const per = gameId === "genshin" ? 8 : 9; // minor versions per major (x.0 … x.7 / x.8)
  const label = (n: number) => { const i = maj * per + min + n; return `${Math.floor(i / per)}.${i % per}${n > 0 ? "?" : ""}`; };
  const banners: { label: string; key: string; day: number }[] = [];
  const add = (ver: string, est: boolean, start: number) => { for (const ph of [1, 2]) { const d = start + (ph === 2 ? 21 : 0); banners.push({ label: `${ver}${est ? "?" : ""} Phase ${ph} · ${isoDay(d)}`, key: `${ver} Phase ${ph}`, day: d }); } };
  for (const k of known.slice(-3)) add(k.version, k.is_estimate, parseDay(k.starts_on!));
  for (let n = 1; n <= 7; n++) add(label(n).replace("?", ""), true, anchor + length * n);
  return { anchor, length, label, start: (n: number) => anchor + length * n, banners };
}

export function bannerDay(cal: ReturnType<typeof versionCalendar>, banner: string | null): number | null {
  if (!cal || !banner) return null;
  const key = banner.split(" · ")[0].trim();
  return cal.banners.find((b) => b.key === key)?.day ?? null;
}

export type PlanArgs = {
  game: Game; account: GameAccount; builds: FarmBuild[]; characters: Character[]; inventory: FarmInventoryRow[]; log: FarmDay[]; versions: GameVersion[]; events?: FarmEvent[]; now?: Date;
};

const overflowFn = (events: FarmEvent[]) => (abs: number) => {
  const e = events.find((x) => abs >= parseDay(x.starts_on) && abs <= parseDay(x.ends_on));
  return e ? (e.kind === "overflow_artifacts" ? "artifacts" : e.kind === "overflow_ley" ? "ley" : "domain") : null;
};
const claimsOf = (log: FarmDay[]): Claim[] => log.filter((l) => Number(l.runs?.weekly ?? 0) > 0).map((l) => ({ day: parseDay(l.day), boss: String(l.runs.weekly_boss ?? ""), cost: Number(l.runs.weekly_cost ?? 30), n: Number(l.runs.weekly) }));

export function planAccount(args: PlanArgs): AccountPlan {
  const { game, account, builds, characters, inventory, log, versions } = args;
  const mod: AnyModule = moduleFor(game.id) ?? (() => { throw new Error(`No planner for ${game.id}`); })();
  const now = args.now ?? new Date();
  const acc = (account.settings ?? {}) as Record<string, unknown>;
  const s = mod.settings(acc, game.stamina_per_day);
  const today = gameToday(account.server, now);
  const charById = new Map(characters.map((c) => [c.id, c]));
  const cal = versionCalendar(versions, game.id);

  // plan start / carry from the log (sheet: Calc H / I)
  const logDays = log.map((l) => parseDay(l.day));
  const lastLogged = log.filter((l) => l.status !== "skipped" || parseDay(l.day) <= today).reduce((m, l) => Math.max(m, parseDay(l.day)), 0);
  const start = lastLogged > 0 && lastLogged >= today - 3 ? lastLogged + 1 : today;
  const carry = s.cap > 0 ? Number(log.find((l) => parseDay(l.day) === start - 1)?.stamina_left ?? 0) : 0;
  const invCounted = Date.parse(String(acc.inv_counted_at ?? "")) || 0;

  // stygian week (Genshin): 8 days after each version start, 7 days long, every cycle
  let stygian: [number, number] | null = null;
  if (cal && mod.id === "genshin") {
    let st = cal.anchor + 8;
    while (st + 7 <= today) st += cal.length;
    stygian = [st, 7];
  }
  const blocked = (abs: number) => !!(mod.usesStygian(s) && stygian && ((((abs - stygian[0]) % cal!.length) + cal!.length) % cal!.length) < stygian[1]);

  // builds in plan order
  const active = builds.filter((b) => !b.done && charById.has(b.character_id));
  const withDl = active.map((b) => {
    const dl = b.deadline ? parseDay(b.deadline) : null, bd = bannerDay(cal, b.banner);
    const deadline = dl !== null && bd !== null ? Math.min(dl, bd) : dl ?? bd;
    const pr = Number.isFinite(b.priority) ? b.priority : 999;
    const order = s.order === "deadline" ? (deadline ?? 99999) + pr / 1000 : pr;
    return { build: b, deadline, order };
  }).sort((a, b) => a.order - b.order || a.build.created_at.localeCompare(b.build.created_at));

  const needsRows = withDl.map((x) => ({ build: x.build, needs: mod.needs(x.build, charById.get(x.build.character_id)!, s) }));
  const shorts = mod.allocate(needsRows, inventory, s);
  const ctx = { characters, today };
  const rows: PlanRow[] = withDl.map((x, i) => {
    const ch = charById.get(x.build.character_id)!, needs = needsRows[i].needs, short = shorts.get(x.build.id)!;
    const since = Math.max(invCounted, Date.parse(x.build.counted_at) || 0);
    const runs = mod.runs(short, needs, s, log.filter((l) => l.character === ch.name), since);
    return { build: x.build, ch, needs, short, runs, resin: mod.stamina(runs), deadline: x.deadline, status: null, order: x.order };
  });

  const chars: PlanChar[] = rows.map((r) => mod.planChar(r.build, r.ch, r.needs, r.runs, r.deadline === null ? null : r.deadline - start, r.order, ctx));
  const opt: SimOpts = {
    start, perDay: s.staminaPerDay, extraWeek: s.extraWeek, cap: s.cap, carry, ...mod.simOpts(s),
    claims: claimsOf(log), seen: logDays, skip: new Set(log.filter((l) => l.status === "skipped").map((l) => parseDay(l.day))),
    offDow: daysOffFlags(s.daysOff), blocked, staminaName: game.stamina_name.toLowerCase(),
    overflow: mod.usesOverflow(s) ? overflowFn(args.events ?? []) : undefined,
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
    gameId: game.id, settings: s, today, start, carry, rows, days: sim.days, day0: sim.day0, left0: sim.left0,
    todayText, todayLogged, todaySkipped, notTicked,
    resinTotal: rows.reduce((a, r) => a + r.resin, 0),
    doneBy: finishes.some((f) => f === null) ? null : finishes.length ? Math.max(...(finishes as number[])) : null,
    deadlinesMissed: rows.filter((r) => r.status?.status.startsWith("■")).length,
    deadlines: rows.filter((r) => r.deadline !== null).length,
    stygian,
  };
}

/** What logging "Done" for one day writes: a row per build that farmed something (or one "(nothing farmed)" row). */
export function dayRowsFor(args: PlanArgs, day: number) {
  // re-simulate from that day with the log minus that day's rows (like the sheet's toggleDay_)
  const log = args.log.filter((l) => parseDay(l.day) !== day);
  const base = planAccount({ ...args, log });
  const mod = moduleFor(args.game.id)!;
  const s = base.settings;
  const carry = s.cap > 0 ? Number(log.find((l) => parseDay(l.day) === day - 1)?.stamina_left ?? 0) : 0;
  const ctx = { characters: args.characters, today: base.today };
  const chars: PlanChar[] = base.rows.map((r) => mod.planChar(r.build, r.ch, r.needs, r.runs, r.deadline === null ? null : r.deadline - day, r.order, ctx));
  const sim = simulate(chars, {
    start: day, perDay: s.staminaPerDay, extraWeek: s.extraWeek, cap: s.cap, carry, ...mod.simOpts(s),
    claims: claimsOf(log), seen: log.map((l) => parseDay(l.day)), skip: new Set(), offDow: daysOffFlags(s.daysOff), blocked: () => false, staminaName: args.game.stamina_name.toLowerCase(),
    overflow: mod.usesOverflow(s) ? overflowFn(args.events ?? []) : undefined,
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
