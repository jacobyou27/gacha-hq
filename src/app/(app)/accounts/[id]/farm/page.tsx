import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { farmSettings, schedule } from "@/lib/farm";
import type { AccountCharacter, Character, FarmGoal, FarmLogEntry, Game, GameAccount } from "@/lib/types";
import { addGoal, addLog, deleteGoal, deleteLog, saveFarmSettings, updateGoal } from "./actions";

type Row = AccountCharacter & { character: Character };
type Goal = FarmGoal & { character: Character | null };

// Rough full-build stamina per game, measured with the sheet planners (one character
// 1→max, all talents, signature weapon). Presets are fractions of that.
const FULL_BUILD: Record<string, number> = { genshin: 6000, hsr: 5900, zzz: 15700, wuwa: 8100 };
const PRESETS = [
  { key: "full", label: "Full build (level + talents + weapon)", f: 1 },
  { key: "level", label: "Level to max (ascension + EXP + credits)", f: 0.4 },
  { key: "talents", label: "Talents / traces / skills", f: 0.35 },
  { key: "weapon", label: "Weapon / light cone / W-engine", f: 0.25 },
];

export default async function FarmPage({ params, searchParams }: PageProps<"/accounts/[id]/farm">) {
  const { id } = await params;
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;
  const supabase = await createClient();

  const { data: account } = await supabase.from("game_accounts").select("*").eq("id", id).maybeSingle<GameAccount>();
  if (!account) notFound();
  const [{ data: game }, { data: goals }, { data: log }, { data: rows }] = await Promise.all([
    supabase.from("games").select("*").eq("id", account.game_id).single<Game>(),
    supabase.from("farm_goals").select("*, character:characters(*)").eq("account_id", id).order("done").order("priority").returns<Goal[]>(),
    supabase.from("farm_log").select("*").eq("account_id", id).order("day", { ascending: false }).limit(60).returns<FarmLogEntry[]>(),
    supabase.from("account_characters").select("*, character:characters(*)").eq("account_id", id).eq("owned", true).returns<Row[]>(),
  ]);
  if (!game) notFound();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: me } = await supabase.from("account_members").select("role").eq("account_id", id).eq("user_id", user!.id).maybeSingle<{ role: string }>();
  const canEdit = account.user_id === user!.id || me?.role === "editor";

  const now = new Date();
  const s = farmSettings(account, game);
  const sched = schedule(goals ?? [], s, now);
  const etaOf = new Map(sched.map((x) => [x.goalId, x]));
  const openStamina = (goals ?? []).filter((g) => !g.done).reduce((a, g) => a + Math.max(0, g.stamina_needed - g.stamina_done), 0);
  const last7 = (log ?? []).filter((l) => now.getTime() - new Date(l.day).getTime() < 7 * 86400e3).reduce((a, l) => a + l.stamina, 0);
  const today = now.toISOString().slice(0, 10);
  const base = FULL_BUILD[game.id] ?? 6000;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/accounts/${id}`} className="text-sm underline">← {game.name} · {account.name}</Link>
        <h1 className="text-xl font-semibold">{game.stamina_name} planner · {account.name}</h1>
        <p className="text-sm text-neutral-600">
          Goals are farmed in priority order at {s.staminaPerDay} {game.stamina_name}/day{s.daysOff.size ? ` (skipping ${[...s.daysOff].length} day(s) a week)` : ""}
          {s.fuel ? `, plus ${s.fuel} fuel × ${s.fuelValue}` : ""}. Log what you spend each day and the ETAs update.
        </p>
      </div>
      {error && <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-4 text-sm">
        <div className="card"><div className="text-xs text-neutral-500">Open {game.stamina_name}</div><div className="text-lg">{openStamina.toLocaleString()}</div></div>
        <div className="card"><div className="text-xs text-neutral-500">≈ days at current rate</div><div className="text-lg">{s.staminaPerDay ? Math.ceil(openStamina / s.staminaPerDay) : "—"}</div></div>
        <div className="card"><div className="text-xs text-neutral-500">Spent last 7 days</div><div className="text-lg">{last7.toLocaleString()}</div></div>
        <div className="card"><div className="text-xs text-neutral-500">Everything done by</div><div className="text-lg">{sched.filter((x) => x.finishOn).at(-1)?.finishOn ?? "—"}</div></div>
      </div>

      {/* settings */}
      <form action={saveFarmSettings} className="card grid gap-3 text-sm sm:grid-cols-6">
        <input type="hidden" name="account_id" value={id} />
        <label className="label">{game.stamina_name} / day<input className="input" type="number" name="stamina_per_day" defaultValue={s.staminaPerDay} disabled={!canEdit} /></label>
        <label className="label">Fuel items (fragile / reserve)<input className="input" type="number" name="fuel" defaultValue={s.fuel} disabled={!canEdit} /></label>
        <label className="label">Stamina per fuel<input className="input" type="number" name="fuel_value" defaultValue={s.fuelValue} disabled={!canEdit} /></label>
        <label className="label">Days off (e.g. “Sat, Sun”)<input className="input" name="days_off" defaultValue={String((account.settings as Record<string, unknown>)?.days_off ?? "")} disabled={!canEdit} /></label>
        <label className="label">Bank cap (carry-over)<input className="input" type="number" name="bank_cap" defaultValue={s.bankCap} disabled={!canEdit} /></label>
        {canEdit && <div className="self-end"><button className="btn" type="submit">Save settings</button></div>}
      </form>

      {/* goals */}
      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Goals</h2>
        <table className="table">
          <thead><tr><th>Prio</th><th>Goal</th><th>Needed</th><th>Done</th><th>Left</th><th>ETA</th><th>Notes</th><th>✓</th>{canEdit && <th></th>}</tr></thead>
          <tbody>
            {(goals ?? []).map((g) => {
              const eta = etaOf.get(g.id);
              const left = Math.max(0, g.stamina_needed - g.stamina_done);
              return (
                <tr key={g.id} className={g.done ? "text-neutral-400" : ""}>
                  <td>
                    <form action={updateGoal} id={`g-${g.id}`} className="contents"><input type="hidden" name="account_id" value={id} /><input type="hidden" name="goal_id" value={g.id} /></form>
                    {canEdit ? <input form={`g-${g.id}`} className="input w-14" type="number" name="priority" defaultValue={g.priority} /> : g.priority}
                  </td>
                  <td>{g.character?.name ?? g.label}</td>
                  <td>{canEdit ? <input form={`g-${g.id}`} className="input w-24" type="number" name="stamina_needed" defaultValue={g.stamina_needed} /> : g.stamina_needed}</td>
                  <td>{g.stamina_done}</td>
                  <td>{left}</td>
                  <td>{g.done ? "done" : eta?.finishOn ? `${eta.finishOn} (${eta.daysFromNow}d)` : "—"}</td>
                  <td>{canEdit ? <input form={`g-${g.id}`} className="input" name="notes" defaultValue={g.notes ?? ""} /> : g.notes}</td>
                  <td>{canEdit ? <input form={`g-${g.id}`} type="checkbox" name="done" defaultChecked={g.done} /> : g.done ? "✓" : ""}</td>
                  {canEdit && (
                    <td className="whitespace-nowrap">
                      <button form={`g-${g.id}`} className="btn" type="submit">Save</button>{" "}
                      <form action={deleteGoal} className="inline"><input type="hidden" name="account_id" value={id} /><input type="hidden" name="goal_id" value={g.id} /><button className="btn-secondary" type="submit">✕</button></form>
                    </td>
                  )}
                </tr>
              );
            })}
            {(goals ?? []).length === 0 && <tr><td colSpan={9} className="text-neutral-500">No goals yet.</td></tr>}
          </tbody>
        </table>

        {canEdit && (
          <form action={addGoal} className="card flex flex-wrap items-end gap-2 text-sm">
            <input type="hidden" name="account_id" value={id} />
            <label className="label">Character (owned)
              <select className="input" name="character_id" defaultValue="">
                <option value="">— none / free text —</option>
                {(rows ?? []).map((r) => <option key={r.character.id} value={r.character.id}>{r.character.name}</option>)}
              </select>
            </label>
            <label className="label">or label<input className="input" name="label" placeholder="artifacts, weekly bosses…" /></label>
            <label className="label">{game.stamina_name} needed<input className="input w-28" type="number" name="stamina_needed" required /></label>
            <label className="label">priority<input className="input w-20" type="number" name="priority" defaultValue={(goals ?? []).length + 1} /></label>
            <label className="label">notes<input className="input" name="notes" /></label>
            <button className="btn" type="submit">Add goal</button>
            <p className="w-full text-xs text-neutral-500">
              Rough presets for one {game.name} character: {PRESETS.map((p) => `${p.label.split(" (")[0]} ≈ ${Math.round(base * p.f).toLocaleString()}`).join(" · ")}. Measured with the sheet planners; adjust after your first few days.
            </p>
          </form>
        )}
      </section>

      {/* log */}
      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Daily log</h2>
        {canEdit && (
          <form action={addLog} className="card flex flex-wrap items-end gap-2 text-sm">
            <input type="hidden" name="account_id" value={id} />
            <label className="label">Day<input className="input" type="date" name="day" defaultValue={today} /></label>
            <label className="label">Goal
              <select className="input" name="goal_id" defaultValue={(goals ?? []).find((g) => !g.done)?.id ?? ""}>
                <option value="">(unassigned)</option>
                {(goals ?? []).filter((g) => !g.done).map((g) => <option key={g.id} value={g.id}>{g.character?.name ?? g.label}</option>)}
              </select>
            </label>
            <label className="label">{game.stamina_name} spent<input className="input w-28" type="number" name="stamina" defaultValue={s.staminaPerDay} required /></label>
            <label className="label">note<input className="input" name="note" /></label>
            <button className="btn" type="submit">Log</button>
          </form>
        )}
        <table className="table">
          <thead><tr><th>Day</th><th>Goal</th><th>{game.stamina_name}</th><th>Note</th>{canEdit && <th></th>}</tr></thead>
          <tbody>
            {(log ?? []).map((l) => (
              <tr key={l.id}>
                <td>{l.day}</td>
                <td>{(goals ?? []).find((g) => g.id === l.goal_id)?.character?.name ?? (goals ?? []).find((g) => g.id === l.goal_id)?.label ?? ""}</td>
                <td>{l.stamina}</td>
                <td>{l.note ?? ""}</td>
                {canEdit && <td><form action={deleteLog}><input type="hidden" name="account_id" value={id} /><input type="hidden" name="log_id" value={l.id} /><button className="btn-secondary" type="submit">✕</button></form></td>}
              </tr>
            ))}
            {(log ?? []).length === 0 && <tr><td colSpan={5} className="text-neutral-500">Nothing logged yet.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
