import { GENSHIN_DATA } from "@/data/farm/genshin";
import type { GenshinSettings, Needs, RunCounts, Short } from "@/lib/farm/genshin";
import { genshinInventoryLayout } from "@/lib/farm/genshin";
import type { AccountPlan } from "@/lib/farm/plan";
import { fmtDay } from "@/lib/farm/schedule";
import type { Character, FarmInventoryRow, GameAccount } from "@/lib/types";
import { addBuild, deleteBuild, saveFarmSettings, updateBuild } from "./actions";

export type GenshinPlan = AccountPlan<GenshinSettings, Needs, Short, RunCounts>;
type Banner = { key: string; label: string };
const n0 = (x: number) => Math.round(x).toLocaleString();

/** Builds table + add form (Genshin). */
export function GenshinBuilds({ id, plan, banners, canEdit, characters, staminaName }: { id: string; plan: GenshinPlan; banners: Banner[]; canEdit: boolean; characters: Character[]; staminaName: string }) {
  const s = plan.settings;
  const wpnSeries = GENSHIN_DATA.weaponDomains.map((d) => d.series);
  return (
    <>
      <table className="table">
        <thead>
          <tr>
            <th>#</th><th>Character</th><th>Lv</th><th>NA</th><th>Skill</th><th>Burst</th><th>Weapon</th><th>Deadline</th>
            <th>{staminaName}</th><th>Finish</th><th>Soonest</th><th>Status</th>{canEdit && <th></th>}
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
                      <select form={f} className="input w-32" name="banner" defaultValue={r.build.banner ?? ""}><option value="">(or by banner)</option>{banners.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}</select>
                    </span>
                  ) : r.deadline !== null ? fmtDay(r.deadline) : "—"}
                </td>
                <td className="whitespace-nowrap">{n0(r.resin)}<div className="text-xs text-neutral-500">{Math.round((r.resin / (s.staminaPerDay || 180)) * 10) / 10} d</div></td>
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
          <label className="label">or banner<select className="input" name="banner" defaultValue=""><option value="">—</option>{banners.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}</select></label>
          <button className="btn" type="submit">Add build</button>
          <p className="w-full text-xs text-neutral-500">Blank goal = no change. The same character can be added twice (e.g. a later row for crowns). Characters without farming data (new leaks) need their books / boss / weekly set on the Characters page first.</p>
        </form>
      )}
    </>
  );
}

/** Account settings form (Genshin). */
export function GenshinSettingsForm({ id, plan, account, canEdit, staminaName, staminaPerDay }: { id: string; plan: GenshinPlan; account: GameAccount; canEdit: boolean; staminaName: string; staminaPerDay: number }) {
  const s = plan.settings;
  const acc = (account.settings ?? {}) as Record<string, unknown>;
  return (
    <form action={saveFarmSettings} className="mt-3 grid gap-3 sm:grid-cols-4">
      <input type="hidden" name="account_id" value={id} />
      <label className="label">World Level (0–9)<input className="input" name="wl" defaultValue={String(acc.wl ?? "")} placeholder="8" disabled={!canEdit} /></label>
      <label className="label">{staminaName} / day<input className="input" name="stamina_per_day" defaultValue={String(acc.stamina_per_day ?? "")} placeholder={String(staminaPerDay)} disabled={!canEdit} /></label>
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
  );
}

const n1 = (x: number) => (Math.round(x * 10) / 10).toLocaleString();

