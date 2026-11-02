"use client";

/**
 * Primogem forecast = regular income (settings) + the account's plan (items picked from the shared database).
 * Everything runs in the browser (the forecast engine is pure) and autosaves a moment after each change.
 */
import { useEffect, useMemo, useState } from "react";
import type { IncomeItem, IncomePlanEntry } from "@/lib/types";
import type { VersionRow } from "@/lib/calendar";
import { vkey } from "@/lib/calendar";
import { abyssPrimos, forecast, GROUPS, incomeSettings, isPlannable, planValue, pullsOf, stygianPrimos, theaterPrimos, type ScheduleRow } from "@/lib/income/forecast";
import { fmtDay, isoDay, parseDay } from "@/lib/farm/schedule";
import { savePlan } from "./actions";

type Raw = Record<string, unknown>;
type Plan = Record<string, IncomePlanEntry>;
type Phase = { key: string; label: string; day: number; featured: string };
type Props = {
  accountId: string; canEdit: boolean; items: IncomeItem[]; plan: Plan; raw: Raw;
  rows: VersionRow[]; today: number; current: string | null; phases: Phase[]; initialUntil: number;
};

const n0 = (x: number) => Math.round(x).toLocaleString();
const n1 = (x: number) => (Math.round(x * 10) / 10).toLocaleString();
const hrs = (m: number) => (m >= 60 ? `${n1(m / 60)} h` : `${Math.round(m)} min`);
const KINDS = [["event", "Events"], ["archon", "Archon"], ["story", "Story"], ["world", "World"], ["exploration", "Exploration"], ["endgame", "Endgame"], ["other", "Other"]] as const;
const KIND_SHORT: Record<string, string> = { event: "Event", archon: "Archon", story: "Story", world: "World", exploration: "Explore", endgame: "Endgame", other: "Other" };
const ORDER: Record<string, number> = { event: 0, archon: 1, story: 2, world: 3, exploration: 4, endgame: 5, other: 6 };
const NEW: IncomePlanEntry = { status: "todo", amount: null, counts: null, primos_override: null };
const same = (a: IncomePlanEntry | undefined, b: IncomePlanEntry | undefined) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/** Items worth doing partly: exploration / events / anything with chest pools. */
const partial = (it: IncomeItem) => !!it.pools?.length || it.kind === "exploration" || it.kind === "event";

