import { HSR_DATA } from "@/data/farm/hsr";
import type { HsrNeeds, HsrRuns, HsrSettings, HsrShort } from "@/lib/farm/hsr";
import { hsrCalyx, hsrInventoryLayout, hsrShadow } from "@/lib/farm/hsr";
import type { AccountPlan } from "@/lib/farm/plan";
import { fmtDay } from "@/lib/farm/schedule";
import type { Character, FarmInventoryRow, GameAccount } from "@/lib/types";
import { addBuild, deleteBuild, saveFarmSettings, updateBuild } from "./actions";

export type HsrPlan = AccountPlan<HsrSettings, HsrNeeds, HsrShort, HsrRuns>;
type Banner = { key: string; label: string };
const n0 = (x: number) => Math.round(x).toLocaleString();
const BONUS = ["Before A2", "A2 group", "A4 group", "A6 + Lv75/80"];

function extraLabel(ch: Character | undefined, farm: Record<string, unknown>) {
  const path = String(ch?.weapon_type ?? "");
  const m = Number(farm.extra_max ?? 0) || 0;
  if (!m) return null;
  return path === "Remembrance" ? "Memo skill" : "Elation skill";
}

/** Builds table + add form (HSR). */
export function HsrBuilds({ id, plan, banners, canEdit, characters, staminaName }: { id: string; plan: HsrPlan; banners: Banner[]; canEdit: boolean; characters: Character[]; staminaName: string }) {
  const s = plan.settings;
  const lcs = HSR_DATA.lcs;
  return (
    <>
      <table className="table">
        <thead>
          <tr>
            <th>#</th><th>Character</th><th>Lv</th><th>Basic</th><th>Skill</th><th>Ult</th><th>Talent</th><th>Extra</th><th>Bonus traces to add</th><th>Light cone</th><th>Deadline</th>
            <th>{staminaName}</th><th>Finish</th><th>Soonest</th><th>Status</th>{canEdit && <th></th>}
          </tr>
        </thead>
        <tbody>
          {plan.rows.map((r) => {
            const i = r.build.inputs as Record<string, unknown>;
            const v = (k: string) => (i[k] === undefined || i[k] === null ? "" : String(i[k]));
            const f = `b-${r.build.id}`;
            const bonus = Array.isArray(i.bonus) ? (i.bonus as boolean[]) : [false, false, false, false];
            const pair = (now: string, goal: string, hi: number, on = true) => !on ? <span className="text-neutral-400">—</span> : canEdit
              ? <span className="whitespace-nowrap"><input form={f} className="input w-12" name={now} defaultValue={v(now)} placeholder="1" /> → <input form={f} className="input w-12" name={goal} defaultValue={v(goal)} placeholder={String(hi)} /></span>
              : <span>{v(now) || 1} → {v(goal) || v(now) || 1}</span>;
            const extra = extraLabel(r.ch, (r.ch.farm ?? {}) as Record<string, unknown>);
            return (
              <tr key={r.build.id}>
                <td>
                  {canEdit && <form action={updateBuild} id={f} className="contents"><input type="hidden" name="account_id" value={id} /><input type="hidden" name="build_id" value={r.build.id} /></form>}
                  {canEdit ? <input form={f} className="input w-12" name="priority" defaultValue={r.build.priority} /> : r.build.priority}
                </td>
                <td className="font-medium">{r.ch.name}<div className="text-xs font-normal text-neutral-500">{r.needs.path} · {r.needs.family}{r.needs.bossMat ? ` · ${r.needs.bossMat}` : ""}{r.needs.weeklyMat ? ` · ${r.needs.weeklyMat}` : ""}</div></td>
                <td>{pair("lv_now", "lv_goal", 80)}</td>
                <td>{pair("basic_now", "basic_goal", 6)}</td>
                <td>{pair("skill_now", "skill_goal", 10)}</td>
                <td>{pair("ult_now", "ult_goal", 10)}</td>
                <td>{pair("talent_now", "talent_goal", 10)}</td>
                <td>
                  {extra ? <span className="flex flex-col gap-1 text-xs"><span>{extra} {pair("extra_now", "extra_goal", r.needs.extraMax)}</span>{r.needs.extra2Max > 0 && <span>Memo talent {pair("extra2_now", "extra2_goal", r.needs.extra2Max)}</span>}</span> : <span className="text-neutral-400">—</span>}
                </td>
                <td className="whitespace-nowrap text-xs">
                  {BONUS.map((lab, g) => canEdit
                    ? <label key={g} className="mr-1"><input form={f} type="checkbox" name={`bonus_${g}`} defaultChecked={bonus[g]} /> {lab}</label>
                    : <span key={g} className={bonus[g] ? "mr-1" : "mr-1 text-neutral-400"}>{bonus[g] ? "☑" : "☐"} {lab}</span>)}
                </td>
                <td>
                  {canEdit ? (
                    <span className="flex flex-col gap-1">
                      <select form={f} className="input w-44" name="lc" defaultValue={v("lc")}><option value="">(no light cone)</option>{lcs.map((x) => <option key={x.name} value={x.name}>{x.stars}★ {x.name}</option>)}</select>
                      {pair("lc_now", "lc_goal", 80)}
                    </span>
                  ) : i.lc ? `${r.needs.lcStars}★ ${i.lc} ${v("lc_now") || 1} → ${v("lc_goal") || v("lc_now") || 1}` : "—"}
                </td>
                <td>
                  {canEdit ? (
                    <span className="flex flex-col gap-1">
                      <input form={f} className="input w-32" type="date" name="deadline" defaultValue={r.build.deadline ?? ""} />
                      <select form={f} className="input w-32" name="banner" defaultValue={r.build.banner ?? ""}><option value="">(or by banner)</option>{banners.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}</select>
                    </span>
                  ) : r.deadline !== null ? fmtDay(r.deadline) : "—"}
                </td>
                <td className="whitespace-nowrap">{n0(r.resin)}<div className="text-xs text-neutral-500">{Math.round((r.resin / (s.staminaPerDay || 240)) * 10) / 10} d</div></td>
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
          {plan.rows.length === 0 && <tr><td colSpan={16} className="text-neutral-500">No builds yet — add a character below.</td></tr>}
        </tbody>
      </table>
      <details className="text-sm">
        <summary className="cursor-pointer text-neutral-600">Materials & runs per build</summary>
        <table className="table mt-2">
          <thead><tr><th>Character</th><th>EXP</th><th>Credits</th><th>Boss mats</th><th>Trace (T3-eq)</th><th>Weekly</th><th>LC EXP</th><th>LC trace (T3-eq)</th><th>Runs left: shadow · trace · LC trace · EXP · LC EXP · credits · Echo</th></tr></thead>
          <tbody>
            {plan.rows.map((r) => (
              <tr key={r.build.id}>
                <td>{r.ch.name}</td><td>{n0(r.needs.exp)}</td><td>{n0(r.needs.credits)}</td><td>{n0(r.needs.boss)}</td><td>{Math.round(r.needs.trace * 10) / 10}</td><td>{n0(r.needs.weekly)}</td><td>{n0(r.needs.lcExp)}</td><td>{Math.round(r.needs.lcTrace * 10) / 10}</td>
                <td>{r.runs.boss} · {r.runs.trace} · {r.runs.lcTrace} · {r.runs.exp} · {r.runs.lcExp} · {r.runs.credit} · {r.runs.weekly}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-xs text-neutral-500">Needs are before inventory. Runs are after what the account owns (Inventory) and what was logged since the last inventory count, for the “{s.dropCase}” drop-rate case. Trace mats count 3 lower = 1 higher (Omni-Synthesizer).</p>
      </details>
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
          <label className="label">Lv now → goal<span className="flex gap-1"><input className="input w-14" name="lv_now" placeholder="1" /><input className="input w-14" name="lv_goal" placeholder="80" /></span></label>
          <label className="label">Basic<span className="flex gap-1"><input className="input w-12" name="basic_now" placeholder="1" /><input className="input w-12" name="basic_goal" placeholder="1" /></span></label>
          <label className="label">Skill<span className="flex gap-1"><input className="input w-12" name="skill_now" placeholder="1" /><input className="input w-12" name="skill_goal" placeholder="1" /></span></label>
          <label className="label">Ult<span className="flex gap-1"><input className="input w-12" name="ult_now" placeholder="1" /><input className="input w-12" name="ult_goal" placeholder="1" /></span></label>
          <label className="label">Talent<span className="flex gap-1"><input className="input w-12" name="talent_now" placeholder="1" /><input className="input w-12" name="talent_goal" placeholder="1" /></span></label>
          <label className="label">Memo / Elation skill<span className="flex gap-1"><input className="input w-12" name="extra_now" placeholder="1" /><input className="input w-12" name="extra_goal" placeholder="1" /></span></label>
          <label className="label">Memo talent<span className="flex gap-1"><input className="input w-12" name="extra2_now" placeholder="1" /><input className="input w-12" name="extra2_goal" placeholder="1" /></span></label>
          <span className="label">Bonus traces to add<span className="flex flex-wrap gap-2 text-xs">{BONUS.map((lab, g) => <label key={g}><input type="checkbox" name={`bonus_${g}`} /> {lab}</label>)}</span></span>
          <label className="label">Light cone<span className="flex gap-1"><select className="input w-44" name="lc" defaultValue=""><option value="">(none)</option>{lcs.map((x) => <option key={x.name} value={x.name}>{x.stars}★ {x.name}</option>)}</select><input className="input w-14" name="lc_now" placeholder="1" /><input className="input w-14" name="lc_goal" placeholder="80" /></span></label>
          <label className="label">Deadline<input className="input" type="date" name="deadline" /></label>
          <label className="label">or banner<select className="input" name="banner" defaultValue=""><option value="">—</option>{banners.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}</select></label>
          <button className="btn" type="submit">Add build</button>
          <p className="w-full text-xs text-neutral-500">Blank goal = no change. Basic 1–6; Skill / Ult / Talent 1–10 (12 with Eidolons). Memo / Elation skill: Remembrance memosprite skill (1–6) or Elation skill (1–10); Memo talent: Remembrance only (1–6). Bonus traces: tick each group of side traces still to unlock (Before A2 · A2 · A4 · A6 + Lv75/80). Characters without farming data (new leaks) need their trace family / boss / weekly set on the Characters page first.</p>
        </form>
      )}
    </>
  );
}

/** Account settings form (HSR). */
export function HsrSettingsForm({ id, plan, account, canEdit, staminaName, staminaPerDay }: { id: string; plan: HsrPlan; account: GameAccount; canEdit: boolean; staminaName: string; staminaPerDay: number }) {
  const s = plan.settings;
  const acc = (account.settings ?? {}) as Record<string, unknown>;
  return (
    <form action={saveFarmSettings} className="mt-3 grid gap-3 sm:grid-cols-4">
      <input type="hidden" name="account_id" value={id} />
      <label className="label">Equilibrium Level (0–6)<input className="input" name="eq" defaultValue={String(acc.eq ?? "")} placeholder="6" disabled={!canEdit} /></label>
      <label className="label">{staminaName} / day<input className="input" name="stamina_per_day" defaultValue={String(acc.stamina_per_day ?? "")} placeholder={String(staminaPerDay)} disabled={!canEdit} /></label>
      <label className="label">Extra TP per week<input className="input" name="extra_week" defaultValue={String(acc.extra_week ?? "")} placeholder="0" disabled={!canEdit} /></label>
      <label className="label">Fuel owned (60 TP each)<input className="input" name="fuel" defaultValue={String(acc.fuel ?? "")} placeholder="0" disabled={!canEdit} /></label>
      <label className="label">Reserved TP you can withdraw<input className="input" name="reserve" defaultValue={String(acc.reserve ?? "")} placeholder="0" disabled={!canEdit} /></label>
      <label className="label">Bank between days (0 = leftovers → relics)<input className="input" name="bank_cap" defaultValue={String(acc.bank_cap ?? "")} placeholder="0" disabled={!canEdit} /></label>
      <label className="label">Echo of War claims per week<input className="input" name="echo" defaultValue={String(acc.echo ?? "")} placeholder="3" disabled={!canEdit} /></label>
      <label className="label">Drop-rate case<select className="input" name="drop_case" defaultValue={s.dropCase} disabled={!canEdit}><option value="avg">Average</option><option value="p80">Pessimistic (80%)</option><option value="worst">Worst</option><option value="best">Best</option></select></label>
      <label className="label">Plan order<select className="input" name="order" defaultValue={s.order} disabled={!canEdit}><option value="priority">My priority (#)</option><option value="deadline">Earliest deadline first</option></select></label>
      <label className="label">Plan Echo of War on<select className="input" name="weekly_day" defaultValue={String(s.weeklyDay)} disabled={!canEdit}><option value="-1">Any day</option>{[1, 2, 3, 4, 5, 6, 0].map((d) => <option key={d} value={d}>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]}</option>)}</select></label>
      <label className="label">Days off (e.g. “Sat, Sun”)<input className="input" name="days_off" defaultValue={s.daysOff} disabled={!canEdit} /></label>
      <div className="flex flex-col gap-1 self-end">
        <label><input type="checkbox" name="gold" defaultChecked={s.gold} disabled={!canEdit} /> Farm EXP & credits with TP (Bud of Memories / Treasures)</label>
        <label><input type="checkbox" name="lcexp" defaultChecked={s.lcexp} disabled={!canEdit} /> Farm light cone EXP with TP (Bud of Aether)</label>
      </div>
      {canEdit && <div className="self-end"><button className="btn" type="submit">Save settings</button></div>}
    </form>
  );
}

const n1 = (x: number) => (Math.round(x * 10) / 10).toLocaleString();

/** Inventory sections (HSR) — rendered inside the save form. */
export function HsrInventory({ plan, inventory, canEdit }: { plan: HsrPlan; inventory: FarmInventoryRow[]; canEdit: boolean }) {
  const L = hsrInventoryLayout();
  const q = (kind: string, key = "") => { const r = inventory.find((x) => x.kind === kind && x.key === key); return r ? String(r.qty) : ""; };
  const need = { fam: new Map<string, number>(), boss: new Map<string, number>(), wk: new Map<string, number>(), credits: 0, exp: 0, lcExp: 0 };
  const short = { fam: new Map<string, number>(), boss: new Map<string, number>(), wk: new Map<string, number>(), credits: 0, exp: 0, lcExp: 0 };
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  for (const r of plan.rows) {
    add(need.fam, r.needs.family, r.needs.trace); add(short.fam, r.needs.family, r.short.trace);
    if (r.needs.lcFamily) { add(need.fam, r.needs.lcFamily, r.needs.lcTrace); add(short.fam, r.needs.lcFamily, r.short.lcTrace); }
    add(need.boss, r.needs.bossMat, r.needs.boss); add(short.boss, r.needs.bossMat, r.short.boss);
    add(need.wk, r.needs.weeklyMat, r.needs.weekly); add(short.wk, r.needs.weeklyMat, r.short.weekly);
    need.credits += r.needs.credits; short.credits += r.short.credits; need.exp += r.needs.exp; short.exp += r.short.exp; need.lcExp += r.needs.lcExp; short.lcExp += r.short.lcExp;
  }
  const inp = (kind: string, key: string, cls = "w-20") => <input className={`input ${cls}`} name={`${kind}|${key}`} defaultValue={q(kind, key)} disabled={!canEdit} inputMode="numeric" />;
  const ns = (nd: number, sh: number) => <><td>{nd ? n1(nd) : ""}</td><td className={sh > 0 ? "font-medium text-red-700" : ""}>{sh > 0 ? n1(sh) : ""}</td></>;
  const expHave = (Number(q("tg")) || 0) * 20000 + (Number(q("al")) || 0) * 5000 + (Number(q("te")) || 0) * 1000;
  const lcExpHave = (Number(q("ra")) || 0) * 6000 + (Number(q("ca")) || 0) * 2000 + (Number(q("sa")) || 0) * 500;
  return (
    <>
      <section className="card">
        <h2 className="mb-2 font-medium">Global</h2>
        <table className="table"><thead><tr><th>Item</th><th>Have</th><th>Need</th><th>Short by</th></tr></thead>
          <tbody>
            {L.global.map(([kind, key, label]) => (
              <tr key={kind}><td>{label}</td><td>{inp(kind, key, "w-28")}</td>
                {kind === "credit" ? ns(need.credits, short.credits) : kind === "tg" ? <><td>{n0(need.exp)} EXP (have {n0(expHave)})</td><td className={short.exp > 0 ? "font-medium text-red-700" : ""}>{short.exp > 0 ? n0(short.exp) : ""}</td></> : kind === "ra" ? <><td>{n0(need.lcExp)} LC EXP (have {n0(lcExpHave)})</td><td className={short.lcExp > 0 ? "font-medium text-red-700" : ""}>{short.lcExp > 0 ? n0(short.lcExp) : ""}</td></> : <><td></td><td></td></>}
              </tr>
            ))}
          </tbody></table>
        <p className="mt-1 text-xs text-neutral-500">EXP needs are in EXP points; the three EXP items pool together (likewise the three Aether items for light cones).</p>
      </section>
      <section className="card">
        <h2 className="mb-2 font-medium">Trace materials (Crimson Calyx, 10 TP)</h2>
        <table className="table"><thead><tr><th>Tier 3</th><th>Tier 1 / Tier 2</th><th>Calyx</th><th>Tier 1</th><th>Tier 2</th><th>Tier 3</th><th>Have (T3-eq)</th><th>Need</th><th>Short by</th></tr></thead>
          <tbody>
            {L.families.map((f) => {
              const have = (Number(q("famT1", f.t3)) || 0) / 9 + (Number(q("famT2", f.t3)) || 0) / 3 + (Number(q("famT3", f.t3)) || 0);
              return <tr key={f.t3}><td>{f.t3}</td><td className="text-neutral-500">{f.t1} / {f.t2}</td><td className="text-neutral-500">{f.calyx}</td><td>{inp("famT1", f.t3, "w-16")}</td><td>{inp("famT2", f.t3, "w-16")}</td><td>{inp("famT3", f.t3, "w-16")}</td><td>{n1(have)}</td>{ns(need.fam.get(f.t3) ?? 0, short.fam.get(f.t3) ?? 0)}</tr>;
            })}
          </tbody></table>
      </section>
      <section className="card">
        <h2 className="mb-2 font-medium">Boss materials (Stagnant Shadow, 30 TP)</h2>
        <table className="table"><thead><tr><th>Material</th><th>Stagnant Shadow</th><th>Have</th><th>Need</th><th>Short by</th></tr></thead>
          <tbody>
            {L.bosses.map((b) => <tr key={b.mat}><td>{b.mat}</td><td className="text-neutral-500">{b.shadow || "—"}</td><td>{inp("boss", b.mat, "w-16")}</td>{ns(need.boss.get(b.mat) ?? 0, short.boss.get(b.mat) ?? 0)}</tr>)}
          </tbody></table>
      </section>
      <section className="card">
        <h2 className="mb-2 font-medium">Weekly materials (Echo of War, 30 TP, 3 rewarded runs a week)</h2>
        <table className="table"><thead><tr><th>Material</th><th>Echo of War</th><th>Have</th><th>Need</th><th>Short by</th></tr></thead>
          <tbody>
            {L.weeklies.map((w) => <tr key={w.mat}><td>{w.mat}</td><td className="text-neutral-500">{w.echo}</td><td>{inp("wk", w.mat, "w-16")}</td>{ns(need.wk.get(w.mat) ?? 0, short.wk.get(w.mat) ?? 0)}</tr>)}
          </tbody></table>
      </section>
    </>
  );
}

export { hsrCalyx, hsrShadow };

/** Log table columns and real-drop fields (HSR). */
export const HSR_LOG = {
  cols: [["boss", "Shadow"], ["trace", "Trace"], ["lcTrace", "LC trace"], ["exp", "EXP"], ["lcExp", "LC EXP"], ["credit", "Credits"]] as [string, string][],
  drops: [["traceT1", "Trace T1"], ["traceT2", "T2"], ["traceT3", "T3"], ["lcT1", "LC T1"], ["lcT2", "LC T2"], ["lcT3", "LC T3"], ["boss", "Boss"], ["wk", "Weekly"]] as [string, string][],
};
