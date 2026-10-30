import Link from "next/link";
import { loadFarm } from "@/lib/farm/load";
import { GENSHIN_DATA } from "@/data/farm/genshin";
import { fmtDay, isoDay, parseDay } from "@/lib/farm/schedule";
import { versionCalendar } from "@/lib/farm/plan";
import { addBuild, addEvent, deleteBuild, deleteEvent, logDay, reopenBuild, saveFarmSettings, updateBuild } from "./actions";
import { FarmNav, DayButtons } from "./ui";

const n0 = (x: number) => Math.round(x).toLocaleString();

export default async function FarmPage({ params, searchParams }: PageProps<"/accounts/[id]/farm">) {
  const { id } = await params;
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;
  const message = typeof sp.message === "string" ? sp.message : null;
  const { account, game, builds, characters, log, versions, events, canEdit, isAdmin, plan } = await loadFarm(id);
  const s = plan.settings;
  const cal = versionCalendar(versions, game.id);
  const acc = (account.settings ?? {}) as Record<string, unknown>;
  const wpnSeries = GENSHIN_DATA.weaponDomains.map((d) => d.series);
  const byDay = new Map<number, typeof log>();
  for (const l of log) { const d = parseDay(l.day); byDay.set(d, [...(byDay.get(d) ?? []), l]); }
  const daysList = [-2, -1, 0, 1, 2, 3].map((off) => plan.today + off);
  const schedByDay = new Map(plan.days.map((d) => [d.abs, d]));

  return (
    <div className="flex flex-col gap-6">
      <FarmNav id={id} game={game} account={account} active="builds" />
      {error && <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">{error}</p>}
      {message && <p className="rounded border border-green-300 bg-green-50 p-2 text-sm text-green-800">{message}</p>}

      <div className="grid gap-3 text-sm sm:grid-cols-4">
        <div className="card"><div className="text-xs text-neutral-500">{game.stamina_name} needed</div><div className="text-lg">{n0(plan.resinTotal)}</div></div>
        <div className="card"><div className="text-xs text-neutral-500">Days of {game.stamina_name}</div><div className="text-lg">{s.resinPerDay ? Math.ceil(plan.resinTotal / s.resinPerDay) : "—"}</div></div>
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
        <p className="text-xs text-neutral-500">Done logs the planned runs for that day (so they stop being counted); Skip means the {game.stamina_name} went elsewhere. Plan starts {fmtDay(plan.start)}{plan.carry ? ` with ${plan.carry} banked` : ""}. {plan.stygian && s.stygianSkip ? `Stygian week ${fmtDay(plan.stygian[0])}–${fmtDay(plan.stygian[0] + 6)} is skipped.` : ""}</p>
      </section>

      {/* builds */}
      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Builds <span className="text-sm font-normal text-neutral-500">— in plan order; {game.stamina_name} after inventory and logged runs</span></h2>
        <table className="table">
          <thead>
            <tr>
              <th>#</th><th>Character</th><th>Lv</th><th>NA</th><th>Skill</th><th>Burst</th><th>Weapon</th><th>Deadline</th>
              <th>{game.stamina_name}</th><th>Finish</th><th>Soonest</th><th>Status</th>{canEdit && <th></th>}
            </tr>
          </thead>
          <tbody>
            {plan.rows.map((r) => {
              const i = r.build.inputs as Record<string, number | string | undefined>;
              const f = `b-${r.build.id}`;
              const pair = (now: string, goal: string, hi: number) => canEdit
                ? <span className="whitespace-nowrap"><input form={f} className="input w-12" name={now} defaultValue={i[now] ?? ""} placeholder="1" /> → <input form={f} className="input w-12" name={goal} defaultValue={i[goal] ?? ""} placeholder={String(hi)} /></span>
                : <span>{i[now] ?? 1} → {i[goal] ?? i[now] ?? 1}</span>;
              return (
                <tr key={r.build.id}>
                  <td>
                    {canEdit && <form action={updateBuild} id={f} className="contents"><input type="hidden" name="account_id" value={id} /><input type="hidden" name="build_id" value={r.build.id} /></form>}
                    {canEdit ? <input form={f} className="input w-12" name="priority" defaultValue={r.build.priority} /> : r.build.priority}
                  </td>
                  <td className="font-medium">{r.ch.name}<div className="text-xs font-normal text-neutral-500">{r.needs.bookSeries.join("/")}{r.needs.bossDrop ? ` · ${r.needs.bossDrop}` : ""}{r.needs.weeklyBoss ? ` · ${r.needs.weeklyBoss}` : ""}</div></td>
                  <td>{pair("lv_now", "lv_goal", 90)}</td>
                  <td>{pair("na_now", "na_goal", 10)}</td>
                  <td>{pair("skill_now", "skill_goal", 10)}</td>
                  <td>{pair("burst_now", "burst_goal", 10)}</td>
                  <td>
                    {canEdit ? (
                      <span className="flex flex-wrap items-center gap-1">
                        <select form={f} className="input w-14" name="wpn_rarity" defaultValue={i.wpn_rarity ?? ""}><option value="">—</option><option value="5">5★</option><option value="4">4★</option><option value="3">3★</option></select>
                        <select form={f} className="input w-36" name="wpn_series" defaultValue={i.wpn_series ?? ""}><option value="">(no weapon)</option>{wpnSeries.map((x) => <option key={x} value={x}>{x}</option>)}</select>
                        {pair("wpn_now", "wpn_goal", 90)}
                      </span>
                    ) : i.wpn_series ? `${i.wpn_rarity}★ ${i.wpn_series} ${i.wpn_now ?? 1} → ${i.wpn_goal ?? i.wpn_now ?? 1}` : "—"}
                  </td>
                  <td>
                    {canEdit ? (
                      <span className="flex flex-col gap-1">
                        <input form={f} className="input w-32" type="date" name="deadline" defaultValue={r.build.deadline ?? ""} />
                        <select form={f} className="input w-32" name="banner" defaultValue={r.build.banner ?? ""}><option value="">(or by banner)</option>{cal?.banners.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}</select>
                      </span>
                    ) : r.deadline !== null ? fmtDay(r.deadline) : "—"}
                  </td>
                  <td className="whitespace-nowrap">{n0(r.resin)}<div className="text-xs text-neutral-500">{Math.round((r.resin / (s.resinPerDay || 180)) * 10) / 10} d</div></td>
                  <td className="whitespace-nowrap">{fmtDay(r.status?.finish ?? null)}</td>
                  <td className="whitespace-nowrap">{fmtDay(r.status?.soonest ?? null)}</td>
                  <td className={`whitespace-nowrap ${r.status?.status.startsWith("■") ? "text-red-700" : r.status?.status.startsWith("▲") ? "text-amber-700" : "text-neutral-700"}`}>{r.status?.status ?? ""}</td>
                  {canEdit && (
                    <td className="whitespace-nowrap">
                      <label className="mr-1 text-xs"><input form={f} type="checkbox" name="done" /> done</label>
                      <button form={f} className="btn" type="submit">Save</button>{" "}
                      <form action={deleteBuild} className="inline"><input type="hidden" name="account_id" value={id} /><input type="hidden" name="build_id" value={r.build.id} /><button className="btn-secondary" type="submit">✕</button></form>
                    </td>
                  )}
                </tr>
              );
            })}
            {plan.rows.length === 0 && <tr><td colSpan={13} className="text-neutral-500">No builds yet — add a character below.</td></tr>}
          </tbody>
        </table>
        <details className="text-sm">
          <summary className="cursor-pointer text-neutral-600">Materials & runs per build</summary>
          <table className="table mt-2">
            <thead><tr><th>Character</th><th>Hero&apos;s Wit</th><th>Mora</th><th>Boss</th><th>Books (Guide-eq)</th><th>Weekly</th><th>Crowns</th><th>Wpn (3★-eq)</th><th>Runs left: books · wpn · boss · EXP · mora · weekly</th></tr></thead>
            <tbody>
              {plan.rows.map((r) => (
                <tr key={r.build.id}>
                  <td>{r.ch.name}</td><td>{n0(r.needs.wit)}</td><td>{n0(r.needs.mora)}</td><td>{n0(r.needs.boss)}</td><td>{n0(r.needs.books)}</td><td>{n0(r.needs.weekly)}</td><td>{n0(r.needs.crowns)}</td><td>{n0(r.needs.wpn)}</td>
                  <td>{r.runs.book.reduce((a, b) => a + b, 0)} · {r.runs.wpn} · {r.runs.boss} · {r.runs.wit} · {r.runs.mora} · {r.runs.weekly}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-xs text-neutral-500">Needs are before inventory. Runs are after what the account owns (Inventory) and what was logged since the last inventory count, for the “{s.dropCase}” drop-rate case.</p>
        </details>
        {builds.some((b) => b.done) && (
          <p className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">Done (not planned):
            {builds.filter((b) => b.done).map((b) => (
              <form key={b.id} action={reopenBuild} className="inline"><input type="hidden" name="account_id" value={id} /><input type="hidden" name="build_id" value={b.id} /><span>{characters.find((c) => c.id === b.character_id)?.name ?? "?"}</span> {canEdit && <button className="btn-secondary" type="submit">reopen</button>}</form>
            ))}
          </p>
        )}

        {canEdit && (
          <form action={addBuild} className="card flex flex-wrap items-end gap-2 text-sm">
            <input type="hidden" name="account_id" value={id} />
            <label className="label">Character
              <select className="input" name="character_id" required defaultValue="">
                <option value="">Pick a character…</option>
                {characters.filter((c) => Object.keys(c.farm ?? {}).length > 0).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="label">#<input className="input w-14" name="priority" defaultValue={plan.rows.length + 1} /></label>
            <label className="label">Lv now → goal<span className="flex gap-1"><input className="input w-14" name="lv_now" placeholder="1" /><input className="input w-14" name="lv_goal" placeholder="90" /></span></label>
            <label className="label">NA<span className="flex gap-1"><input className="input w-12" name="na_now" placeholder="1" /><input className="input w-12" name="na_goal" placeholder="1" /></span></label>
            <label className="label">Skill<span className="flex gap-1"><input className="input w-12" name="skill_now" placeholder="1" /><input className="input w-12" name="skill_goal" placeholder="1" /></span></label>
            <label className="label">Burst<span className="flex gap-1"><input className="input w-12" name="burst_now" placeholder="1" /><input className="input w-12" name="burst_goal" placeholder="1" /></span></label>
            <label className="label">Weapon<span className="flex gap-1"><select className="input w-14" name="wpn_rarity" defaultValue=""><option value="">—</option><option value="5">5★</option><option value="4">4★</option><option value="3">3★</option></select><select className="input w-36" name="wpn_series" defaultValue=""><option value="">(none)</option>{wpnSeries.map((x) => <option key={x} value={x}>{x}</option>)}</select><input className="input w-14" name="wpn_now" placeholder="1" /><input className="input w-14" name="wpn_goal" placeholder="90" /></span></label>
            <label className="label">Deadline<input className="input" type="date" name="deadline" /></label>
            <label className="label">or banner<select className="input" name="banner" defaultValue=""><option value="">—</option>{cal?.banners.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}</select></label>
            <button className="btn" type="submit">Add build</button>
            <p className="w-full text-xs text-neutral-500">Blank goal = no change. The same character can be added twice (e.g. a later row for crowns). Characters without farming data (new leaks) need their books / boss / weekly set on the Characters page first.</p>
          </form>
        )}
      </section>

      {/* settings */}
      <details className="card text-sm" open={plan.rows.length === 0}>
        <summary className="cursor-pointer font-medium">Account settings</summary>
        <form action={saveFarmSettings} className="mt-3 grid gap-3 sm:grid-cols-4">
          <input type="hidden" name="account_id" value={id} />
          <label className="label">World Level (0–9)<input className="input" name="wl" defaultValue={String(acc.wl ?? "")} placeholder="8" disabled={!canEdit} /></label>
          <label className="label">{game.stamina_name} / day<input className="input" name="stamina_per_day" defaultValue={String(acc.stamina_per_day ?? "")} placeholder={String(game.stamina_per_day)} disabled={!canEdit} /></label>
          <label className="label">Extra per week (e.g. teapot 60)<input className="input" name="extra_week" defaultValue={String(acc.extra_week ?? "")} placeholder="0" disabled={!canEdit} /></label>
          <label className="label">Fragile Resin owned<input className="input" name="fuel" defaultValue={String(acc.fuel ?? "")} placeholder="0" disabled={!canEdit} /></label>
          <label className="label">Bank between days (0 = leftovers → artifacts)<input className="input" name="bank_cap" defaultValue={String(acc.bank_cap ?? "")} placeholder="0" disabled={!canEdit} /></label>
          <label className="label">Talent-book crafting<select className="input" name="book_opt" defaultValue={String(acc.book_opt ?? 0)} disabled={!canEdit}><option value="0">none</option><option value="1">Xingqiu (25% refund)</option><option value="2">Eula / Layla (10% double)</option></select></label>
          <label className="label">Weapon-mat crafting<select className="input" name="wpn_opt" defaultValue={String(acc.wpn_opt ?? 0)} disabled={!canEdit}><option value="0">none</option><option value="1">Mona (25% refund)</option><option value="2">Albedo / Ayaka / Alhaitham / Wriothesley (10% double)</option></select></label>
          <label className="label">Drop-rate case<select className="input" name="drop_case" defaultValue={s.dropCase} disabled={!canEdit}><option value="avg">Average</option><option value="p80">Pessimistic (80%)</option><option value="worst">Worst</option><option value="best">Best</option></select></label>
          <label className="label">Plan order<select className="input" name="order" defaultValue={s.order} disabled={!canEdit}><option value="priority">My priority (#)</option><option value="deadline">Earliest deadline first</option></select></label>
          <label className="label">Plan weekly bosses on<select className="input" name="weekly_day" defaultValue={String(s.weeklyDay)} disabled={!canEdit}><option value="-1">Any day</option>{[1, 2, 3, 4, 5, 6, 0].map((d) => <option key={d} value={d}>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]}</option>)}</select></label>
          <label className="label">Days off (e.g. “Sat, Sun”)<input className="input" name="days_off" defaultValue={s.daysOff} disabled={!canEdit} /></label>
          <div className="flex flex-col gap-1 self-end">
            <label><input type="checkbox" name="ley" defaultChecked={s.ley} disabled={!canEdit} /> Farm mora & EXP with resin</label>
            <label><input type="checkbox" name="solvent" defaultChecked={s.solvent} disabled={!canEdit} /> Plenty of Dream Solvent</label>
            <label><input type="checkbox" name="allow60" defaultChecked={s.allow60} disabled={!canEdit} /> Allow 60-resin weekly bosses</label>
            <label><input type="checkbox" name="mon_boss" defaultChecked={s.monBoss} disabled={!canEdit} /> Mondays: weekly bosses only</label>
            <label><input type="checkbox" name="stygian_skip" defaultChecked={s.stygianSkip} disabled={!canEdit} /> Skip farming in Stygian week</label>
            <label><input type="checkbox" name="overflow" defaultChecked={s.overflow} disabled={!canEdit} /> Use overflow weeks (3 doubled runs = 60 resin a day)</label>
          </div>
          {canEdit && <div className="self-end"><button className="btn" type="submit">Save settings</button></div>}
        </form>
      </details>
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
      <p className="text-xs text-neutral-500"><Link href={`/accounts/${id}`} className="underline">← back to the account</Link></p>
    </div>
  );
}