export function IncomePlanner(p: Props) {
  const [raw, setRaw] = useState<Raw>(p.raw);
  const [plan, setPlan] = useState<Plan>(p.plan);
  const [saved, setSaved] = useState({ raw: p.raw, plan: p.plan });
  const [saveState, setSaveState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const [until, setUntil] = useState(p.initialUntil);
  const [tab, setTab] = useState<"plan" | "db">(Object.keys(p.plan).length ? "plan" : "db");

  const s = useMemo(() => incomeSettings(raw), [raw]);
  const planMap = useMemo(() => new Map(Object.entries(plan)), [plan]);
  const horizon = Math.max(until, p.today + 182);
  const f = useMemo(() => forecast({ items: p.items, plan: planMap, settings: s, rows: p.rows, today: p.today, until: horizon }), [p.items, planMap, s, p.rows, p.today, horizon]);
  const at = f.at(until), now = f.at(p.today);
  const vrow = useMemo(() => new Map(p.rows.map((r) => [r.version, r])), [p.rows]);

  // ---- autosave: what differs from the last saved state goes to the server a moment after the last change
  const changes = useMemo(() => {
    const d: Record<string, IncomePlanEntry | null> = {};
    for (const id of new Set([...Object.keys(saved.plan), ...Object.keys(plan)])) if (!same(saved.plan[id], plan[id])) d[id] = plan[id] ?? null;
    return d;
  }, [plan, saved.plan]);
  const settingsDirty = JSON.stringify(raw) !== JSON.stringify(saved.raw);
  const dirty = settingsDirty || Object.keys(changes).length > 0;
  useEffect(() => {
    if (!p.canEdit || !dirty || saveState.busy || saveState.error) return;
    const t = setTimeout(async () => {
      const snap = { raw, plan };
      setSaveState({ busy: true, error: null });
      const res = await savePlan(p.accountId, settingsDirty ? raw : null, changes).catch((e: Error) => ({ error: e.message }));
      if (res.error) setSaveState({ busy: false, error: res.error });
      else { setSaved(snap); setSaveState({ busy: false, error: null }); }
    }, 800);
    return () => clearTimeout(t);
  }, [dirty, changes, raw, plan, settingsDirty, saveState.busy, saveState.error, p.canEdit, p.accountId]);
  useEffect(() => {
    if (!dirty || !p.canEdit) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, p.canEdit]);

  const set = (k: string, v: unknown) => setRaw((r) => ({ ...r, [k]: v }));
  const addItems = (ids: string[], status: "todo" | "done" = "todo") => setPlan((pl) => { const n = { ...pl }; for (const id of ids) n[id] = { ...(n[id] ?? NEW), status }; return n; });
  const removeItem = (id: string) => setPlan((pl) => { const n = { ...pl }; delete n[id]; return n; });
  const patch = (id: string, x: Partial<IncomePlanEntry>) => setPlan((pl) => ({ ...pl, [id]: { ...(pl[id] ?? NEW), ...x } }));

  const planned = f.schedule.filter((r) => r.status !== "done");
  const missed = planned.filter((r) => r.status === "missed").length;
  const gone = planned.filter((r) => r.status === "gone").length;
  const late = planned.filter((r) => r.status === "later" || (r.status === "scheduled" && r.day !== null && r.day > until)).length;
  const minutesPlanned = planned.filter((r) => r.status !== "gone").reduce((a, r) => a + r.minutes, 0);
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
      <div className="flex min-w-0 flex-col gap-5">
        {/* ---------------- account: what you have + regular income ---------------- */}
        <details className="card" open={Object.keys(p.raw).length === 0}>
          <summary className="cursor-pointer font-medium">Account &amp; regular income <span className="text-sm font-normal text-neutral-500">— {n0(s.primos)} primos, {n1(s.intertwined)} fates · {s.welkinUntil !== null && s.welkinUntil >= p.today ? "Welkin" : "no Welkin"} · BP {s.bp === "paid" ? "paid" : s.bp === "free" ? "free" : "off"} · Abyss {s.abyssStars}★ · Theater {s.theaterActs} acts · {s.hoursPerWeek ? `${s.hoursPerWeek} h/week` : "no time limit"}</span></summary>
          <div className="mt-4 grid gap-5">
            <fieldset className="grid gap-3 sm:grid-cols-4">
              <legend className="mb-2 text-sm font-medium">What you have</legend>
              <label className={field}>Primogems<input className="input" inputMode="numeric" value={String(raw.primos ?? "")} placeholder="0" onChange={(e) => set("primos", e.target.value)} /></label>
              <label className={field}>Intertwined Fates<input className="input" inputMode="numeric" value={String(raw.intertwined ?? "")} placeholder="0" onChange={(e) => set("intertwined", e.target.value)} /></label>
              <label className={field}>Acquaint Fates<input className="input" inputMode="numeric" value={String(raw.acquaint ?? "")} placeholder="0" onChange={(e) => set("acquaint", e.target.value)} /></label>
              <label className={field}>Counted on<input className="input" type="date" value={String(raw.as_of ?? isoDay(p.today))} onChange={(e) => set("as_of", e.target.value)} /></label>
            </fieldset>
            <fieldset className="grid gap-3 sm:grid-cols-4">
              <legend className="mb-2 text-sm font-medium">Every day / every version</legend>
              <label className={field}>Welkin Moon until
                <span className="flex gap-1"><input className="input" type="date" value={String(raw.welkin_until ?? "")} onChange={(e) => set("welkin_until", e.target.value)} />{raw.welkin_until ? <button type="button" className="text-xs underline" onClick={() => set("welkin_until", "")}>none</button> : null}</span>
              </label>
              <label className={field}>Battle Pass
                <select className="input" value={s.bp} onChange={(e) => set("bp", e.target.value)}><option value="none">Not levelling it</option><option value="free">Free track (60 + 5 Acquaint)</option><option value="paid">Gnostic Hymn (+680 + 4 fates)</option></select>
              </label>
              <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={s.commissions} onChange={(e) => set("commissions", e.target.checked)} /> Daily commissions (60/day)</label>
              <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={s.web} onChange={(e) => set("web", e.target.checked)} /> Codes, mail, check-in</label>
            </fieldset>
            <fieldset className="grid gap-3 sm:grid-cols-4">
              <legend className="mb-2 text-sm font-medium">Endgame each reset, and play time</legend>
              <label className={field}>Spiral Abyss (16th)
                <select className="input" value={s.abyssStars} onChange={(e) => set("abyss_stars", Number(e.target.value))}>
                  {[0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36].map((x) => <option key={x} value={x}>{x === 0 ? "Don't play" : `${x}★`} — {abyssPrimos(x)}</option>)}
                </select>
              </label>
              <label className={field}>Imaginarium Theater (1st)
                <select className="input" value={s.theaterActs} onChange={(e) => set("theater_acts", Number(e.target.value))}>
                  {Array.from({ length: 13 }, (_, x) => <option key={x} value={x}>{x === 0 ? "Don't play" : `${x} acts`} — {theaterPrimos(x)}</option>)}
                </select>
              </label>
              <label className={field}>Stygian Onslaught
                <select className="input" value={s.stygian} onChange={(e) => set("stygian", Number(e.target.value))}>
                  {["Don't play", "I Normal", "II Advancing", "III Hard", "IV Menacing", "V Fearless", "VI Dire"].map((lab, x) => <option key={x} value={x}>{lab} — {stygianPrimos(x)}</option>)}
                </select>
              </label>
              <label className={field}>Play time for your plan
                <select className="input" value={s.hoursPerWeek} onChange={(e) => set("hours_per_week", Number(e.target.value))}>
                  {[0, 2, 3, 5, 7, 10, 14, 21, 28].map((x) => <option key={x} value={x}>{x === 0 ? "No limit" : `${x} h / week`}</option>)}
                </select>
              </label>
            </fieldset>
          </div>
        </details>

        {/* ---------------- tabs: plan / database ---------------- */}
        <div className="flex items-end gap-1 border-b border-neutral-200">
          {([["plan", `My plan (${planned.length})`], ["db", "Add from the database"]] as const).map(([k, lab]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={`-mb-px rounded-t border px-3 py-1.5 text-sm ${tab === k ? "border-neutral-200 border-b-white bg-white font-medium" : "border-transparent text-neutral-500"}`}>{lab}</button>
          ))}
        </div>
        {tab === "plan"
          ? <PlanList p={p} f={f.schedule} plan={plan} until={until} vrow={vrow} onRemove={removeItem} onPatch={patch} onBrowse={() => setTab("db")} onAdd={addItems} />
          : <Database p={p} plan={plan} vrow={vrow} onAdd={addItems} onRemove={removeItem} />}
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
            {planned.length ? <>{planned.length} things in your plan · {hrs(minutesPlanned)} of play{Number.isFinite(minutesFree) ? ` (you have ~${hrs(minutesFree)} by then)` : ""}</> : "Plan is empty — only regular income counts."}
            {missed > 0 && <div className="text-red-700">{missed} event{missed > 1 ? "s" : ""} won&apos;t fit before {missed > 1 ? "they end" : "it ends"} — remove, or add play time</div>}
            {gone > 0 && <div className="text-neutral-500">{gone} event{gone > 1 ? "s are" : " is"} already over</div>}
            {late > 0 && <div className="text-amber-700">{late} planned item{late > 1 ? "s" : ""} finish after this date</div>}
          </div>
          <div className="border-t border-neutral-100 pt-2 text-xs text-neutral-500">
            {!p.canEdit ? "View only — you can try things out, but changes aren't saved."
              : saveState.error ? <span className="text-red-700">Not saved: {saveState.error} <button type="button" className="underline" onClick={() => setSaveState({ busy: false, error: null })}>retry</button></span>
              : saveState.busy ? "Saving…" : dirty ? "Unsaved changes…" : "All changes saved"}
          </div>
        </div>

        <div className="card text-sm">
          <h3 className="mb-1 font-medium">Where it comes from</h3>
          <table className="w-full text-xs">
            <tbody>
              {GROUPS.map((g) => {
                let pr = 0, fi = 0;
                for (const c of f.credits) if (c.group === g && c.day <= until) { pr += c.primos; fi += c.intertwined; }
                if (!pr && !fi) return null;
                return <tr key={g}><td className="py-0.5 pr-2">{g === "Events" || g === "Quests & exploration" ? `${g} (plan)` : g}</td><td className="text-right tabular-nums">{n1(pullsOf(pr, fi))}</td></tr>;
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

/* =============================== My plan =============================== */

function PlanList({ p, f, plan, until, vrow, onRemove, onPatch, onBrowse, onAdd }: {
  p: Props; f: ScheduleRow[]; plan: Plan; until: number; vrow: Map<string, VersionRow>;
  onRemove: (id: string) => void; onPatch: (id: string, x: Partial<IncomePlanEntry>) => void; onBrowse: () => void; onAdd: (ids: string[]) => void;
}) {
  const [showDone, setShowDone] = useState(false);
  const rows = f.filter((r) => showDone || r.status !== "done");
  const doneCount = f.filter((r) => r.status === "done").length;
  const byVersion = new Map<string, ScheduleRow[]>();
  for (const r of rows) { const l = byVersion.get(r.item.version) ?? []; l.push(r); byVersion.set(r.item.version, l); }
  const versions = [...byVersion.keys()].sort((a, b) => vkey(a) - vkey(b));

  if (!f.length) {
    // empty plan: offer the two obvious starting points
    const cur = p.current ? vkey(p.current) : 0;
    const open = p.items.filter((i) => isPlannable(i) && !i.is_estimate && vkey(i.version) >= cur && !(i.section === "event" && (vrow.get(i.version)?.end ?? Infinity) < p.today));
    const est = p.items.filter((i) => isPlannable(i) && i.is_estimate && vkey(i.version) > cur);
    return (
      <div className="card flex flex-col gap-3 text-sm">
        <p><b>Your plan is empty</b>, so the estimate only has regular income. Add the quests, events and exploration you&apos;ll actually do — only what&apos;s in your plan counts.</p>
        <div className="flex flex-wrap gap-2">
            {open.length > 0 && <button type="button" className="btn" onClick={() => onAdd(open.map((i) => i.id))}>Add everything out now ({open.length} items, {p.current}+)</button>}
            {est.length > 0 && <button type="button" className="btn-secondary" onClick={() => onAdd(est.map((i) => i.id))}>Add the estimates for future versions ({est.length})</button>}
            <button type="button" className="btn-secondary" onClick={onBrowse}>Pick from the database</button>
        </div>
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-600">
        <span>Soonest first. Set how much of each you&apos;ll do; change the primogem value if yours differs.</span>
        {doneCount > 0 && <label className="ml-auto flex items-center gap-1 text-xs"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> show {doneCount} done</label>}
      </div>
      {versions.map((v) => {
        const list = byVersion.get(v)!.slice().sort((a, b) => (ORDER[a.item.kind] ?? 9) - (ORDER[b.item.kind] ?? 9) || a.item.seq - b.item.seq);
        const vr = vrow.get(v);
        const active = list.filter((r) => r.status !== "done" && r.status !== "gone");
        return (
          <div key={v} className="rounded border border-neutral-200">
            <div className="flex flex-wrap items-baseline gap-x-3 bg-neutral-50 px-3 py-2">
              <span className="font-medium">{v}{list.every((r) => r.item.is_estimate) ? " (estimate)" : ""}</span>
              {vr && <span className="text-xs text-neutral-500">{fmtDay(vr.start)} – {fmtDay(vr.end)}</span>}
              <span className="text-xs text-neutral-600">{active.length} planned · {n0(active.reduce((a, r) => a + r.primos, 0))} primos · {hrs(active.reduce((a, r) => a + r.minutes, 0))}</span>
            </div>
            <ul className="divide-y divide-neutral-100">
              {list.map((r) => <PlanRow key={r.item.id} r={r} e={plan[r.item.id]} until={until} onRemove={() => onRemove(r.item.id)} onPatch={(x) => onPatch(r.item.id, x)} />)}
            </ul>
          </div>
        );
      })}
      <p className="text-xs text-neutral-500">Planned items are worked through at your play time (events first, by end date; archon acts in order). A quest whose prerequisite isn&apos;t in your plan is taken as already unlocked. Times are rough. Numbers: the Genshin Bookkeeping sheet (sectoidfodder) — see Bookkeeping.</p>
    </section>
  );
}

function PlanRow({ r, e, until, onRemove, onPatch }: { r: ScheduleRow; e: IncomePlanEntry | undefined; until: number; onRemove: () => void; onPatch: (x: Partial<IncomePlanEntry>) => void }) {
  const it = r.item;
  const [chests, setChests] = useState(false);
  const [editPrimos, setEditPrimos] = useState(false);
  const done = r.status === "done", gone = r.status === "gone";
  let outcome: React.ReactNode = null;
  if (done) outcome = <span className="text-neutral-400">done</span>;
  else if (r.status === "scheduled" && r.day !== null) outcome = <span className={r.day > until ? "text-amber-700" : "text-neutral-600"}>by {fmtDay(r.day)}</span>;
  else if (r.status === "missed") outcome = <span className="text-red-700">won&apos;t fit in time</span>;
  else if (r.status === "later") outcome = <span className="text-amber-700">not by then</span>;
  else if (gone) outcome = <span className="text-neutral-400">event over</span>;
  const pct = e?.amount ?? 100;
  const opened = it.pools?.length ? it.pools.reduce((a, pl) => a + Math.min(pl.count, e?.counts?.[pl.key] ?? pl.count), 0) : 0;
  const allChests = it.pools?.reduce((a, pl) => a + pl.count, 0) ?? 0;
  return (
    <li className={`px-3 py-1.5 text-sm ${done || gone ? "text-neutral-400" : ""}`}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,1fr)_7rem_5.5rem_8.5rem_6.5rem]">
        <span className="min-w-0">
          {it.name}
          <span className="ml-1 text-xs text-neutral-400">{KIND_SHORT[it.kind] ?? it.kind}{it.region ? ` · ${it.region}` : ""}</span>
        </span>
        <span className="text-xs">
          {it.pools?.length && !done ? (
            <button type="button" className="underline decoration-neutral-300" onClick={() => setChests((x) => !x)}>{e?.counts ? `${opened} / ${allChests} chests` : `all ${allChests} chests`}</button>
          ) : partial(it) && !done ? (
            <label className="flex items-center gap-1">
              <input className="input w-16 px-1 py-0.5 text-xs" type="number" min={0} max={100} step={5} value={pct} aria-label={`how much of ${it.name}`}
                onChange={(ev) => onPatch({ amount: ev.target.value === "" || Number(ev.target.value) >= 100 ? null : Math.max(0, Number(ev.target.value)) })} />%
            </label>
          ) : null}
        </span>
        <span className="text-xs tabular-nums sm:text-right sm:text-sm">
          {editPrimos ? (
            <input className="input w-20 px-1 py-0.5 text-xs" autoFocus inputMode="numeric" defaultValue={String(e?.primos_override ?? it.primos)} aria-label="your primogem value"
              onBlur={(ev) => { const v = ev.target.value.trim(); onPatch({ primos_override: v === "" || Number(v) === it.primos || isNaN(Number(v)) ? null : Number(v) }); setEditPrimos(false); }}
              onKeyDown={(ev) => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur(); if (ev.key === "Escape") setEditPrimos(false); }} />
          ) : (
            <button type="button" title="Change the primogem value for this account" className={`underline decoration-dotted ${e?.primos_override !== null && e?.primos_override !== undefined ? "text-violet-700" : "decoration-neutral-300"}`} onClick={() => setEditPrimos(true)}>
              {n0(r.primos)}{r.intertwined ? ` +${n1(r.intertwined)}f` : ""}
            </button>
          )}
          {e?.primos_override !== null && e?.primos_override !== undefined && !editPrimos && <button type="button" className="ml-1 text-xs text-neutral-400 underline" onClick={() => onPatch({ primos_override: null })} title={`database value: ${n0(it.primos)}`}>reset</button>}
        </span>
        <span className="text-xs">{outcome} <span className="text-neutral-400">· {hrs(r.minutes)}</span></span>
        <span className="flex justify-end gap-2 text-xs">
          {done ? <button type="button" className="underline" onClick={() => onPatch({ status: "todo" })}>undo</button>
            : <button type="button" className="underline" onClick={() => onPatch({ status: "done" })}>done</button>}
          <button type="button" className="text-neutral-500 underline" onClick={onRemove}>remove</button>
        </span>
      </div>
      {r.why && !done && !gone && r.status !== "scheduled" && <div className="text-xs text-neutral-400">{r.why}</div>}
      {chests && it.pools?.length ? (
        <div className="mt-1 flex flex-wrap items-center gap-3 rounded bg-neutral-50 p-2 text-xs">
          <span className="text-neutral-600">Chests you&apos;ll open:</span>
          {it.pools.map((pl) => (
            <label key={pl.key} className="flex items-center gap-1">
              <input className="input w-14 px-1 py-0.5 text-xs" type="number" min={0} max={pl.count} value={e?.counts?.[pl.key] ?? pl.count}
                onChange={(ev) => onPatch({ counts: { ...Object.fromEntries(it.pools!.map((x) => [x.key, e?.counts?.[x.key] ?? x.count])), [pl.key]: Math.max(0, Math.min(pl.count, Number(ev.target.value) || 0)) } })} />
              / {pl.count} {pl.label.toLowerCase()} <span className="text-neutral-400">({pl.each} each)</span>
            </label>
          ))}
          <button type="button" className="underline" onClick={() => onPatch({ counts: null })}>all</button>
          <span className="w-full text-neutral-400">Chest counts are estimates (admins can correct them on Bookkeeping). The rest of this item — puzzles, seelies, challenges — scales with the share of chests you open.</span>
        </div>
      ) : null}
    </li>
  );
}

/* =============================== database =============================== */

function Database({ p, plan, vrow, onAdd, onRemove }: {
  p: Props; plan: Plan; vrow: Map<string, VersionRow>; onAdd: (ids: string[], status?: "todo" | "done") => void; onRemove: (id: string) => void;
}) {
  const cur = p.current ? vkey(p.current) : 0;
  const [ver, setVer] = useState<string>("upcoming");
  const [kinds, setKinds] = useState<Set<string>>(new Set(KINDS.map((k) => k[0])));
  const [region, setRegion] = useState("");
  const [q, setQ] = useState("");
  const [hideMine, setHideMine] = useState(true);
  const [limit, setLimit] = useState(200);

  const all = useMemo(() => p.items.filter(isPlannable), [p.items]);
  const versions = useMemo(() => [...new Set(all.map((i) => i.version))].sort((a, b) => vkey(b) - vkey(a)), [all]);
  const regions = useMemo(() => [...new Set(all.map((i) => i.region).filter((x): x is string => !!x))].sort(), [all]);
  const over = (i: IncomeItem) => i.section === "event" && (vrow.get(i.version)?.end ?? (vkey(i.version) < cur ? -Infinity : Infinity)) < p.today;
  const shown = all.filter((i) => {
    if (ver === "upcoming" ? vkey(i.version) < cur : ver !== "all" && i.version !== ver) return false;
    if (!kinds.has(i.kind)) return false;
    if (region && i.region !== region) return false;
    if (q && !i.name.toLowerCase().includes(q.toLowerCase())) return false;
    if (hideMine && plan[i.id]) return false;
    return true;
  }).sort((a, b) => (ver === "upcoming" ? vkey(a.version) - vkey(b.version) : vkey(b.version) - vkey(a.version)) || (ORDER[a.kind] ?? 9) - (ORDER[b.kind] ?? 9) || a.seq - b.seq);
  const addable = shown.filter((i) => !plan[i.id] && !over(i));
  const page = shown.slice(0, limit);

  return (
    <section className="flex flex-col gap-3">
      <p className="text-sm text-neutral-600">Every quest, event and exploration source we track, with its primogems (from the Bookkeeping sheet — versions not out yet are estimates). Add what you&apos;ll do to your plan; mark things you already finished as done.</p>
      <div className="flex flex-wrap items-center gap-2 rounded border border-neutral-200 bg-neutral-50 p-2 text-sm">
        <select className="input w-auto" value={ver} onChange={(e) => { setVer(e.target.value); setLimit(200); }} aria-label="version">
          <option value="upcoming">Out now &amp; upcoming ({p.current ?? "?"}+)</option>
          <option value="all">All versions</option>
          {versions.map((v) => <option key={v} value={v}>{v}{all.some((i) => i.version === v && i.is_estimate) ? " (estimate)" : ""}</option>)}
        </select>
        <select className="input w-auto" value={region} onChange={(e) => setRegion(e.target.value)} aria-label="region">
          <option value="">Any region</option>
          {regions.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <input className="input w-40" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex flex-wrap gap-1">
          {KINDS.map(([k, lab]) => (
            <button key={k} type="button" onClick={() => setKinds((c) => { const n = new Set(c); if (n.has(k)) n.delete(k); else n.add(k); return n; })}
              className={`rounded-full border px-2 py-0.5 text-xs ${kinds.has(k) ? "border-neutral-800 bg-neutral-800 text-white" : "border-neutral-300 bg-white text-neutral-500"}`}>{lab}</button>
          ))}
        </div>
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={hideMine} onChange={(e) => setHideMine(e.target.checked)} /> hide what&apos;s in my plan</label>
        <span className="ml-auto text-xs text-neutral-600">{shown.length} items · {n0(addable.reduce((a, i) => a + i.primos, 0))} primos addable
          {addable.length > 0 && <button type="button" className="btn ml-2 px-2 py-0.5 text-xs" onClick={() => onAdd(addable.map((i) => i.id))}>Add all {addable.length}</button>}
        </span>
      </div>
      {shown.length === 0 && <p className="text-sm text-neutral-500">Nothing matches{hideMine ? " (items already in your plan are hidden)" : ""}.</p>}
      <ul className="divide-y divide-neutral-100 rounded border border-neutral-200">
        {page.map((i, idx) => {
          const head = idx === 0 || page[idx - 1].version !== i.version ? i.version : null;
          const vr = vrow.get(i.version);
          const e = plan[i.id];
          const isOver = over(i);
          return (
            <li key={i.id}>
              {head && <div className="bg-neutral-50 px-3 py-1 text-xs font-medium text-neutral-600">{head}{vr ? ` · ${fmtDay(vr.start)} – ${fmtDay(vr.end)}` : ""}{vkey(head) < cur ? " · out" : vkey(head) === cur ? " · current" : ""}</div>}
              <div className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-1.5 text-sm sm:grid-cols-[minmax(0,1fr)_5.5rem_4.5rem_9rem] ${isOver && !e ? "text-neutral-400" : ""}`}>
                <span className="min-w-0">
                  {i.name}
                  <span className="ml-1 text-xs text-neutral-400">{KIND_SHORT[i.kind] ?? i.kind}{i.region ? ` · ${i.region}` : ""}{i.pools?.length ? ` · ${i.pools.reduce((a, pl) => a + pl.count, 0)} chests` : ""}{i.section === "event" && vr && !isOver ? ` · until ${fmtDay(vr.end)}` : ""}</span>
                </span>
                <span className="text-right tabular-nums">{n0(i.primos)}{i.intertwined ? <span className="text-xs text-neutral-500"> +{n1(i.intertwined)}f</span> : null}</span>
                <span className="hidden text-right text-xs text-neutral-500 sm:block">{hrs(planValue(i, undefined).minutes)}</span>
                <span className="col-span-2 flex justify-end gap-2 text-xs sm:col-span-1">
                  {e ? <>
                    <span className="text-green-700">{e.status === "done" ? "✓ done" : "✓ in plan"}</span>
                    <button type="button" className="text-neutral-500 underline" onClick={() => onRemove(i.id)}>undo</button>
                  </> : <>
                    {!isOver ? <button type="button" className="btn px-2 py-0.5 text-xs" onClick={() => onAdd([i.id])}>+ Plan</button> : <span className="text-neutral-400">event over</span>}
                    <button type="button" className="underline" title="Already finished — keep it out of the estimate" onClick={() => onAdd([i.id], "done")}>done</button>
                  </>}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {shown.length > limit && <button type="button" className="btn-secondary self-start" onClick={() => setLimit((l) => l + 300)}>Show more ({shown.length - limit} left)</button>}
    </section>
  );
}