/** Inventory sections (Genshin) — rendered inside the save form. */
export function GenshinInventory({ plan, inventory, canEdit }: { plan: GenshinPlan; inventory: FarmInventoryRow[]; canEdit: boolean }) {
  const L = genshinInventoryLayout();
  const q = (kind: string, key = "") => { const r = inventory.find((x) => x.kind === kind && x.key === key); return r ? String(r.qty) : ""; };
  const need = { books: new Map<string, number>(), wpns: new Map<string, number>(), boss: new Map<string, number>(), wk: new Map<string, number>(), wit: 0, mora: 0 };
  const short = { books: new Map<string, number>(), wpns: new Map<string, number>(), boss: new Map<string, number>(), wk: new Map<string, number>(), wit: 0, mora: 0 };
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  for (const r of plan.rows) {
    r.needs.booksBySeries.forEach(([k, b], i) => { add(need.books, k, b); add(short.books, k, r.short.books[i] ?? 0); });
    add(need.wpns, r.needs.wpnSeries, r.needs.wpn); add(short.wpns, r.needs.wpnSeries, r.short.wpn);
    add(need.boss, r.needs.bossDrop, r.needs.boss); add(short.boss, r.needs.bossDrop, r.short.boss);
    add(need.wk, r.needs.weeklyMat, r.needs.weekly); add(short.wk, r.needs.weeklyMat, r.short.weekly);
    need.wit += r.needs.wit; short.wit += r.short.wit; need.mora += r.needs.mora; short.mora += r.short.mora;
  }
  const inp = (kind: string, key: string, cls = "w-20") => <input className={`input ${cls}`} name={`${kind}|${key}`} defaultValue={q(kind, key)} disabled={!canEdit} inputMode="numeric" />;
  const ns = (nd: number, sh: number) => <><td>{nd ? n1(nd) : ""}</td><td className={sh > 0 ? "font-medium text-red-700" : ""}>{sh > 0 ? n1(sh) : ""}</td></>;
  return (
    <>
      <section className="card">
        <h2 className="mb-2 font-medium">Global</h2>
        <table className="table"><thead><tr><th>Item</th><th>Have</th><th>Need</th><th>Short by</th></tr></thead>
          <tbody>
            {L.global.map(([kind, key, label]) => (
              <tr key={kind}><td>{label}</td><td>{inp(kind, key, "w-28")}</td>
                {kind === "mora" ? ns(need.mora, short.mora) : kind === "wit" ? ns(need.wit, short.wit) : <><td></td><td></td></>}
              </tr>
            ))}
          </tbody></table>
        <p className="mt-1 text-xs text-neutral-500">Hero&apos;s Wit need is in Wit-equivalents (Adventurer&apos;s Experience = ¼, Wanderer&apos;s Advice = 1/20). Dream Solvent covers weekly-mat shortfalls.</p>
      </section>
      <section className="card">
        <h2 className="mb-2 font-medium">Talent books (20 resin)</h2>
        <table className="table"><thead><tr><th>Series</th><th>Region</th><th>Days</th><th>Teachings</th><th>Guide</th><th>Philosophies</th><th>Have (Guide-eq)</th><th>Need</th><th>Short by</th></tr></thead>
          <tbody>
            {L.books.map((b) => {
              const have = (Number(q("bookT", b.series)) || 0) / 3 + (Number(q("bookG", b.series)) || 0) + (Number(q("bookP", b.series)) || 0) * 3;
              return <tr key={b.series}><td>{b.series}</td><td className="text-neutral-500">{b.region}</td><td className="text-neutral-500">{b.days}</td><td>{inp("bookT", b.series)}</td><td>{inp("bookG", b.series)}</td><td>{inp("bookP", b.series)}</td><td>{n1(have)}</td>{ns(need.books.get(b.series) ?? 0, short.books.get(b.series) ?? 0)}</tr>;
            })}
          </tbody></table>
      </section>
      <section className="card">
        <h2 className="mb-2 font-medium">Weapon materials (20 resin)</h2>
        <table className="table"><thead><tr><th>Series</th><th>Region</th><th>Days</th><th>2★</th><th>3★</th><th>4★</th><th>5★</th><th>Have (3★-eq)</th><th>Need</th><th>Short by</th></tr></thead>
          <tbody>
            {L.wpns.map((b) => {
              const have = (Number(q("wpn2", b.series)) || 0) / 3 + (Number(q("wpn3", b.series)) || 0) + (Number(q("wpn4", b.series)) || 0) * 3 + (Number(q("wpn5", b.series)) || 0) * 9;
              return <tr key={b.series}><td>{b.series}</td><td className="text-neutral-500">{b.region}</td><td className="text-neutral-500">{b.days}</td><td>{inp("wpn2", b.series, "w-16")}</td><td>{inp("wpn3", b.series, "w-16")}</td><td>{inp("wpn4", b.series, "w-16")}</td><td>{inp("wpn5", b.series, "w-16")}</td><td>{n1(have)}</td>{ns(need.wpns.get(b.series) ?? 0, short.wpns.get(b.series) ?? 0)}</tr>;
            })}
          </tbody></table>
      </section>
      <section className="card">
        <h2 className="mb-2 font-medium">Boss drops (40 resin)</h2>
        <table className="table"><thead><tr><th>Drop</th><th>Boss</th><th>Region</th><th>Have</th><th>Need</th><th>Short by</th></tr></thead>
          <tbody>
            {L.bosses.map((b) => <tr key={b.drop}><td>{b.drop}</td><td className="text-neutral-500">{b.boss}</td><td className="text-neutral-500">{b.region}</td><td>{inp("boss", b.drop, "w-16")}</td>{ns(need.boss.get(b.drop) ?? 0, short.boss.get(b.drop) ?? 0)}</tr>)}
          </tbody></table>
      </section>
      <section className="card">
        <h2 className="mb-2 font-medium">Weekly boss materials (30 resin, 3 discounted claims a week)</h2>
        <table className="table"><thead><tr><th>Material</th><th>Boss</th><th>Have</th><th>Need</th><th>Short by</th></tr></thead>
          <tbody>
            {L.weeklies.map((w) => <tr key={w.mat}><td>{w.mat}</td><td className="text-neutral-500">{w.boss}</td><td>{inp("wk", w.mat, "w-16")}</td>{ns(need.wk.get(w.mat) ?? 0, short.wk.get(w.mat) ?? 0)}</tr>)}
          </tbody></table>
      </section>
    </>
  );
}

/** Log table columns and real-drop fields (Genshin). */
export const GENSHIN_LOG = {
  cols: [["book", "Books"], ["wpn", "Wpn"], ["boss", "Boss"], ["wit", "EXP"], ["mora", "Mora"]] as [string, string][],
  drops: [["bookT", "Teach."], ["bookG", "Guide"], ["bookP", "Philo."], ["wpn2", "2★"], ["wpn3", "3★"], ["wpn4", "4★"], ["wpn5", "5★"], ["boss", "Boss"], ["wk", "Weekly"]] as [string, string][],
};
