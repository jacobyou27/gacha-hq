/**
 * Day-by-day stamina scheduler — a port of the sheets' RESINPLAN / TPPLAN simulate_().
 *
 * Every game feeds the same model: per build a weekly-boss bucket plus ordered run
 * buckets (domains with weekday rules, bosses, ley lines / calyxes …). Each day the
 * weekly claims are taken first for everyone (they can't be saved up), then every
 * build in plan order fills its buckets while stamina lasts.
 *
 * Days are integers: days since the Unix epoch (UTC), so weekday = (day + 4) % 7 (0 = Sunday).
 */

export type Bucket = {
  key: string; // e.g. "book", "wpn", "boss", "wit", "mora" — the run kind written to the log
  label: string; // "Justice ×6" uses this as the name
  cost: number;
  rem: number; // runs still to do
  days?: readonly number[]; // weekdays (0 = Sun) when this bucket is farmable; undefined = every day
  lockedUntil?: number; // absolute day the material becomes farmable (unreleased character)
};

export type PlanChar = {
  id: string; // build id
  name: string;
  order: number;
  deadline: number | null; // absolute day
  weekly: { rem: number; boss: string } | null;
  buckets: Bucket[];
};

export type WeeklyRule = {
  perWeek: number; // discounted / free claims per week (3)
  cost: number; // stamina per discounted claim (30 Genshin / HSR, 0 ZZZ)
  extraCost: number | null; // beyond perWeek: 60 (Genshin) or null = not possible
  oncePerBoss: boolean; // Genshin: each boss once per week; HSR / ZZZ: repeats allowed
};

export type Claim = { day: number; boss: string; cost: number; n: number };

export type SimOpts = {
  start: number;
  perDay: number;
  extraWeek: number; // added every Monday
  fuel: number; // one-off reserve (fragile resin × 60, fuel + reserved TP …), spent only when needed
  cap: number; // stamina that may carry over to the next day (0 = leftovers are lost)
  carry: number; // stamina banked at the start of day 0
  allowExtraWeekly: boolean; // Genshin "Allow 60-resin weekly bosses"
  monBoss: boolean; // Genshin "Mondays: weekly bosses only" (weeklies only; the rest of Monday's stamina is lost)
  weeklyDow: number; // -1 any day; else JS weekday (1 = Monday) the weeklies wait for (then any later farming day that week)
  weekly: WeeklyRule;
  claims: Claim[]; // weekly claims already logged (only the current week matters)
  seen: number[]; // days already logged (so an unlogged earlier day of this week means "claims used up")
  skip: Set<number>; // absolute days ticked Skip
  offDow: boolean[]; // 7 flags, index = JS weekday
  blocked: (absDay: number) => boolean; // e.g. Stygian week
  lostLabel: string; // "resin → artifacts"
  staminaName: string;
  maxDays?: number;
  /** double-drop event on this day: 3 doubled runs for 60 stamina (artifacts = just the reservation) */
  overflow?: (absDay: number) => "artifacts" | "ley" | "domain" | null;
  overflowRuns?: number; // 3
  overflowCost?: number; // per run (20)
};

export type DayRow = { d: number; abs: number; spent: number; left: number; text: string; off: boolean };
export type Day0Row = { id: string; name: string; weekly: number; weeklyBoss: string; weeklyCost: number; runs: Record<string, number>; text: string };
export type SimResult = { days: DayRow[]; finish: Map<string, number | null>; day0: Day0Row[]; left0: number };

