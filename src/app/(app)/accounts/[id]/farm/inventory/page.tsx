import { loadFarm } from "@/lib/farm/load";
import { genshinInventoryLayout } from "@/lib/farm/genshin";
import { saveInventory } from "../actions";
import { FarmNav } from "../ui";

const n0 = (x: number) => (Math.round(x * 10) / 10).toLocaleString();

export default async function InventoryPage({ params, searchParams }: PageProps<"/accounts/[id]/farm/inventory">) {
  const { id } = await params;
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;
  const message = typeof sp.message === "string" ? sp.message : null;
  const { account, game, inventory, canEdit, plan } = await loadFarm(id);
  const L = genshinInventoryLayout();
  const q = (kind: string, key = "") => { const r = inventory.find((x) => x.kind === kind && x.key === key); return r ? String(r.qty) : ""; };
  // what the plan still needs per key (before inventory), for the Need / Short columns
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
  const ns = (nd: number, sh: number) => <><td>{nd ? n0(nd) : ""}</td><td className={sh > 0 ? "font-medium text-red-700" : ""}>{sh > 0 ? n0(sh) : ""}</td></>;

  return (
    <div className="flex flex-col gap-6">
      <FarmNav id={id} game={game} account={account} active="inventory" />
      {error && <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">{error}</p>}
      {message && <p className="rounded border border-green-300 bg-green-50 p-2 text-sm text-green-800">{message}</p>}
      <p className="text-sm text-neutral-600">What this account owns. Need = what the unfinished builds still need (before inventory); Short by = what is missing. Saving stamps the count, so runs logged before now stop being subtracted (nothing is counted twice). Books and weapon mats count 3 lower = 1 higher.</p>
      <form action={saveInventory} className="flex flex-col gap-6 text-sm">
        <input type="hidden" name="account_id" value={id} />
        {canEdit && <div><button className="btn" type="submit">Save inventory</button></div>}
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
                return <tr key={b.series}><td>{b.series}</td><td className="text-neutral-500">{b.region}</td><td className="text-neutral-500">{b.days}</td><td>{inp("bookT", b.series)}</td><td>{inp("bookG", b.series)}</td><td>{inp("bookP", b.series)}</td><td>{n0(have)}</td>{ns(need.books.get(b.series) ?? 0, short.books.get(b.series) ?? 0)}</tr>;
              })}
            </tbody></table>
        </section>
        <section className="card">
          <h2 className="mb-2 font-medium">Weapon materials (20 resin)</h2>
          <table className="table"><thead><tr><th>Series</th><th>Region</th><th>Days</th><th>2★</th><th>3★</th><th>4★</th><th>5★</th><th>Have (3★-eq)</th><th>Need</th><th>Short by</th></tr></thead>
            <tbody>
              {L.wpns.map((b) => {
                const have = (Number(q("wpn2", b.series)) || 0) / 3 + (Number(q("wpn3", b.series)) || 0) + (Number(q("wpn4", b.series)) || 0) * 3 + (Number(q("wpn5", b.series)) || 0) * 9;
                return <tr key={b.series}><td>{b.series}</td><td className="text-neutral-500">{b.region}</td><td className="text-neutral-500">{b.days}</td><td>{inp("wpn2", b.series, "w-16")}</td><td>{inp("wpn3", b.series, "w-16")}</td><td>{inp("wpn4", b.series, "w-16")}</td><td>{inp("wpn5", b.series, "w-16")}</td><td>{n0(have)}</td>{ns(need.wpns.get(b.series) ?? 0, short.wpns.get(b.series) ?? 0)}</tr>;
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
        {canEdit && <div><button className="btn" type="submit">Save inventory</button></div>}
      </form>
    </div>
  );
}
