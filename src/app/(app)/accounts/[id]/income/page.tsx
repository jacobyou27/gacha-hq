import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadAccountIncome } from "@/lib/income/load";
import { forecast, GROUPS, pullsOf, type ScheduleRow } from "@/lib/income/forecast";
import { fmtDay, isoDay, parseDay } from "@/lib/farm/schedule";
import { vkey } from "@/lib/calendar";
import type { Banner, Character } from "@/lib/types";
import { markIncomeItem, markIncomeVersion, saveIncomeSettings } from "./actions";

const n0 = (x: number) => Math.round(x).toLocaleString();
const n1 = (x: number) => (Math.round(x * 10) / 10).toLocaleString();
const hrs = (m: number) => (m >= 60 ? `${Math.round((m / 60) * 10) / 10} h` : `${Math.round(m)} min`);
const KIND_LABEL: Record<string, string> = { event: "Event", archon: "Archon quest", story: "Story quest", world: "World quest", exploration: "Exploration", endgame: "Endgame (one-off)", other: "Other" };
const STATUS_LABEL: Record<ScheduleRow["status"], string> = { done: "done", scheduled: "done by", missed: "missed", blocked: "blocked", later: "after the date", skipped: "skipped", gone: "event over" };

export default async function IncomePage({ params, searchParams }: PageProps<"/accounts/[id]/income">) {
  const { id } = await params;
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;
  const show = sp.show === "all" ? "all" : "plan";
  const vFilter = typeof sp.v === "string" ? sp.v : "";
  const data = await loadAccountIncome(id);
  const { account, items, marks, rows, today, current, settings: s, canEdit } = data;
  const nextV = rows.find((r) => r.start > today);
  const quick: [string, number][] = [["in 2 weeks", today + 14], ["in a month", today + 30], ...(nextV ? [[`${nextV.version} starts`, nextV.start] as [string, number], [`end of ${nextV.version}`, nextV.end] as [string, number]] : []), ["in 3 months", today + 91], ["in 6 months", today + 182]];
  const untilParam = typeof sp.until === "string" ? parseDay(sp.until) : NaN;
  const until = Number.isFinite(untilParam) ? untilParam : today + 30;
  const horizon = Math.max(until, today + 182);
  const f = forecast({ items, marks, settings: s, rows, today, until: horizon });
  const atUntil = f.at(until), atToday = f.at(today);
  const qs = new URLSearchParams({ ...(typeof sp.until === "string" ? { until: sp.until } : {}), ...(show === "all" ? { show } : {}), ...(vFilter ? { v: vFilter } : {}) }).toString();

  // banner phases ahead (pulls by each phase start)
  const supabase = await createClient();
  const [{ data: banners }, { data: chars }] = await Promise.all([
    supabase.from("banners").select("*").eq("game_id", account.game_id).returns<Banner[]>(),
    supabase.from("characters").select("id, name").eq("game_id", account.game_id).returns<Pick<Character, "id" | "name">[]>(),
  ]);
  const charName = new Map((chars ?? []).map((c) => [c.id, c.name]));
  const phases = rows.filter((r) => r.end >= today && r.start <= horizon).flatMap((r) => [1, 2].map((ph) => ({ version: r.version, phase: ph, day: r.start + (ph === 2 ? 21 : 0), est: r.estimate })))
    .filter((p) => p.day + 20 >= today && p.day <= horizon);

  const versions = [...new Set(items.map((i) => i.version))].sort((a, b) => vkey(b) - vkey(a));
  const listed = f.schedule.filter((r) => (vFilter ? r.item.version === vFilter : show === "all" ? true : !["done", "skipped", "gone"].includes(r.status)))
    .sort((a, b) => (a.day ?? 1e9) - (b.day ?? 1e9) || vkey(a.item.version) - vkey(b.item.version) || a.item.seq - b.item.seq);
  const counts = (st: ScheduleRow["status"]) => f.schedule.filter((r) => r.status === st).length;
  const dis = !canEdit;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-xl font-semibold">Primogem forecast · {account.name}</h1>
        <Link href={`/accounts/${id}`} className="text-sm underline">← account</Link>
        <Link href={`/calendar?game=${account.game_id}&account=${id}`} className="text-sm underline">calendar</Link>
        <Link href={`/income?game=${account.game_id}`} className="text-sm underline">bookkeeping</Link>
      </div>
      {error && <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">{error}</p>}
      <p className="text-sm text-neutral-600">
        Counts what this account earns from {fmtDay(f.start)} on: dailies, Welkin, Battle Pass, Paimon&apos;s Bargains, endgame (Abyss on the 16th, Theater on the 1st, Stygian once a version),
        codes / mail, and the events, quests and exploration you still have to do — worked through with your play time, so each one counts on the day you&apos;d finish it. Today is {fmtDay(today)} ({current ?? "?"}).
      </p>

      <section className="card flex flex-col gap-3 text-sm">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="label">By date<input className="input" type="date" name="until" defaultValue={isoDay(until)} /></label>
          {show === "all" && <input type="hidden" name="show" value="all" />}
          <button className="btn" type="submit">Show</button>
          <span className="flex flex-wrap gap-2 text-xs">{quick.map(([lab, d]) => <Link key={lab} className="underline" href={`?until=${isoDay(d)}`}>{lab}</Link>)}</span>
        </form>
        <div className="grid gap-3 sm:grid-cols-4">
          <div><div className="text-xs text-neutral-500">Pulls by {fmtDay(until)}</div><div className="text-2xl font-semibold">{n1(atUntil.pulls)}</div></div>
          <div><div className="text-xs text-neutral-500">Primogems</div><div className="text-lg">{n0(atUntil.primos)}</div></div>
          <div><div className="text-xs text-neutral-500">Intertwined Fates</div><div className="text-lg">{n1(atUntil.intertwined)}</div></div>
          <div><div className="text-xs text-neutral-500">Earned from today (pulls)</div><div className="text-lg">+{n1(atUntil.pulls - atToday.pulls)}</div><div className="text-xs text-neutral-500">now: {n1(atToday.pulls)} · Acquaint {n1(atUntil.acquaint)}</div></div>
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="flex flex-col gap-2">
          <h2 className="font-medium">Where it comes from <span className="text-sm font-normal text-neutral-500">({fmtDay(f.start)} → {fmtDay(until)})</span></h2>
          <table className="table text-sm">
            <thead><tr><th>Source</th><th>Primogems</th><th>Fates</th><th>Pulls</th></tr></thead>
            <tbody>
              {GROUPS.map((g) => {
                let p = 0, fi = 0;
                for (const c of f.credits) if (c.group === g && c.day <= until) { p += c.primos; fi += c.intertwined; }
                if (!p && !fi) return null;
                return <tr key={g}><td>{g}</td><td>{n0(p)}</td><td>{n1(fi)}</td><td>{n1(pullsOf(p, fi))}</td></tr>;
              })}
              <tr className="font-medium"><td>Starting bank ({s.asOf !== null ? fmtDay(s.asOf) : "today"})</td><td>{n0(s.primos)}</td><td>{n1(s.intertwined)}</td><td>{n1(pullsOf(s.primos, s.intertwined))}</td></tr>
            </tbody>
          </table>
        </section>
        <section className="flex flex-col gap-2">
          <h2 className="font-medium">By month</h2>
          <table className="table text-sm">
            <thead><tr><th>Month</th><th>Primogems</th><th>Fates</th><th>Pulls</th><th>Total pulls</th></tr></thead>
            <tbody>{f.months.map((m) => <tr key={m.month}><td>{m.month}</td><td>{n0(m.primos)}</td><td>{n1(m.intertwined)}</td><td>{n1(m.pulls)}</td><td>{n1(m.cumPulls)}</td></tr>)}</tbody>
          </table>
        </section>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Banner phases ahead</h2>
        <table className="table text-sm">
          <thead><tr><th>Phase</th><th>Starts</th><th>Featured</th><th>Pulls by then</th></tr></thead>
          <tbody>
            {phases.map((p) => {
              const feat = (banners ?? []).filter((b) => b.version === p.version && b.phase === p.phase).map((b) => charName.get(b.character_id) ?? "?");
              return <tr key={`${p.version}-${p.phase}`}><td>{p.version}{p.est ? "?" : ""} Phase {p.phase}</td><td>{fmtDay(p.day)}</td><td>{feat.join(", ") || <span className="text-neutral-400">—</span>}</td><td>{p.day < today ? "running" : n1(f.at(p.day).pulls)}</td></tr>;
            })}
          </tbody>
        </table>
      </section>

      <details className="card text-sm" open={!account.settings || !(account.settings as Record<string, unknown>).income}>
        <summary className="cursor-pointer font-medium">Account settings for the forecast</summary>
        <form action={saveIncomeSettings} className="mt-3 grid gap-3 sm:grid-cols-4">
          <input type="hidden" name="account_id" value={id} /><input type="hidden" name="qs" value={qs} />
          <label className="label">Primogems now<input className="input" name="primos" defaultValue={s.primos || ""} placeholder="0" disabled={dis} /></label>
          <label className="label">Intertwined Fates now<input className="input" name="intertwined" defaultValue={s.intertwined || ""} placeholder="0" disabled={dis} /></label>
          <label className="label">Acquaint Fates now<input className="input" name="acquaint" defaultValue={s.acquaint || ""} placeholder="0" disabled={dis} /></label>
          <label className="label">Counted on<input className="input" type="date" name="as_of" defaultValue={s.asOf !== null ? isoDay(s.asOf) : isoDay(today)} disabled={dis} /></label>
          <label className="label">Welkin Moon active until<input className="input" type="date" name="welkin_until" defaultValue={s.welkinUntil !== null ? isoDay(s.welkinUntil) : ""} disabled={dis} /></label>
          <label className="label">Battle Pass<select className="input" name="bp" defaultValue={s.bp} disabled={dis}><option value="none">Don&apos;t level it</option><option value="free">Free track</option><option value="paid">Gnostic Hymn (paid)</option></select></label>
          <label className="label">Spiral Abyss stars (floors 9–12, 0–36)<input className="input" name="abyss_stars" defaultValue={s.abyssStars} disabled={dis} /></label>
          <label className="label">Imaginarium Theater acts (0–12)<input className="input" name="theater_acts" defaultValue={s.theaterActs} disabled={dis} /></label>
          <label className="label">Stygian Onslaught difficulty (0–6)<input className="input" name="stygian" defaultValue={s.stygian} disabled={dis} /></label>
          <label className="label">% of new exploration cleared<input className="input" name="explore_pct" defaultValue={s.explorePct} disabled={dis} /></label>
          <label className="label">Play time for quests / events (hours per week, 0 = no limit)<input className="input" name="hours_per_week" defaultValue={s.hoursPerWeek} disabled={dis} /></label>
          <label className="label">Everything up to this version is done
            <select className="input" name="caught_up_through" defaultValue={s.caughtUpThrough ?? ""} disabled={dis}>
              <option value="">(nothing — new account)</option>
              {versions.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <div className="flex flex-col gap-1 sm:col-span-4 sm:flex-row sm:flex-wrap sm:gap-4">
            <label><input type="checkbox" name="commissions" defaultChecked={s.commissions} disabled={dis} /> daily commissions</label>
            <label><input type="checkbox" name="archon" defaultChecked={s.archon} disabled={dis} /> archon quests</label>
            <label><input type="checkbox" name="story" defaultChecked={s.story} disabled={dis} /> story quests / hangouts</label>
            <label><input type="checkbox" name="world" defaultChecked={s.world} disabled={dis} /> world quests</label>
            <label><input type="checkbox" name="events" defaultChecked={s.events} disabled={dis} /> events</label>
            <label><input type="checkbox" name="other" defaultChecked={s.other} disabled={dis} /> teapot / TCG / other</label>
            <label><input type="checkbox" name="web" defaultChecked={s.web} disabled={dis} /> codes, mail, web events, check-in</label>
            <label><input type="checkbox" name="future_estimates" defaultChecked={s.futureEstimates} disabled={dis} /> estimate versions not announced yet</label>
          </div>
          {canEdit && <div><button className="btn" type="submit">Save</button></div>}
          <p className="text-xs text-neutral-500 sm:col-span-4">Endgame primogems per month: Abyss {n0(800)} at 36★ (resets the 16th), Theater ≈1,000 at 12 acts (the 1st, estimate), Stygian 150 per difficulty I–III per version. Quest times are rough estimates (admins can edit them on Bookkeeping).</p>
        </form>
      </details>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-medium">Quests, events &amp; exploration</h2>
          <span className="text-xs text-neutral-500">
            {counts("scheduled")} planned ({hrs(f.minutesPlanned)} of play) · {counts("missed")} missed · {counts("blocked")} blocked · {counts("later")} after the date · {counts("done")} done · {counts("skipped")} skipped
          </span>
        </div>
        <form method="get" className="flex flex-wrap items-end gap-2 text-sm">
          <input type="hidden" name="until" value={isoDay(until)} />
          <label className="label">Show<select className="input" name="show" defaultValue={show}><option value="plan">Still to do</option><option value="all">Everything</option></select></label>
          <label className="label">Version<select className="input" name="v" defaultValue={vFilter}><option value="">all</option>{versions.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
          <button className="btn-secondary" type="submit">Filter</button>
        </form>
        {vFilter && canEdit && (
          <div className="flex flex-wrap items-center gap-2 text-xs">Whole {vFilter}:
            {(["done", "todo", "skip", "clear"] as const).map((stt) => (
              <form key={stt} action={markIncomeVersion}><input type="hidden" name="account_id" value={id} /><input type="hidden" name="version" value={vFilter} /><input type="hidden" name="status" value={stt} /><input type="hidden" name="qs" value={qs} /><button className="btn-secondary" type="submit">{stt === "clear" ? "reset" : stt}</button></form>
            ))}
          </div>
        )}
        <table className="table text-sm">
          <thead><tr><th>Version</th><th>Kind</th><th>What</th><th>Primogems</th><th>Time</th><th>Status</th>{canEdit && <th></th>}</tr></thead>
          <tbody>
            {listed.slice(0, 400).map((r) => {
              const mark = marks.get(r.item.id);
              return (
                <tr key={r.item.id} className={r.status === "missed" || r.status === "blocked" ? "text-red-700" : r.status === "done" || r.status === "skipped" || r.status === "gone" ? "text-neutral-400" : ""}>
                  <td>{r.item.version}{r.item.is_estimate ? "?" : ""}</td>
                  <td className="whitespace-nowrap">{KIND_LABEL[r.item.kind] ?? r.item.kind}</td>
                  <td>{r.item.name}{r.why ? <div className="text-xs">{r.why}</div> : null}</td>
                  <td>{n0(r.primos)}{r.intertwined ? ` + ${n1(r.intertwined)} fates` : ""}</td>
                  <td className="whitespace-nowrap">{hrs(r.minutes)}</td>
                  <td className="whitespace-nowrap">{STATUS_LABEL[r.status]}{r.day !== null ? ` ${fmtDay(r.day)}` : ""}{mark ? " ·" : ""}</td>
                  {canEdit && (
                    <td className="whitespace-nowrap">
                      {(["done", "todo", "skip"] as const).filter((x) => x !== mark).map((x) => (
                        <form key={x} action={markIncomeItem} className="inline"><input type="hidden" name="account_id" value={id} /><input type="hidden" name="item_id" value={r.item.id} /><input type="hidden" name="status" value={x} /><input type="hidden" name="qs" value={qs} /><button className="mr-1 text-xs underline" type="submit">{x}</button></form>
                      ))}
                      {mark && <form action={markIncomeItem} className="inline"><input type="hidden" name="account_id" value={id} /><input type="hidden" name="item_id" value={r.item.id} /><input type="hidden" name="status" value="clear" /><input type="hidden" name="qs" value={qs} /><button className="text-xs text-neutral-500 underline" type="submit">reset</button></form>}
                    </td>
                  )}
                </tr>
              );
            })}
            {listed.length === 0 && <tr><td colSpan={7} className="text-neutral-500">Nothing here.</td></tr>}
            {listed.length > 400 && <tr><td colSpan={7} className="text-neutral-500">{listed.length - 400} more — pick a version to see them.</td></tr>}
          </tbody>
        </table>
        <p className="text-xs text-neutral-500">“·” = marked by hand. Unmarked items follow the settings: everything up to the “done” version counts as done, the rest follows the quest / event switches. Events must be finished inside their version; archon acts unlock the next act and the region&apos;s quests. Primogem numbers come from the Genshin Bookkeeping sheet (sectoidfodder); exploration is scaled by your %.</p>
      </section>
    </div>
  );
}
