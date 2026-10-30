import Link from "next/link";
import { loadFarm } from "@/lib/farm/load";
import { fmtDay, isoDay, parseDay } from "@/lib/farm/schedule";
import { versionCalendar } from "@/lib/farm/plan";
import { addEvent, deleteEvent, logDay, reopenBuild } from "./actions";
import { FarmNav, DayButtons } from "./ui";
import { GenshinBuilds, GenshinSettingsForm, type GenshinPlan } from "./genshin";
import { HsrBuilds, HsrSettingsForm, type HsrPlan } from "./hsr";

const n0 = (x: number) => Math.round(x).toLocaleString();

export default async function FarmPage({ params, searchParams }: PageProps<"/accounts/[id]/farm">) {
  const { id } = await params;
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;
  const message = typeof sp.message === "string" ? sp.message : null;
  const { account, game, builds, characters, log, versions, events, canEdit, isAdmin, plan } = await loadFarm(id);
  const s = plan.settings;
  const cal = versionCalendar(versions, game.id);
  const banners = cal?.banners ?? [];
  const byDay = new Map<number, typeof log>();
  for (const l of log) { const d = parseDay(l.day); byDay.set(d, [...(byDay.get(d) ?? []), l]); }
  const daysList = [-2, -1, 0, 1, 2, 3].map((off) => plan.today + off);
  const schedByDay = new Map(plan.days.map((d) => [d.abs, d]));
  const isGenshin = game.id === "genshin";
  const stygianSkip = isGenshin && (plan as GenshinPlan).settings.stygianSkip;

  return (
    <div className="flex flex-col gap-6">
      <FarmNav id={id} game={game} account={account} active="builds" />
      {error && <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">{error}</p>}
      {message && <p className="rounded border border-green-300 bg-green-50 p-2 text-sm text-green-800">{message}</p>}

      <div className="grid gap-3 text-sm sm:grid-cols-4">
        <div className="card"><div className="text-xs text-neutral-500">{game.stamina_name} needed</div><div className="text-lg">{n0(plan.resinTotal)}</div></div>
        <div className="card"><div className="text-xs text-neutral-500">Days of {game.stamina_name}</div><div className="text-lg">{s.staminaPerDay ? Math.ceil(plan.resinTotal / s.staminaPerDay) : "—"}</div></div>
        <div className="card"><div className="text-xs text-neutral-500">Everything done by</div><div className="text-lg">{plan.rows.length ? fmtDay(plan.doneBy) : "—"}</div></div>
        <div className="card"><div className="text-xs text-neutral-500">Deadlines missed</div><div className="text-lg">{plan.deadlinesMissed} / {plan.deadlines}</div></div>
      </div>

      {/* today + days */}
      <section className="card flex flex-col gap-2 text-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-medium">Today · {fmtDay(plan.today)} <span className="font-normal text-neutral-500">({account.server ?? "America"} server day)</span></h2>
          {plan.notTicked > 0 && <span className="text-amber-700">⚠ {plan.notTicked} day{plan.notTicked > 1 ? "s" : ""} not ticked — tick them below or they drop out of the plan after 3 days</span>}
        </div>
        <table className="table">
          <tbody>
            {daysList.map((abs) => {
              const rows = byDay.get(abs) ?? [];
              const skipped = rows.some((l) => l.status === "skipped");
              const logged = rows.length > 0 && !skipped;
              const sched = schedByDay.get(abs);
              const text = skipped ? `✕ Skipped — ${game.stamina_name} spent elsewhere` : logged ? `✓ ${rows.map((l) => l.text).filter(Boolean).join(" · ")}` : sched ? sched.text : abs < plan.start ? "— not logged" : "Nothing planned";
              return (
                <tr key={abs} className={abs === plan.today ? "bg-blue-50 font-medium" : abs < plan.today && !rows.length ? "text-amber-700" : ""}>
                  <td className="whitespace-nowrap">{fmtDay(abs)}</td>
                  <td className="w-full">{text}</td>
                  <td className="whitespace-nowrap">{canEdit && <DayButtons id={id} day={isoDay(abs)} logged={logged} skipped={skipped} action={logDay} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-xs text-neutral-500">Done logs the planned runs for that day (so they stop being counted); Skip means the {game.stamina_name} went elsewhere. Plan starts {fmtDay(plan.start)}{plan.carry ? ` with ${plan.carry} banked` : ""}. {plan.stygian && stygianSkip ? `Stygian week ${fmtDay(plan.stygian[0])}–${fmtDay(plan.stygian[0] + 6)} is skipped.` : ""}</p>
      </section>

      {/* builds */}
      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Builds <span className="text-sm font-normal text-neutral-500">— in plan order; {game.stamina_name} after inventory and logged runs</span></h2>
        {isGenshin
          ? <GenshinBuilds id={id} plan={plan as GenshinPlan} banners={banners} canEdit={canEdit} characters={characters} staminaName={game.stamina_name} />
          : <HsrBuilds id={id} plan={plan as HsrPlan} banners={banners} canEdit={canEdit} characters={characters} staminaName={game.stamina_name} />}
        {builds.some((b) => b.done) && (
          <p className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">Done (not planned):
            {builds.filter((b) => b.done).map((b) => (
              <form key={b.id} action={reopenBuild} className="inline"><input type="hidden" name="account_id" value={id} /><input type="hidden" name="build_id" value={b.id} /><span>{characters.find((c) => c.id === b.character_id)?.name ?? "?"}</span> {canEdit && <button className="btn-secondary" type="submit">reopen</button>}</form>
            ))}
          </p>
        )}
      </section>

      {/* settings */}
      <details className="card text-sm" open={plan.rows.length === 0}>
        <summary className="cursor-pointer font-medium">Account settings</summary>
        {isGenshin
          ? <GenshinSettingsForm id={id} plan={plan as GenshinPlan} account={account} canEdit={canEdit} staminaName={game.stamina_name} staminaPerDay={game.stamina_per_day} />
          : <HsrSettingsForm id={id} plan={plan as HsrPlan} account={account} canEdit={canEdit} staminaName={game.stamina_name} staminaPerDay={game.stamina_per_day} />}
      </details>
      {isGenshin && (
        <details className="card text-sm">
          <summary className="cursor-pointer font-medium">Overflow weeks (double drops) — shared by every {game.name} account</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {events.map((e) => (
              <li key={e.id} className="flex items-center gap-2">
                <span>{fmtDay(parseDay(e.starts_on))} – {fmtDay(parseDay(e.ends_on))} · {e.kind === "overflow_artifacts" ? "Artifacts" : e.kind === "overflow_ley" ? "Ley Line Overflow (mora & EXP)" : "Overflowing Abundance (books & weapon mats)"}{e.note ? ` · ${e.note}` : ""}</span>
                {isAdmin && <form action={deleteEvent}><input type="hidden" name="account_id" value={id} /><input type="hidden" name="event_id" value={e.id} /><button className="btn-secondary" type="submit">✕</button></form>}
              </li>
            ))}
            {events.length === 0 && <li className="text-neutral-500">None set.</li>}
          </ul>
          {isAdmin && (
            <form action={addEvent} className="mt-2 flex flex-wrap items-end gap-2">
              <input type="hidden" name="account_id" value={id} /><input type="hidden" name="game_id" value={game.id} />
              <label className="label">Type<select className="input" name="kind" defaultValue="overflow_artifacts"><option value="overflow_artifacts">Artifacts</option><option value="overflow_ley">Ley Line Overflow (mora & EXP)</option><option value="overflow_domain">Overflowing Abundance (books & weapon mats)</option></select></label>
              <label className="label">From (Mon)<input className="input" type="date" name="starts_on" required /></label>
              <label className="label">To (Sun)<input className="input" type="date" name="ends_on" required /></label>
              <label className="label">Note<input className="input" name="note" /></label>
              <button className="btn" type="submit">Add</button>
            </form>
          )}
          <p className="mt-1 text-xs text-neutral-500">Accounts with “Use overflow weeks” ticked spend 60 resin a day on the 3 doubled runs that week; for ley line / domain overflow those runs count double toward the builds.</p>
        </details>
      )}
      <p className="text-xs text-neutral-500"><Link href={`/accounts/${id}`} className="underline">← back to the account</Link></p>
    </div>
  );
}