export const DOW_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const dayNum = (d: Date) => Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 864e5);
export const isoDay = (n: number) => new Date(n * 864e5).toISOString().slice(0, 10);
export const parseDay = (s: string) => Math.round(Date.parse(s.slice(0, 10) + "T00:00:00Z") / 864e5);
export const dow = (abs: number) => (((abs + 4) % 7) + 7) % 7;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Thu 29 Oct" */
export const fmtDay = (abs: number | null) => { if (abs === null) return "—"; const d = new Date(abs * 864e5); return `${DOW_NAMES[dow(abs)]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };

function clone(list: PlanChar[]): PlanChar[] {
  return list.map((c) => ({ ...c, weekly: c.weekly ? { ...c.weekly } : null, buckets: c.buckets.map((b) => ({ ...b })) }));
}
const done = (c: PlanChar) => (c.weekly?.rem ?? 0) + c.buckets.reduce((s, b) => s + b.rem, 0) === 0;

export function simulate(charsIn: PlanChar[], opt: SimOpts, wantText: boolean): SimResult {
  const chars = clone(charsIn).sort((a, b) => a.order - b.order);
  const finish = new Map<string, number | null>();
  chars.forEach((c) => finish.set(c.id, done(c) ? 0 : null));
  const days: DayRow[] = [];
  const W = opt.weekly;
  let pool = 0;
  let fuel = opt.fuel;
  let weeklyLeft = W.perWeek;
  let claimed: Record<string, true> = {};
  const wk0 = opt.start - ((dow(opt.start) + 6) % 7); // Monday of the first week
  for (const k of opt.claims) {
    if (k.day >= wk0 && k.day < opt.start) {
      if (W.oncePerBoss) claimed[k.boss] = true;
      if (k.cost === W.cost || W.cost === 0) weeklyLeft -= k.n || 1;
    }
  }
  // mid-week start with earlier days of this week not logged (and not days off): assume this week's claims are used
  if (!W.oncePerBoss) {
    const seen = new Set(opt.seen);
    for (let q = wk0; q < opt.start; q++) if (!seen.has(q) && !opt.offDow[dow(q)]) { weeklyLeft = 0; break; }
  }
  // "Mondays: weekly bosses only": weeklies are planned on Mondays only; a mid-week start assumes this week's were done Monday
  if (opt.monBoss && dow(opt.start) !== 1) weeklyLeft = 0;
  if (weeklyLeft < 0) weeklyLeft = 0;

  let day0: Day0Row[] = [];
  let left0 = 0;
  const maxDays = opt.maxDays ?? 730;
  for (let d = 0; d < maxDays; d++) {
    if (chars.every((c) => finish.get(c.id) !== null)) break;
    const abs = opt.start + d;
    const w = dow(abs);
    if (w === 1 && d > 0) { weeklyLeft = W.perWeek; claimed = {}; }
    if (d === 0) pool = opt.carry || 0;
    if (w === 1) pool += opt.extraWeek;
    pool += opt.perDay;
    let spent = 0;
    const parts: string[] = [];
    const avail = () => pool + fuel;
    const spend = (n: number) => { spent += n; const a = Math.min(pool, n); pool -= a; fuel -= n - a; };
    const before = d === 0 ? chars.map((c) => ({ weekly: c.weekly?.rem ?? 0, runs: Object.fromEntries(c.buckets.map((b) => [b.key, b.rem])) })) : null;
    const wkCost: Record<string, number> = {};
    const acts: Record<string, string[]> = {};

    const isSkip = opt.skip.has(abs), isOff = opt.offDow[w], isBlocked = opt.blocked(abs);
    if (isSkip || isOff || isBlocked) {
      const gone = Math.max(0, pool - opt.cap);
      pool = Math.min(pool, opt.cap);
      if (d === 0) { left0 = Math.round(pool); day0 = chars.map((c) => ({ id: c.id, name: c.name, weekly: 0, weeklyBoss: c.weekly?.boss ?? "", weeklyCost: 0, runs: {}, text: "" })); }
      if (wantText) days.push({ d, abs, spent: 0, left: Math.round(pool + fuel), off: true, text: `${isSkip ? "Skipped" : isOff ? "Day off" : "Stygian week"} — no farming${gone > 0.5 ? ` · ${Math.round(gone)} ${opt.lostLabel}` : ""}` });
      continue;
    }
    const bossDay = opt.monBoss && w === 1;
    const weeklyOk = opt.monBoss ? w === 1 : opt.weeklyDow < 0 || (w + 6) % 7 >= (opt.weeklyDow + 6) % 7;
    // 1) weekly bosses for everyone first
    if (weeklyOk) {
      for (const c of chars) {
        if (finish.get(c.id) !== null || !c.weekly || c.weekly.rem <= 0) continue;
        if (W.oncePerBoss) {
          if (claimed[c.weekly.boss]) continue;
          const cost = weeklyLeft > 0 ? W.cost : (opt.allowExtraWeekly || bossDay) && W.extraCost !== null ? W.extraCost : -1;
          if (cost >= 0 && avail() >= cost) {
            spend(cost); if (cost === W.cost) weeklyLeft--; claimed[c.weekly.boss] = true; c.weekly.rem--;
            acts[c.id] = [`${c.weekly.boss} weekly`]; wkCost[c.id] = cost;
          }
        } else {
          const n = Math.min(c.weekly.rem, weeklyLeft, W.cost > 0 ? Math.floor(avail() / W.cost) : 999);
          if (n > 0) { spend(n * W.cost); weeklyLeft -= n; c.weekly.rem -= n; acts[c.id] = [`${c.weekly.boss || "weekly"} ×${n}`]; wkCost[c.id] = n * W.cost; }
        }
      }
    }
    // 1b) overflow week: 3 doubled runs a day (60 stamina) — domains / ley lines count double, artifacts are just spent
    const ov = !bossDay && opt.overflow ? opt.overflow(abs) : null;
    if (ov) {
      const nRuns = opt.overflowRuns ?? 3, cost = opt.overflowCost ?? 20;
      let left = nRuns;
      if (ov !== "artifacts") {
        for (const c of chars) {
          if (left <= 0 || finish.get(c.id) !== null) continue;
          for (const b of c.buckets) {
            if (left <= 0 || b.rem <= 0) continue;
            const ok = ov === "ley" ? b.key === "wit" || b.key === "mora" : b.key === "book" || b.key === "wpn";
            if (!ok || (b.days && w !== 0 && !b.days.includes(w)) || (b.lockedUntil !== undefined && abs < b.lockedUntil)) continue;
            const n = Math.min(left, Math.ceil(b.rem / 2), Math.floor(avail() / cost));
            if (n > 0) { spend(n * cost); b.rem = Math.max(0, b.rem - 2 * n); left -= n; (acts[c.id] ??= []).push(`${b.label} ×${n} (doubled)`); }
          }
        }
      }
      if (left > 0 && avail() >= left * cost) { spend(left * cost); parts.push(`Overflow ${ov === "artifacts" ? "artifacts" : ov === "ley" ? "ley lines" : "domains"} ×${left} (${left * cost} ${opt.staminaName})`); }
    }
    // 2) everything else in plan order (nothing on a boss Monday)
    for (const c of chars) {
      if (finish.get(c.id) !== null) continue;
      const a = acts[c.id] ?? [];
      if (!bossDay) {
        for (const b of c.buckets) {
          if (b.rem <= 0) continue;
          if (b.days && w !== 0 && !b.days.includes(w)) continue;
          if (b.lockedUntil !== undefined && abs < b.lockedUntil) continue;
          const n = Math.min(b.rem, Math.floor(avail() / b.cost));
          if (n > 0) { spend(n * b.cost); b.rem -= n; a.push(`${b.label} ×${n}`); }
        }
      }
      if (a.length) { acts[c.id] = a; parts.push(`${c.name}: ${a.join(", ")}`); }
      if (done(c)) finish.set(c.id, d);
    }
    if (bossDay && pool > 0) { parts.push(`${Math.round(pool)} ${opt.staminaName} unused (boss Monday, lost)`); pool = 0; }
    const over = pool - opt.cap;
    if (over > 0.5) { parts.push(`${Math.round(over)} ${opt.lostLabel}`); pool = opt.cap; }
    if (d === 0 && before) {
      left0 = Math.round(pool);
      day0 = chars.map((c, j) => {
        const runs: Record<string, number> = {};
        c.buckets.forEach((b) => { const n = before[j].runs[b.key] - b.rem; if (n > 0) runs[b.key] = (runs[b.key] ?? 0) + n; });
        return { id: c.id, name: c.name, weekly: before[j].weekly - (c.weekly?.rem ?? 0), weeklyBoss: c.weekly?.boss ?? "", weeklyCost: wkCost[c.id] ?? 0, runs, text: acts[c.id] ? `${c.name}: ${acts[c.id].join(", ")}` : "" };
      });
    }
    if (wantText) days.push({ d, abs, spent, left: Math.round(pool + fuel), off: false, text: parts.length ? parts.join(" · ") : `Nothing farmable today (bank ${opt.staminaName})` });
  }
  return { days, finish, day0, left0 };
}

export type Status = { finish: number | null; soonest: number | null; status: string; late: number | null };

/** Finish / soonest / status per build (soonest = if this build got all the stamina). */
export function summary(chars: PlanChar[], opt: SimOpts): Map<string, Status> {
  const all = simulate(chars, { ...opt }, false);
  const out = new Map<string, Status>();
  for (const c of chars) {
    const fin = all.finish.get(c.id) ?? null;
    const soon = simulate([c], opt, false).finish.get(c.id) ?? null;
    let status: string, late: number | null = null;
    if (fin === null) status = "■ Not reachable in 2 years";
    else if (c.deadline === null) status = "● Planned";
    else if (fin <= c.deadline) status = c.deadline - fin >= 3 ? "● On track" : "▲ Tight";
    else { late = fin - c.deadline; status = soon !== null && soon <= c.deadline ? `■ Late +${late}d (move up)` : `■ Impossible (+${late}d)`; }
    out.set(c.id, { finish: fin === null ? null : opt.start + fin, soonest: soon === null ? null : opt.start + soon, status, late });
  }
  return out;
}
