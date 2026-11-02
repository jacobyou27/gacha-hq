"use client";

/**
 * Primogem planner: tick what you'll do, see the estimate change instantly, save once.
 * The forecast engine (src/lib/income/forecast.ts) is pure, so it runs right here in the browser.
 */
import { useMemo, useState } from "react";
import type { IncomeItem, IncomeStatus } from "@/lib/types";
import type { VersionRow } from "@/lib/calendar";
import { vkey } from "@/lib/calendar";
import { abyssPrimos, forecast, GROUPS, incomeSettings, itemStatus, pullsOf, stygianPrimos, theaterPrimos, type ScheduleRow } from "@/lib/income/forecast";
import { fmtDay, isoDay, parseDay } from "@/lib/farm/schedule";
import { saveIncomePlan } from "./actions";

type Raw = Record<string, unknown>;
type Phase = { key: string; label: string; day: number; featured: string };
type Props = {
  accountId: string; canEdit: boolean; items: IncomeItem[]; marks: Record<string, IncomeStatus>; raw: Raw; defaultCaughtUp: string | null;
  rows: VersionRow[]; today: number; phases: Phase[]; versions: string[]; initialUntil: number; error: string | null; hasSettings: boolean;
};

const n0 = (x: number) => Math.round(x).toLocaleString();
const n1 = (x: number) => (Math.round(x * 10) / 10).toLocaleString();
const hrs = (m: number) => (m >= 60 ? `${n1(m / 60)} h` : `${Math.round(m)} min`);
const KINDS = [["event", "Events"], ["archon", "Archon"], ["story", "Story"], ["world", "World"], ["exploration", "Exploration"], ["endgame", "Endgame"], ["other", "Other"]] as const;
const KIND_SHORT: Record<string, string> = { event: "Event", archon: "Archon", story: "Story", world: "World", exploration: "Explore", endgame: "Endgame", other: "Other" };
const PLANNED = new Set<ScheduleRow["status"]>(["scheduled", "missed", "later", "blocked"]);

