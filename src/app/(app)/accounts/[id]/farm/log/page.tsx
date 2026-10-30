import { loadFarm } from "@/lib/farm/load";
import { fmtDay, parseDay } from "@/lib/farm/schedule";
import { deleteDay, logDay, saveDrops } from "../actions";
import { DayButtons, FarmNav } from "../ui";
import { GENSHIN_LOG } from "../genshin";
import { HSR_LOG } from "../hsr";
import { ZZZ_LOG } from "../zzz";

export default async function LogPage({ params, searchParams }: PageProps<"/accounts/[id]/farm/log">) {
  const { id } = await params;
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;
  const { account, game, log, canEdit, plan } = await loadFarm(id);
  const editing = typeof sp.drops === "string" ? sp.drops : null;
  const r = (l: (typeof log)[number], k: string) => Number(l.runs?.[k] ?? 0) || 0;
  const L = game.id === "genshin" ? GENSHIN_LOG : game.id === "zzz" ? ZZZ_LOG : HSR_LOG;
  return (
    <div className="flex flex-col gap-4">
      <FarmNav id={id} game={game} account={account} active="log" />
      {error && <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">{error}</p>}
      <p className="text-sm text-neutral-600">Every Done / Skip becomes rows here (newest first). Optional: type what you actually got on a row — the planner then counts those drops instead of average ones. Runs logged before the last inventory count (or a change to that build&apos;s current levels) are not subtracted twice.</p>
      {canEdit && (
        <form action={logDay} className="card flex flex-wrap items-end gap-2 text-sm">
          <input type="hidden" name="account_id" value={id} /><input type="hidden" name="return" value="/log" />
          <label className="label">Log a past day<input className="input" type="date" name="day" required /></label>
          <button className="btn" type="submit" name="mode" value="done">Done (planned runs)</button>
          <button className="btn-secondary" type="submit" name="mode" value="skip">Skip</button>
        </form>
      )}
      <table className="table text-sm">
        <thead><tr><th>Day</th><th>Character</th><th>Weekly</th>{L.cols.map(([k, lab]) => <th key={k}>{lab}</th>)}<th>Left</th><th>What</th><th>Real drops</th>{canEdit && <th></th>}</tr></thead>
        <tbody>
          {log.map((l) => (
            <tr key={l.id} className={l.status === "skipped" ? "text-neutral-500" : parseDay(l.day) === plan.today ? "bg-blue-50" : ""}>
              <td className="whitespace-nowrap">{fmtDay(parseDay(l.day))}</td>
              <td>{l.character}</td>
              <td>{r(l, "weekly") ? `${l.runs.weekly_boss}${game.id === "genshin" ? ` (${l.runs.weekly_cost})` : ` ×${r(l, "weekly")}${game.id === "zzz" && Number(l.runs.weekly_cost) > 0 ? ` (${l.runs.weekly_cost} paid)` : ""}`}` : ""}</td>
              {L.cols.map(([k]) => <td key={k}>{r(l, k) || ""}</td>)}
              <td>{l.stamina_left}</td>
              <td className="max-w-md">{l.text}</td>
              <td>
                {editing === l.id && canEdit ? (
                  <form action={saveDrops} className="flex flex-wrap gap-1">
                    <input type="hidden" name="account_id" value={id} /><input type="hidden" name="day_id" value={l.id} />
                    {L.drops.map(([k, lab]) => (
                      <label key={k} className="text-xs">{lab}<input className="input w-14" name={k} defaultValue={l.drops?.[k] ?? ""} /></label>
                    ))}
                    <button className="btn" type="submit">Save</button>
                  </form>
                ) : (
                  <span className="text-xs">{Object.entries(l.drops ?? {}).map(([k, v]) => `${k} ${v}`).join(", ")}{canEdit && l.status === "done" && l.build_id && <a className="ml-1 underline" href={`/accounts/${id}/farm/log?drops=${l.id}`}>edit</a>}</span>
                )}
              </td>
              {canEdit && <td><form action={deleteDay}><input type="hidden" name="account_id" value={id} /><input type="hidden" name="day_id" value={l.id} /><button className="btn-secondary" type="submit">✕</button></form></td>}
            </tr>
          ))}
          {log.length === 0 && <tr><td colSpan={8 + L.cols.length} className="text-neutral-500">Nothing logged yet.</td></tr>}
        </tbody>
      </table>
      {canEdit && <div className="text-xs text-neutral-500">Today: <DayButtons id={id} day={new Date(plan.today * 864e5).toISOString().slice(0, 10)} logged={plan.todayLogged.length > 0 && !plan.todaySkipped} skipped={plan.todaySkipped} action={logDay} returnTo="/log" /></div>}
    </div>
  );
}
