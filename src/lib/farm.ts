import type { FarmGoal, Game, GameAccount } from "./types";

export type FarmSettings = {
  staminaPerDay: number;
  fuel: number; // fragile resin / fuel / backup battery items
  fuelValue: number; // stamina per fuel item
  daysOff: Set<number>; // 0 = Sunday … 6 = Saturday
  bankCap: number; // stamina that carries over to the next day (0 = lost)
};

const DOW: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

export function farmSettings(account: GameAccount, game: Game): FarmSettings {
  const s = (account.settings ?? {}) as Record<string, unknown>;
  const daysOff = new Set<number>();
  const txt = String(s.days_off ?? "").toLowerCase();
  if (/weekend/.test(txt)) { daysOff.add(0); daysOff.add(6); }
  if (/weekday/.test(txt)) [1, 2, 3, 4, 5].forEach((d) => daysOff.add(d));
  for (const m of txt.matchAll(/\b(sun|mon|tue|wed|thu|fri|sat)/g)) daysOff.add(DOW[m[1]]);
  return {
    staminaPerDay: Number(s.stamina_per_day ?? game.stamina_per_day),
    fuel: Number(s.fuel ?? 0),
    fuelValue: Number(s.fuel_value ?? 60),
    daysOff,
    bankCap: Number(s.bank_cap ?? 0),
  };
}

export type Schedule = { goalId: string; finishOn: string | null; daysFromNow: number | null; remaining: number }[];

/**
 * Walks day by day from today: each farming day yields staminaPerDay (plus the fuel
 * reserve on day 1), applied to open goals in priority order. Returns the finish
 * date of each goal. Leftover stamina above bankCap is lost at day end.
 */
export function schedule(goals: FarmGoal[], s: FarmSettings, from = new Date()): Schedule {
  const open = goals
    .filter((g) => !g.done && g.stamina_needed - g.stamina_done > 0)
    .sort((a, b) => a.priority - b.priority)
    .map((g) => ({ goalId: g.id, remaining: g.stamina_needed - g.stamina_done }));
  const out: Schedule = [];
  if (s.staminaPerDay <= 0) return open.map((o) => ({ ...o, finishOn: null, daysFromNow: null }));

  let bank = s.fuel * s.fuelValue;
  const day = new Date(from);
  day.setHours(0, 0, 0, 0);
  for (let d = 0; d < 1000 && open.length; d++) {
    let budget = s.daysOff.has(day.getDay()) ? bank : bank + s.staminaPerDay;
    while (open.length && budget >= open[0].remaining && open[0].remaining > 0) {
      budget -= open[0].remaining;
      out.push({ ...open.shift()!, remaining: 0, finishOn: day.toISOString().slice(0, 10), daysFromNow: d });
    }
    if (open.length && budget > 0) {
      open[0].remaining -= budget;
      budget = 0;
    }
    bank = Math.min(budget, s.bankCap);
    day.setDate(day.getDate() + 1);
  }
  for (const o of open) out.push({ ...o, finishOn: null, daysFromNow: null });
  return out;
}