export function IncomePlanner(p: Props) {
  const [raw, setRaw] = useState<Raw>(p.raw);
  const [marks, setMarks] = useState<Record<string, IncomeStatus>>(p.marks);
  const [until, setUntil] = useState(p.initialUntil);
  const [show, setShow] = useState<"todo" | "done" | "all">("todo");
  const [kinds, setKinds] = useState<Set<string>>(new Set(KINDS.map((k) => k[0])));
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);

  const s = useMemo(() => incomeSettings(raw, p.defaultCaughtUp), [raw, p.defaultCaughtUp]);
  const markMap = useMemo(() => new Map(Object.entries(marks)), [marks]);
  const horizon = Math.max(until, p.today + 182);
  const f = useMemo(() => forecast({ items: p.items, marks: markMap, settings: s, rows: p.rows, today: p.today, until: horizon }), [p.items, markMap, s, p.rows, p.today, horizon]);
  const at = f.at(until), now = f.at(p.today);

  // ---- changes vs what is saved
  const markDiff = useMemo(() => {
    const d: Record<string, string> = {};
    for (const id of new Set([...Object.keys(p.marks), ...Object.keys(marks)])) {
      if (marks[id] === p.marks[id]) continue;
      d[id] = marks[id] ?? "clear";
    }
    return d;
  }, [marks, p.marks]);
  const dirty = Object.keys(markDiff).length > 0 || JSON.stringify(raw) !== JSON.stringify(p.raw);

  const set = (k: string, v: unknown) => setRaw((r) => ({ ...r, [k]: v }));
  /** Set an item's status; if it equals what the defaults would say, drop the explicit mark. */
  const mark = (ids: string[], st: IncomeStatus) => setMarks((m) => {
    const next = { ...m };
    for (const id of ids) {
      const it = p.items.find((i) => i.id === id);
      delete next[id];
      if (!it) continue;
      if (itemStatus(it, s, new Map()) !== st) next[id] = st;
    }
    return next;
  });

  // ---- checklist rows
  const rowsAll = f.schedule;
  const visible = rowsAll.filter((r) => {
    if (!kinds.has(r.item.kind)) return false;
    if (q && !r.item.name.toLowerCase().includes(q.toLowerCase())) return false;
    if (show === "todo") return r.status !== "done" && r.status !== "gone";
    if (show === "done") return r.status === "done";
    return true;
  });
  const byVersion = new Map<string, ScheduleRow[]>();
  for (const r of visible) { const l = byVersion.get(r.item.version) ?? []; l.push(r); byVersion.set(r.item.version, l); }
  const versionList = [...byVersion.keys()].sort((a, b) => vkey(b) - vkey(a));
  const vrow = new Map(p.rows.map((r) => [r.version, r]));
  const planned = rowsAll.filter((r) => PLANNED.has(r.status));
  const missed = rowsAll.filter((r) => r.status === "missed").length;
  const late = rowsAll.filter((r) => r.status === "later" || (r.status === "scheduled" && r.day !== null && r.day > until)).length;
  const minutesPlanned = planned.reduce((a, r) => a + r.minutes, 0);
  const minutesFree = s.hoursPerWeek > 0 ? ((until - p.today + 1) * s.hoursPerWeek * 60) / 7 : Infinity;

  const quick: [string, number][] = (() => {
    const nextV = p.rows.find((r) => r.start > p.today);
    const out: [string, number][] = [["2 weeks", p.today + 14], ["1 month", p.today + 30]];
    if (nextV) out.push([`${nextV.version} starts`, nextV.start], [`end of ${nextV.version}`, nextV.end]);
    out.push(["3 months", p.today + 91], ["6 months", p.today + 182]);
    return out;
  })();

  const field = "flex flex-col gap-1 text-xs font-medium text-neutral-600";
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      {/* ---------------- left: settings + checklist ---------------- */}
      <div className="flex min-w-0 flex-col gap-6">
        {p.error && <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">{p.error}</p>}

        <details className="card" open={!p.hasSettings}>
          <summary className="cursor-pointer font-medium">Account <span className="text-sm font-normal text-neutral-500">— {n0(s.primos)} primos, {n1(s.intertwined)} fates · {s.welkinUntil !== null && s.welkinUntil >= p.today ? "Welkin" : "no Welkin"} · BP {s.bp === "paid" ? "paid" : s.bp === "free" ? "free" : "off"} · Abyss {s.abyssStars}★ · Theater {s.theaterActs} acts · {s.hoursPerWeek ? `${s.hoursPerWeek} h/week` : "no time limit"}</span></summary>
          <div className="mt-4 grid gap-5">
            <fieldset className="grid gap-3 sm:grid-cols-4">
              <legend className="mb-2 text-sm font-medium">What you have</legend>
              <label className={field}>Primogems<input className="input" inputMode="numeric" value={String(raw.primos ?? "")} placeholder="0" onChange={(e) => set("primos", e.target.value)} /></label>
              <label className={field}>Intertwined Fates<input className="input" inputMode="numeric" value={String(raw.intertwined ?? "")} placeholder="0" onChange={(e) => set("intertwined", e.target.value)} /></label>
              <label className={field}>Acquaint Fates<input className="input" inputMode="numeric" value={String(raw.acquaint ?? "")} placeholder="0" onChange={(e) => set("acquaint", e.target.value)} /></label>
              <label className={field}>Counted on<input className="input" type="date" value={String(raw.as_of ?? isoDay(p.today))} onChange={(e) => set("as_of", e.target.value)} /></label>
            </fieldset>
            <fieldset className="grid gap-3 sm:grid-cols-4">
              <legend className="mb-2 text-sm font-medium">Regular income</legend>
              <label className={field}>Welkin Moon until
                <span className="flex gap-1"><input className="input" type="date" value={String(raw.welkin_until ?? "")} onChange={(e) => set("welkin_until", e.target.value)} />{raw.welkin_until ? <button type="button" className="text-xs underline" onClick={() => set("welkin_until", "")}>none</button> : null}</span>
              </label>
              <label className={field}>Battle Pass
                <select className="input" value={s.bp} onChange={(e) => set("bp", e.target.value)}><option value="none">Not levelling it</option><option value="free">Free track (60 + 5 Acquaint)</option><option value="paid">Gnostic Hymn (+680 + 4 fates)</option></select>
              </label>
              <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={s.commissions} onChange={(e) => set("commissions", e.target.checked)} /> Daily commissions (60/day)</label>
              <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={s.web} onChange={(e) => set("web", e.target.checked)} /> Codes, mail, check-in</label>
            </fieldset>
            <fieldset className="grid gap-3 sm:grid-cols-3">
              <legend className="mb-2 text-sm font-medium">Endgame — how far you get each reset</legend>
              <label className={field}>Spiral Abyss (16th)
                <select className="input" value={s.abyssStars} onChange={(e) => set("abyss_stars", Number(e.target.value))}>
                  {[0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36].map((x) => <option key={x} value={x}>{x === 0 ? "Don't play" : `${x}★ on floors 9–12`} — {abyssPrimos(x)}</option>)}
                </select>
              </label>
              <label className={field}>Imaginarium Theater (1st)
                <select className="input" value={s.theaterActs} onChange={(e) => set("theater_acts", Number(e.target.value))}>
                  {Array.from({ length: 13 }, (_, x) => <option key={x} value={x}>{x === 0 ? "Don't play" : `${x} acts`} — {theaterPrimos(x)}</option>)}
                </select>
              </label>
              <label className={field}>Stygian Onslaught (per version)
                <select className="input" value={s.stygian} onChange={(e) => set("stygian", Number(e.target.value))}>
                  {["Don't play", "I Normal", "II Advancing", "III Hard", "IV Menacing", "V Fearless", "VI Dire"].map((lab, x) => <option key={x} value={x}>{lab} — {stygianPrimos(x)}</option>)}
                </select>
              </label>
            </fieldset>
            <fieldset className="grid gap-3 sm:grid-cols-3">
              <legend className="mb-2 text-sm font-medium">Quests &amp; exploration</legend>
              <label className={field}>Finished everything up to
                <select className="input" value={s.caughtUpThrough ?? ""} onChange={(e) => set("caught_up_through", e.target.value)}>
                  <option value="">Nothing yet (new account)</option>
                  {p.versions.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </label>
              <label className={field}>New exploration you clear
                <select className="input" value={s.explorePct} onChange={(e) => set("explore_pct", Number(e.target.value))}>{[0, 25, 50, 75, 100].map((x) => <option key={x} value={x}>{x}%</option>)}</select>
              </label>
              <label className={field}>Play time for quests &amp; events
                <select className="input" value={s.hoursPerWeek} onChange={(e) => set("hours_per_week", Number(e.target.value))}>
                  {[0, 2, 3, 5, 7, 10, 14, 21, 28].map((x) => <option key={x} value={x}>{x === 0 ? "No limit" : `${x} h / week`}</option>)}
                </select>
              </label>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm sm:col-span-3">
                <span className="text-xs font-medium text-neutral-600">Versions not announced yet:</span>
                <label className="flex items-center gap-1"><input type="checkbox" checked={s.futureEstimates} onChange={(e) => set("future_estimates", e.target.checked)} /> estimate them</label>
                <label className="flex items-center gap-1"><input type="checkbox" checked={s.events} disabled={!s.futureEstimates} onChange={(e) => set("events", e.target.checked)} /> with events</label>
                <label className="flex items-center gap-1"><input type="checkbox" checked={s.archon} disabled={!s.futureEstimates} onChange={(e) => set("future_quests", e.target.checked)} /> with quests</label>
              </div>
            </fieldset>
          </div>
        </details>

        <section className="flex flex-col gap-3">
          <div>
            <h2 className="font-medium">Pick what you&apos;ll do</h2>
            <p className="text-sm text-neutral-600">Ticked = you plan to do it, and its primogems count on the day you&apos;d finish it at your play time. Untick what you&apos;ll skip; press <i>done</i> for things you already finished (they leave the list — their primogems are already in your bank).</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded border border-neutral-200 bg-neutral-50 p-2 text-sm">
            <div className="flex overflow-hidden rounded border border-neutral-300">
              {(["todo", "done", "all"] as const).map((x) => <button key={x} type="button" onClick={() => setShow(x)} className={`px-2 py-1 ${show === x ? "bg-neutral-900 text-white" : "bg-white"}`}>{x === "todo" ? "To do" : x === "done" ? "Done" : "Everything"}</button>)}
            </div>
            <div className="flex flex-wrap gap-1">
              {KINDS.map(([k, lab]) => (
                <button key={k} type="button" onClick={() => setKinds((c) => { const n = new Set(c); if (n.has(k)) n.delete(k); else n.add(k); return n; })}
                  className={`rounded-full border px-2 py-0.5 text-xs ${kinds.has(k) ? "border-neutral-800 bg-neutral-800 text-white" : "border-neutral-300 bg-white text-neutral-500"}`}>{lab}</button>
              ))}
            </div>
            <input className="input w-40" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
            <span className="ml-auto flex gap-2 text-xs">
              <button type="button" className="underline" onClick={() => mark(visible.filter((r) => r.status !== "done").map((r) => r.item.id), "todo")}>tick all shown</button>
              <button type="button" className="underline" onClick={() => mark(visible.filter((r) => r.status !== "done").map((r) => r.item.id), "skip")}>untick all shown</button>
              {Object.keys(marks).length > 0 && <button type="button" className="text-neutral-500 underline" onClick={() => setMarks({})}>reset all ticks</button>}
            </span>
          </div>

          {versionList.length === 0 && <p className="text-sm text-neutral-500">Nothing here{show === "todo" ? " — everything is done or filtered out." : "."}</p>}
          {versionList.map((v, idx) => {
            const list = byVersion.get(v)!.slice().sort((a, b) => kindOrder(a) - kindOrder(b) || a.item.seq - b.item.seq);
            const vr = vrow.get(v);
            const plannedHere = list.filter((r) => PLANNED.has(r.status));
            const primosHere = plannedHere.reduce((a, r) => a + r.primos, 0);
            const ids = list.filter((r) => r.status !== "done").map((r) => r.item.id);
            return (
              <details key={v} className="rounded border border-neutral-200" open={idx < 3}>
                <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-3 gap-y-1 bg-neutral-50 px-3 py-2">
                  <span className="font-medium">{v}{list.some((r) => r.item.is_estimate) ? " (estimate)" : ""}</span>
                  {vr && <span className="text-xs text-neutral-500">{fmtDay(vr.start)} – {fmtDay(vr.end)}</span>}
                  <span className="text-xs text-neutral-600">{show === "done" ? `${list.length} done` : `${plannedHere.length} of ${list.length} ticked · ${n0(primosHere)} primos`}</span>
                  {show !== "done" && (
                    <span className="ml-auto flex gap-2 text-xs" onClick={(e) => e.preventDefault()}>
                      <button type="button" className="underline" onClick={() => mark(ids, "todo")}>tick all</button>
                      <button type="button" className="underline" onClick={() => mark(ids, "skip")}>none</button>
                      <button type="button" className="underline" onClick={() => mark(ids, "done")}>all done</button>
                    </span>
                  )}
                </summary>
                <ul className="divide-y divide-neutral-100">
                  {list.map((r) => <ItemRow key={r.item.id} r={r} until={until} onMark={(st) => mark([r.item.id], st)} />)}
                </ul>
              </details>
            );
          })}
          <p className="text-xs text-neutral-500">Events have to be finished before their version ends. Archon acts go in order and unlock their region&apos;s quests; quests whose prerequisite you didn&apos;t tick are counted as if it&apos;s already done. Times are rough estimates. Exploration primogems are scaled by your %. Numbers: the Genshin Bookkeeping sheet (sectoidfodder).</p>
        </section>
      </div>

      {/* ---------------- right: the answer, always in view ---------------- */}
      <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
        <div className="card flex flex-col gap-3">
          <label className={field}>Pulls by
            <input className="input" type="date" value={isoDay(until)} min={isoDay(p.today)} onChange={(e) => { const d = parseDay(e.target.value); if (Number.isFinite(d)) setUntil(d); }} />
          </label>
          <div className="flex flex-wrap gap-1">{quick.map(([lab, d]) => <button key={lab} type="button" onClick={() => setUntil(d)} className={`rounded-full border px-2 py-0.5 text-xs ${until === d ? "border-neutral-800 bg-neutral-800 text-white" : "border-neutral-300"}`}>{lab}</button>)}</div>
          <div>
            <div className="text-4xl font-semibold tabular-nums">{n1(at.pulls)}</div>
            <div className="text-sm text-neutral-600">pulls on {fmtDay(until)} · {n0(at.primos)} primos + {n1(at.intertwined)} fates</div>
            <div className="text-xs text-neutral-500">+{n1(at.pulls - now.pulls)} from today (now {n1(now.pulls)}) · {n1(at.acquaint)} Acquaint</div>
          </div>
          <div className="text-xs text-neutral-600">
            {planned.length} things ticked · {hrs(minutesPlanned)} of play{Number.isFinite(minutesFree) ? ` (you have ~${hrs(minutesFree)} by then)` : ""}
            {missed > 0 && <div className="text-red-700">{missed} event{missed > 1 ? "s" : ""} won&apos;t fit before {missed > 1 ? "they end" : "it ends"} — untick or add play time</div>}
            {late > 0 && <div className="text-amber-700">{late} ticked item{late > 1 ? "s" : ""} finish after this date</div>}
          </div>
          {p.canEdit ? (
            <form action={saveIncomePlan} onSubmit={() => setSaving(true)} className="flex items-center gap-2 border-t border-neutral-100 pt-3">
              <input type="hidden" name="account_id" value={p.accountId} />
              <input type="hidden" name="settings" value={JSON.stringify(raw)} />
              <input type="hidden" name="marks" value={JSON.stringify(markDiff)} />
              <input type="hidden" name="until" value={isoDay(until)} />
              <button className="btn" type="submit" disabled={!dirty || saving}>{saving ? "Saving…" : "Save plan"}</button>
              {dirty && !saving ? <button type="button" className="text-xs underline" onClick={() => { setRaw(p.raw); setMarks(p.marks); }}>discard</button> : null}
              <span className="text-xs text-neutral-500">{dirty ? "unsaved changes" : "saved"}</span>
            </form>
          ) : <p className="text-xs text-neutral-500">View only — you can try things out, but not save.</p>}
        </div>

        <div className="card text-sm">
          <h3 className="mb-1 font-medium">Where it comes from</h3>
          <table className="w-full text-xs">
            <tbody>
              {GROUPS.map((g) => {
                let pr = 0, fi = 0;
                for (const c of f.credits) if (c.group === g && c.day <= until) { pr += c.primos; fi += c.intertwined; }
                if (!pr && !fi) return null;
                return <tr key={g}><td className="py-0.5 pr-2">{g}</td><td className="text-right tabular-nums">{n1(pullsOf(pr, fi))}</td></tr>;
              })}
              <tr className="border-t border-neutral-100"><td className="py-0.5 pr-2">What you have now</td><td className="text-right tabular-nums">{n1(pullsOf(s.primos, s.intertwined))}</td></tr>
            </tbody>
          </table>
        </div>

        {p.phases.length > 0 && (
          <div className="card text-sm">
            <h3 className="mb-1 font-medium">At each banner</h3>
            <table className="w-full text-xs">
              <tbody>
                {p.phases.map((ph) => (
                  <tr key={ph.key} className={ph.day === until ? "font-medium" : ""}>
                    <td className="py-0.5 pr-2"><button type="button" className="text-left underline decoration-neutral-300" onClick={() => setUntil(Math.max(ph.day, p.today))}>{ph.label}</button><div className="text-neutral-500">{fmtDay(ph.day)}{ph.featured ? ` · ${ph.featured}` : ""}</div></td>
                    <td className="text-right tabular-nums">{ph.day < p.today ? "now" : n1(f.at(ph.day).pulls)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <details className="card text-sm">
          <summary className="cursor-pointer font-medium">By month</summary>
          <table className="mt-1 w-full text-xs">
            <thead><tr className="text-neutral-500"><th className="text-left font-normal">Month</th><th className="text-right font-normal">Earned</th><th className="text-right font-normal">Total</th></tr></thead>
            <tbody>{f.months.map((m) => <tr key={m.month}><td>{m.month}</td><td className="text-right tabular-nums">+{n1(m.pulls)}</td><td className="text-right tabular-nums">{n1(m.cumPulls)}</td></tr>)}</tbody>
          </table>
        </details>
      </aside>
    </div>
  );
}

const ORDER: Record<string, number> = { event: 0, archon: 1, story: 2, world: 3, exploration: 4, endgame: 5, other: 6 };
const kindOrder = (r: ScheduleRow) => ORDER[r.item.kind] ?? 9;

function ItemRow({ r, until, onMark }: { r: ScheduleRow; until: number; onMark: (st: IncomeStatus) => void }) {
  const ticked = PLANNED.has(r.status);
  const done = r.status === "done";
  const gone = r.status === "gone";
  let outcome: React.ReactNode = null;
  if (r.status === "scheduled" && r.day !== null) outcome = <span className={r.day > until ? "text-amber-700" : "text-neutral-600"}>by {fmtDay(r.day)}</span>;
  else if (r.status === "missed") outcome = <span className="text-red-700">won&apos;t fit in time</span>;
  else if (r.status === "later") outcome = <span className="text-amber-700">not by then</span>;
  else if (gone) outcome = <span className="text-neutral-400">event over</span>;
  return (
    <li className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-0.5 px-3 py-1.5 text-sm sm:grid-cols-[auto_minmax(0,1fr)_4.5rem_5rem_4rem_6.5rem_3rem] ${done || gone ? "text-neutral-400" : ""}`}>
      <input type="checkbox" className="mt-1" aria-label={`plan ${r.item.name}`} checked={ticked} disabled={done || gone} onChange={(e) => onMark(e.target.checked ? "todo" : "skip")} />
      <span className={`min-w-0 ${!ticked && !done ? "text-neutral-500" : ""}`}>
        {r.item.name}
        {r.why && ticked ? <span className="block text-xs text-neutral-400">{r.why}</span> : null}
      </span>
      <span className="text-xs text-neutral-500 sm:text-left">{KIND_SHORT[r.item.kind] ?? r.item.kind}</span>
      <span className="col-start-2 text-xs tabular-nums sm:col-start-auto sm:text-right sm:text-sm">{r.primos ? n0(r.primos) : "—"}{r.intertwined ? <span className="text-xs text-neutral-500"> +{n1(r.intertwined)}f</span> : null}</span>
      <span className="text-xs text-neutral-500 sm:text-right">{hrs(r.minutes)}</span>
      <span className="text-xs">{outcome}</span>
      <span className="text-right">
        {done ? <button type="button" className="text-xs underline" onClick={() => onMark("todo")}>undo</button>
          : !gone ? <button type="button" className="text-xs text-neutral-500 underline" onClick={() => onMark("done")}>done</button> : null}
      </span>
    </li>
  );
}
