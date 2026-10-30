import { ZZZ_DATA } from "@/data/farm/zzz";
import type { ZzzNeeds, ZzzRuns, ZzzSettings, ZzzShort } from "@/lib/farm/zzz";
import { CORE_LABELS, zzzInventoryLayout } from "@/lib/farm/zzz";
import type { AccountPlan } from "@/lib/farm/plan";
import { fmtDay } from "@/lib/farm/schedule";
import type { Character, FarmInventoryRow, GameAccount } from "@/lib/types";
import { addBuild, deleteBuild, saveFarmSettings, updateBuild } from "./actions";

export type ZzzPlan = AccountPlan<ZzzSettings, ZzzNeeds, ZzzShort, ZzzRuns>;
type Banner = { key: string; label: string };
const n0 = (x: number) => Math.round(x).toLocaleString();
const RANK = (stars: number) => (stars >= 5 ? "S" : stars === 4 ? "A" : "B");

/** Builds table + add form (ZZZ). */
export function ZzzBuilds({ id, plan, banners, canEdit, characters, staminaName }: { id: string; plan: ZzzPlan; banners: Banner[]; canEdit: boolean; characters: Character[]; staminaName: string }) {
  const s = plan.settings;
  const lcs = ZZZ_DATA.lcs;
  const coreSel = (form: string | undefined, name: string, val: string) => (
    <select form={form} className="input w-20" name={name} defaultValue={val}>{CORE_LABELS.map((lab, k) => <option key={k} value={k}>{lab}</option>)}</select>
  );
  return (
    <>
      <table className="table">
        <thead>
          <tr>
            <th>#</th><th>Agent</th><th>Lv</th><th>Basic</th><th>Dodge</th><th>Assist</th><th>Special</th><th>Chain</th><th>Core Skill</th><th>W-Engine</th><th>Deadline</th>
            <th>{staminaName}</th><th>Finish</th><th>Soonest</th><th>Status</th>{canEdit && <th></th>}
          </tr>
        </thead>
        <tbody>
          {plan.rows.map((r) => {
            const i = r.build.inputs as Record<string, unknown>;
            const v = (k: string) => (i[k] === undefined || i[k] === null ? "" : String(i[k]));
            const f = `b-${r.build.id}`;
            const pair = (now: string, goal: string, hi: number) => canEdit
              ? <span className="whitespace-nowrap"><input form={f} className="input w-12" name={now} defaultValue={v(now)} placeholder="1" /> → <input form={f} className="input w-12" name={goal} defaultValue={v(goal)} placeholder={String(hi)} /></span>
              : <span>{v(now) || 1} → {v(goal) || v(now) || 1}</span>;
            const core = (k: string) => CORE_LABELS[Math.max(0, Math.min(6, Number(i[k]) || 0))];
            return (
              <tr key={r.build.id}>
                <td>
                  {canEdit && <form action={updateBuild} id={f} className="contents"><input type="hidden" name="account_id" value={id} /><input type="hidden" name="build_id" value={r.build.id} /></form>}
                  {canEdit ? <input form={f} className="input w-12" name="priority" defaultValue={r.build.priority} /> : r.build.priority}
                </td>
                <td className="font-medium">{r.ch.name}<div className="text-xs font-normal text-neutral-500">{r.needs.specialty} · {r.needs.family}{r.needs.sealFamily ? ` · ${r.needs.sealFamily}` : ""}{r.needs.bossMat ? ` · ${r.needs.bossMat}` : ""}{r.needs.weeklyMat ? ` · ${r.needs.weeklyMat}` : ""}</div></td>
                <td>{pair("lv_now", "lv_goal", 60)}</td>
                <td>{pair("basic_now", "basic_goal", 12)}</td>
                <td>{pair("dodge_now", "dodge_goal", 12)}</td>
                <td>{pair("assist_now", "assist_goal", 12)}</td>
                <td>{pair("special_now", "special_goal", 12)}</td>
                <td>{pair("chain_now", "chain_goal", r.needs.extraMax || 12)}</td>
                <td>{canEdit ? <span className="whitespace-nowrap">{coreSel(f, "core_now", v("core_now") || "0")} → {coreSel(f, "core_goal", v("core_goal") || v("core_now") || "0")}</span> : <span>{core("core_now")} → {i.core_goal === undefined ? core("core_now") : core("core_goal")}</span>}</td>
                <td>
                  {canEdit ? (
                    <span className="flex flex-col gap-1">
                      <select form={f} className="input w-44" name="lc" defaultValue={v("lc")}><option value="">(no W-Engine)</option>{lcs.map((x) => <option key={x.name} value={x.name}>{RANK(x.stars)} {x.name}</option>)}</select>
                      {pair("lc_now", "lc_goal", 60)}
                    </span>
                  ) : i.lc ? `${RANK(r.needs.lcStars)} ${i.lc} ${v("lc_now") || 1} → ${v("lc_goal") || v("lc_now") || 1}` : "—"}
                </td>
                <td>
                  {canEdit ? (
                    <span className="flex flex-col gap-1">
                      <input form={f} className="input w-32" type="date" name="deadline" defaultValue={r.build.deadline ?? ""} />
                      <select form={f} className="input w-32" name="banner" defaultValue={r.build.banner ?? ""}><option value="">(or by banner)</option>{banners.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}</select>
                    </span>
                  ) : r.deadline !== null ? fmtDay(r.deadline) : "—"}
                </td>
                <td className="whitespace-nowrap">{n0(r.resin)}<div className="text-xs text-neutral-500">{Math.round((r.resin / (s.staminaPerDay || 320)) * 10) / 10} d</div></td>
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
          {plan.rows.length === 0 && <tr><td colSpan={16} className="text-neutral-500">No builds yet — add an agent below.</td></tr>}
        </tbody>
      </table>
      <details className="text-sm">
        <summary className="cursor-pointer text-neutral-600">Materials & runs per build</summary>
        <table className="table mt-2">
          <thead><tr><th>Agent</th><th>EXP</th><th>Dennies</th><th>Expert mats</th><th>Chips (T3-eq)</th><th>Seals (T3-eq)</th><th>Notorious</th><th>W-Engine EXP</th><th>Components (T3-eq)</th><th>Runs left: Expert · chips · seals · components · EXP · W-Engine EXP · Dennies · Notorious</th></tr></thead>
          <tbody>
            {plan.rows.map((r) => (
              <tr key={r.build.id}>
                <td>{r.ch.name}</td><td>{n0(r.needs.exp)}</td><td>{n0(r.needs.credits)}</td><td>{n0(r.needs.boss)}</td><td>{Math.round(r.needs.trace * 10) / 10}</td><td>{Math.round(r.needs.seal * 10) / 10}</td><td>{n0(r.needs.weekly)}</td><td>{n0(r.needs.lcExp)}</td><td>{Math.round(r.needs.lcTrace * 10) / 10}</td>
                <td>{r.runs.boss} · {r.runs.trace} · {r.runs.seal} · {r.runs.lcTrace} · {r.runs.exp} · {r.runs.lcExp} · {r.runs.credit} · {r.runs.weekly}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-xs text-neutral-500">Needs are before inventory. Runs are after what the account owns (Inventory) and what was logged since the last inventory count, for the “{s.dropCase}” drop-rate case. Chips, seals and components count 3 lower = 1 higher.</p>
      </details>
      {canEdit && (
        <form action={addBuild} className="card flex flex-wrap items-end gap-2 text-sm">
          <input type="hidden" name="account_id" value={id} />
          <label className="label">Agent
            <select className="input" name="character_id" required defaultValue="">
              <option value="">Pick an agent…</option>
              {characters.filter((c) => Object.keys(c.farm ?? {}).length > 0).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="label">#<input className="input w-14" name="priority" defaultValue={plan.rows.length + 1} /></label>
          <label className="label">Lv now → goal<span className="flex gap-1"><input className="input w-14" name="lv_now" placeholder="1" /><input className="input w-14" name="lv_goal" placeholder="60" /></span></label>
          <label className="label">Basic<span className="flex gap-1"><input className="input w-12" name="basic_now" placeholder="1" /><input className="input w-12" name="basic_goal" placeholder="1" /></span></label>
          <label className="label">Dodge<span className="flex gap-1"><input className="input w-12" name="dodge_now" placeholder="1" /><input className="input w-12" name="dodge_goal" placeholder="1" /></span></label>
          <label className="label">Assist<span className="flex gap-1"><input className="input w-12" name="assist_now" placeholder="1" /><input className="input w-12" name="assist_goal" placeholder="1" /></span></label>
          <label className="label">Special<span className="flex gap-1"><input className="input w-12" name="special_now" placeholder="1" /><input className="input w-12" name="special_goal" placeholder="1" /></span></label>
          <label className="label">Chain<span className="flex gap-1"><input className="input w-12" name="chain_now" placeholder="1" /><input className="input w-12" name="chain_goal" placeholder="1" /></span></label>
          <label className="label">Core Skill<span className="flex gap-1">{coreSel(undefined, "core_now", "0")}{coreSel(undefined, "core_goal", "0")}</span></label>
          <label className="label">W-Engine<span className="flex gap-1"><select className="input w-44" name="lc" defaultValue=""><option value="">(none)</option>{lcs.map((x) => <option key={x.name} value={x.name}>{RANK(x.stars)} {x.name}</option>)}</select><input className="input w-14" name="lc_now" placeholder="1" /><input className="input w-14" name="lc_goal" placeholder="60" /></span></label>
          <label className="label">Deadline<input className="input" type="date" name="deadline" /></label>
          <label className="label">or banner<select className="input" name="banner" defaultValue=""><option value="">—</option>{banners.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}</select></label>
          <button className="btn" type="submit">Add build</button>
          <p className="w-full text-xs text-neutral-500">Blank goal = no change. Skills 1–12 (Basic, Dodge, Assist, Special, Chain); Core Skill None / A–F (the Core Skill levels are what need Expert Challenge and Notorious Hunt mats). Agents without farming data (new leaks) need their chip family / seal / Expert mat / Notorious mat set on the Characters page first.</p>
        </form>
      )}
    </>
  );
}

/** Account settings form (ZZZ). */
export function ZzzSettingsForm({ id, plan, account, canEdit, staminaName, staminaPerDay }: { id: string; plan: ZzzPlan; account: GameAccount; canEdit: boolean; staminaName: string; staminaPerDay: number }) {
  const s = plan.settings;
  const acc = (account.settings ?? {}) as Record<string, unknown>;
  return (
    <form action={saveFarmSettings} className="mt-3 grid gap-3 sm:grid-cols-4">
      <input type="hidden" name="account_id" value={id} />
      <label className="label">Inter-Knot Level (1–60)<input className="input" name="ik" defaultValue={String(acc.ik ?? "")} placeholder="60" disabled={!canEdit} /></label>
      <label className="label">{staminaName} / day (240 regen + 80 daily coffee)<input className="input" name="stamina_per_day" defaultValue={String(acc.stamina_per_day ?? "")} placeholder={String(staminaPerDay)} disabled={!canEdit} /></label>
      <label className="label">Extra Battery per week (event batteries)<input className="input" name="extra_week" defaultValue={String(acc.extra_week ?? "")} placeholder="0" disabled={!canEdit} /></label>
      <label className="label">Ether Batteries owned (60 each)<input className="input" name="fuel" defaultValue={String(acc.fuel ?? "")} placeholder="0" disabled={!canEdit} /></label>
      <label className="label">Backup Battery Charge you can use<input className="input" name="reserve" defaultValue={String(acc.reserve ?? "")} placeholder="0" disabled={!canEdit} /></label>
      <label className="label">Bank between days (0 = leftovers → Drive Discs)<input className="input" name="bank_cap" defaultValue={String(acc.bank_cap ?? "")} placeholder="0" disabled={!canEdit} /></label>
      <label className="label">Free Notorious Hunt claims per week<input className="input" name="echo" defaultValue={String(acc.echo ?? "")} placeholder="3" disabled={!canEdit} /></label>
      <label className="label">Drop-rate case<select className="input" name="drop_case" defaultValue={s.dropCase} disabled={!canEdit}><option value="avg">Average</option><option value="p80">Pessimistic (80%)</option><option value="worst">Worst</option><option value="best">Best</option></select></label>
      <label className="label">Plan order<select className="input" name="order" defaultValue={s.order} disabled={!canEdit}><option value="priority">My priority (#)</option><option value="deadline">Earliest deadline first</option></select></label>
      <label className="label">Plan Notorious Hunt on<select className="input" name="weekly_day" defaultValue={String(s.weeklyDay)} disabled={!canEdit}><option value="-1">Any day</option>{[1, 2, 3, 4, 5, 6, 0].map((d) => <option key={d} value={d}>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]}</option>)}</select></label>
      <label className="label">Days off (e.g. “Sat, Sun”)<input className="input" name="days_off" defaultValue={s.daysOff} disabled={!canEdit} /></label>
      <div className="flex flex-col gap-1 self-end">
        <label><input type="checkbox" name="gold" defaultChecked={s.gold} disabled={!canEdit} /> Farm Agent EXP & Dennies with Battery (Combat Simulation)</label>
        <label><input type="checkbox" name="lcexp" defaultChecked={s.lcexp} disabled={!canEdit} /> Farm W-Engine EXP with Battery</label>
        <label><input type="checkbox" name="echo_paid" defaultChecked={s.echoPaid} disabled={!canEdit} /> Extra paid Notorious Hunt runs (60 Battery) once the free claims are used — last, only with Battery left over that day</label>
      </div>
      {canEdit && <div className="self-end"><button className="btn" type="submit">Save settings</button></div>}
    </form>
  );
}

const n1 = (x: number) => (Math.round(x * 10) / 10).toLocaleString();

/** Inventory sections (ZZZ) — rendered inside the save form. */
export function ZzzInventory({ plan, inventory, canEdit }: { plan: ZzzPlan; inventory: FarmInventoryRow[]; canEdit: boolean }) {
  const L = zzzInventoryLayout();
  const q = (kind: string, key = "") => { const r = inventory.find((x) => x.kind === kind && x.key === key); return r ? String(r.qty) : ""; };
  const need = { fam: new Map<string, number>(), boss: new Map<string, number>(), wk: new Map<string, number>(), credits: 0, exp: 0, lcExp: 0 };
  const short = { fam: new Map<string, number>(), boss: new Map<string, number>(), wk: new Map<string, number>(), credits: 0, exp: 0, lcExp: 0 };
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  for (const r of plan.rows) {
    add(need.fam, r.needs.family, r.needs.trace); add(short.fam, r.needs.family, r.short.trace);
    add(need.fam, r.needs.sealFamily, r.needs.seal); add(short.fam, r.needs.sealFamily, r.short.seal);
    if (r.needs.lcFamily) { add(need.fam, r.needs.lcFamily, r.needs.lcTrace); add(short.fam, r.needs.lcFamily, r.short.lcTrace); }
    add(need.boss, r.needs.bossMat, r.needs.boss); add(short.boss, r.needs.bossMat, r.short.boss);
    add(need.wk, r.needs.weeklyMat, r.needs.weekly); add(short.wk, r.needs.weeklyMat, r.short.weekly);
    need.credits += r.needs.credits; short.credits += r.short.credits; need.exp += r.needs.exp; short.exp += r.short.exp; need.lcExp += r.needs.lcExp; short.lcExp += r.short.lcExp;
  }
  const inp = (kind: string, key: string, cls = "w-20") => <input className={`input ${cls}`} name={`${kind}|${key}`} defaultValue={q(kind, key)} disabled={!canEdit} inputMode="numeric" />;
  const ns = (nd: number, sh: number) => <><td>{nd ? n1(nd) : ""}</td><td className={sh > 0 ? "font-medium text-red-700" : ""}>{sh > 0 ? n1(sh) : ""}</td></>;
  const expHave = (Number(q("sil")) || 0) * 3000 + (Number(q("oil")) || 0) * 600 + (Number(q("til")) || 0) * 100;
  const lcExpHave = (Number(q("wem")) || 0) * 3000 + (Number(q("wps")) || 0) * 600 + (Number(q("wbt")) || 0) * 100;
  const famTable = (title: string, fams: typeof L.chips) => (
    <section className="card" key={title}>
      <h2 className="mb-2 font-medium">{title}</h2>
      <table className="table"><thead><tr><th>Tier 3</th><th>Tier 1 / Tier 2</th><th>Tier 1</th><th>Tier 2</th><th>Tier 3</th><th>Have (T3-eq)</th><th>Need</th><th>Short by</th></tr></thead>
        <tbody>
          {fams.map((f) => {
            const have = (Number(q("famT1", f.t3)) || 0) / 9 + (Number(q("famT2", f.t3)) || 0) / 3 + (Number(q("famT3", f.t3)) || 0);
            return <tr key={f.t3}><td>{f.t3}</td><td className="text-neutral-500">{f.t1} / {f.t2}</td><td>{inp("famT1", f.t3, "w-16")}</td><td>{inp("famT2", f.t3, "w-16")}</td><td>{inp("famT3", f.t3, "w-16")}</td><td>{n1(have)}</td>{ns(need.fam.get(f.t3) ?? 0, short.fam.get(f.t3) ?? 0)}</tr>;
          })}
        </tbody></table>
    </section>
  );
  return (
    <>
      <section className="card">
        <h2 className="mb-2 font-medium">Global</h2>
        <table className="table"><thead><tr><th>Item</th><th>Have</th><th>Need</th><th>Short by</th></tr></thead>
          <tbody>
            {L.global.map(([kind, key, label]) => (
              <tr key={kind}><td>{label}</td><td>{inp(kind, key, "w-28")}</td>
                {kind === "credit" ? ns(need.credits, short.credits) : kind === "sil" ? <><td>{n0(need.exp)} EXP (have {n0(expHave)})</td><td className={short.exp > 0 ? "font-medium text-red-700" : ""}>{short.exp > 0 ? n0(short.exp) : ""}</td></> : kind === "wem" ? <><td>{n0(need.lcExp)} W-Engine EXP (have {n0(lcExpHave)})</td><td className={short.lcExp > 0 ? "font-medium text-red-700" : ""}>{short.lcExp > 0 ? n0(short.lcExp) : ""}</td></> : <><td></td><td></td></>}
              </tr>
            ))}
          </tbody></table>
        <p className="mt-1 text-xs text-neutral-500">EXP needs are in EXP points; the three Investigator Logs pool together (likewise the three W-Engine EXP items).</p>
      </section>
      {famTable("Skill chips (Combat Simulation · Agent Skill, 20 Battery)", L.chips)}
      {famTable("Certification seals (Combat Simulation · Agent Promotion, 20 Battery)", L.seals)}
      {famTable("W-Engine components (Combat Simulation · W-Engine, 20 Battery)", L.components)}
      <section className="card">
        <h2 className="mb-2 font-medium">Expert Challenge materials (Higher Dimensional Data, 40 Battery)</h2>
        <table className="table"><thead><tr><th>Material</th><th>Have</th><th>Need</th><th>Short by</th></tr></thead>
          <tbody>
            {L.bosses.map((b) => <tr key={b.mat}><td>{b.mat}</td><td>{inp("boss", b.mat, "w-16")}</td>{ns(need.boss.get(b.mat) ?? 0, short.boss.get(b.mat) ?? 0)}</tr>)}
          </tbody></table>
      </section>
      <section className="card">
        <h2 className="mb-2 font-medium">Notorious Hunt materials (3 free claims a week)</h2>
        <table className="table"><thead><tr><th>Material</th><th>Have</th><th>Need</th><th>Short by</th></tr></thead>
          <tbody>
            {L.weeklies.map((w) => <tr key={w.mat}><td>{w.mat}</td><td>{inp("wk", w.mat, "w-16")}</td>{ns(need.wk.get(w.mat) ?? 0, short.wk.get(w.mat) ?? 0)}</tr>)}
          </tbody></table>
      </section>
    </>
  );
}

/** Log table columns and real-drop fields (ZZZ). */
export const ZZZ_LOG = {
  cols: [["boss", "Expert"], ["trace", "Chips"], ["seal", "Seals"], ["lcTrace", "Components"], ["exp", "EXP"], ["lcExp", "W-Engine EXP"], ["credit", "Dennies"]] as [string, string][],
  drops: [["traceT1", "Chips T1"], ["traceT2", "T2"], ["traceT3", "T3"], ["lcT1", "W-Engine T1"], ["lcT2", "W-Engine T2"], ["lcT3", "W-Engine T3"], ["boss", "Expert"], ["wk", "Notorious"]] as [string, string][],
};
