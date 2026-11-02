import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadIncomeItems } from "@/lib/income/load";
import { pullsOf } from "@/lib/income/forecast";
import { vkey } from "@/lib/calendar";
import type { Game, IncomeItem } from "@/lib/types";
import { addIncomeItem, deleteIncomeItem, saveIncomeItem } from "./actions";

const n0 = (x: number) => (x ? Math.round(x).toLocaleString() : "");
const n2 = (x: number) => (Math.round(x * 100) / 100).toLocaleString();
const SECTIONS: [IncomeItem["section"], string][] = [["event", "Events"], ["new", "New content (quests, exploration, endgame)"], ["web", "Web, mail, apologems"], ["recurring", "Repeating (per-version averages)"]];
const KINDS = ["event", "archon", "story", "world", "exploration", "endgame", "other", "web", "recurring"];
const paid = (i: IncomeItem) => /Battle Pass - Paid|Welkin/i.test(i.name);

/** Sheet-style category of a line (summary tab): events / permanent content / web / commissions+free BP / endgame / shop. */
function category(i: IncomeItem) {
  if (i.section === "event") return "Version events";
  if (i.section === "new") return "Permanent content";
  if (i.section === "web") return "Apologems / web / mail";
  if (/^Daily Resin|^Battle Pass - F2P/i.test(i.name)) return "Commissions / free BP";
  if (/Abyss|Imaginarium|Stygian/i.test(i.name)) return "Abyss / Theater / Stygian";
  if (/^Paimon/i.test(i.name)) return "Paimon's shop";
  return null;
}
function summarize(items: IncomeItem[], versions: string[]) {
  const out: { ver: string; c: Record<string, number>; total: number; cum: number; est: boolean }[] = [];
  let cum = 0;
  for (const ver of versions) {
    const c: Record<string, number> = {};
    for (const i of items) if (i.version === ver && !paid(i)) { const k = category(i); if (k) c[k] = (c[k] ?? 0) + pullsOf(i.primos, i.intertwined); }
    const total = Object.values(c).reduce((a, b) => a + b, 0);
    cum += total;
    out.push({ ver, c, total, cum, est: items.some((i) => i.version === ver && i.is_estimate) });
  }
  return out;
}
const CATS = ["Permanent content", "Version events", "Commissions / free BP", "Abyss / Theater / Stygian", "Paimon's shop", "Apologems / web / mail"];

export default async function BookkeepingPage({ searchParams }: PageProps<"/income">) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: games }, { data: me }] = await Promise.all([
    supabase.from("games").select("*").order("sort_order").returns<Game[]>(),
    supabase.from("profiles").select("is_admin").eq("id", user!.id).maybeSingle<{ is_admin: boolean }>(),
  ]);
  const isAdmin = !!me?.is_admin;
  const gameId = typeof sp.game === "string" ? sp.game : "genshin";
  const game = (games ?? []).find((g) => g.id === gameId);
  const items = await loadIncomeItems(supabase, gameId);
  const versions = [...new Set(items.map((i) => i.version))].sort((a, b) => vkey(a) - vkey(b));
  const released = versions.filter((x) => items.some((i) => i.version === x && !i.is_estimate));
  const v = typeof sp.v === "string" && versions.includes(sp.v) ? sp.v : released[released.length - 1] ?? versions[versions.length - 1] ?? "";
  const editing = typeof sp.edit === "string" ? sp.edit : null;
  const error = typeof sp.error === "string" ? sp.error : null;
  const rows = items.filter((i) => i.version === v);
  const sum = (list: IncomeItem[]) => list.reduce((a, i) => ({ primos: a.primos + i.primos, intertwined: a.intertwined + i.intertwined, acquaint: a.acquaint + i.acquaint, resin: a.resin + i.resin, mora: a.mora + i.mora }), { primos: 0, intertwined: 0, acquaint: 0, resin: 0, mora: 0 });
  const f2p = sum(rows.filter((i) => !paid(i))), all = sum(rows);

  // summary across versions (pulls = primogems / 160 + Intertwined Fates, F2P)
  const summary = summarize(items, versions);

  const itemForm = (it: IncomeItem | null) => (
    <form action={it ? saveIncomeItem : addIncomeItem} className="flex flex-wrap items-end gap-2 text-xs">
      <input type="hidden" name="game_id" value={gameId} /><input type="hidden" name="version" value={v} />
      {it && <input type="hidden" name="id" value={it.id} />}
      <label className="label">Kind<select className="input" name="kind" defaultValue={it?.kind ?? "world"}>{KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
      <label className="label">Name<input className="input w-56" name="name" defaultValue={it?.name ?? ""} required /></label>
      <label className="label">Primogems<input className="input w-20" name="primos" defaultValue={it?.primos ?? ""} /></label>
      <label className="label">Intertwined<input className="input w-16" name="intertwined" defaultValue={it?.intertwined || ""} /></label>
      <label className="label">Acquaint<input className="input w-16" name="acquaint" defaultValue={it?.acquaint || ""} /></label>
      <label className="label">Minutes<input className="input w-16" name="minutes" defaultValue={it?.minutes ?? ""} /></label>
      <label className="label">Requires (version:name, one per line)<textarea className="input w-72" rows={2} name="requires" defaultValue={(it?.requires ?? []).join("\n")} /></label>
      <label className="label">Note<input className="input w-40" name="note" defaultValue={it?.note ?? ""} /></label>
      <label className="label">Region<input className="input w-28" name="region" defaultValue={it?.region ?? ""} /></label>
      <label className="label">Chest pools (&quot;Common 79 x 2&quot; per line: count x primos each)<textarea className="input w-56" rows={2} name="pools" defaultValue={(it?.pools ?? []).map((p) => `${p.label} ${p.count} x ${p.each}`).join("\n")} /></label>
      <label><input type="checkbox" name="is_estimate" defaultChecked={it?.is_estimate ?? false} /> estimate</label>
      <button className="btn" type="submit">{it ? "Save" : "Add line"}</button>
      {it && <Link className="btn-secondary" href={`/income?game=${gameId}&v=${encodeURIComponent(v)}`}>Cancel</Link>}
    </form>
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Bookkeeping</h1>
        <p className="text-sm text-neutral-600">Every primogem / fate source per version — the structure of the Genshin Bookkeeping sheet (numbers from sectoidfodder&apos;s community sheet; repeating rows are per-42-day averages). Each account&apos;s <b>Primogem forecast</b> picks items from this catalog into its plan. Versions not out yet have estimate lines (average of the last six versions) until the real numbers are in. Pulls = primogems ÷ 160 + Intertwined Fates.</p>
      </div>
      <div className="flex flex-wrap gap-3 text-sm">{(games ?? []).map((g) => <Link key={g.id} href={`/income?game=${g.id}`} className={g.id === gameId ? "font-semibold underline" : "underline"}>{g.name}</Link>)}</div>
      {error && <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">{error}</p>}
      {!items.length ? <p className="text-sm text-neutral-500">No bookkeeping for {game?.name ?? gameId} yet.</p> : (
        <>
          <div className="flex flex-wrap gap-2 text-xs">{versions.map((x) => <Link key={x} href={`/income?game=${gameId}&v=${x}`} className={x === v ? "rounded bg-neutral-900 px-1.5 py-0.5 text-white" : "underline"}>{x}</Link>)}</div>

          <section className="flex flex-col gap-2">
            <h2 className="font-medium">Version {v}{rows.some((r) => r.is_estimate) ? " (estimate)" : ""}</h2>
            <div className="grid gap-3 text-sm sm:grid-cols-3">
              <div className="card"><div className="text-xs text-neutral-500">Free to play</div><div className="text-lg">{n0(f2p.primos)} primos + {n2(f2p.intertwined)} fates = {n2(pullsOf(f2p.primos, f2p.intertwined))} pulls</div></div>
              <div className="card"><div className="text-xs text-neutral-500">With Welkin + Battle Pass</div><div className="text-lg">{n0(all.primos)} primos + {n2(all.intertwined)} fates = {n2(pullsOf(all.primos, all.intertwined))} pulls</div></div>
              <div className="card"><div className="text-xs text-neutral-500">Also</div><div className="text-lg">{n2(all.acquaint)} Acquaint · {n0(all.resin)} resin</div></div>
            </div>
            <table className="table text-sm">
              <thead><tr><th>Source</th><th>Kind</th><th>Primogems</th><th>Intertwined</th><th>Acquaint</th><th>Resin</th><th>Mora</th><th>Time</th><th>Needs</th>{isAdmin && <th></th>}</tr></thead>
              <tbody>
                {SECTIONS.map(([sec, label]) => {
                  const list = rows.filter((r) => r.section === sec);
                  if (!list.length) return null;
                  const t = sum(list);
                  return [
                    <tr key={sec} className="bg-neutral-50"><td colSpan={isAdmin ? 10 : 9} className="font-medium">{label} · {n0(t.primos)} primos{t.intertwined ? ` + ${n2(t.intertwined)} fates` : ""}</td></tr>,
                    ...list.map((r) => editing === r.id && isAdmin
                      ? <tr key={r.id}><td colSpan={10}>{itemForm(r)}</td></tr>
                      : (
                        <tr key={r.id}>
                          <td>{r.name}{r.region ? <span className="text-xs text-neutral-500"> · {r.region}</span> : null}{r.note ? <div className="text-xs text-neutral-500">{r.note}</div> : null}{r.pools?.length ? <div className="text-xs text-neutral-500">chests: {r.pools.map((p) => `${p.count} ${p.label.toLowerCase()} (${p.each} each)`).join(" · ")}</div> : null}</td><td className="text-neutral-500">{r.kind}</td>
                          <td>{n0(r.primos)}</td><td>{r.intertwined ? n2(r.intertwined) : ""}</td><td>{r.acquaint ? n2(r.acquaint) : ""}</td><td>{n0(r.resin)}</td><td>{n0(r.mora)}</td>
                          <td className="text-neutral-500">{r.minutes ? `${r.minutes}m` : ""}</td><td className="text-xs text-neutral-500">{r.requires.join("; ")}</td>
                          {isAdmin && <td className="whitespace-nowrap"><Link className="text-xs underline" href={`/income?game=${gameId}&v=${encodeURIComponent(v)}&edit=${r.id}`}>edit</Link> <form action={deleteIncomeItem} className="inline"><input type="hidden" name="game_id" value={gameId} /><input type="hidden" name="version" value={v} /><input type="hidden" name="id" value={r.id} /><button className="text-xs text-neutral-500 underline" type="submit">✕</button></form></td>}
                        </tr>
                      )),
                  ];
                })}
              </tbody>
            </table>
            {isAdmin && <details className="card"><summary className="cursor-pointer text-sm font-medium">Add a line to {v}</summary><div className="mt-2">{itemForm(null)}</div></details>}
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-medium">Summary — free-to-play pulls per version</h2>
            <table className="table text-sm">
              <thead><tr><th>Version</th>{CATS.map((c) => <th key={c}>{c}</th>)}<th>Total</th><th>Running total</th></tr></thead>
              <tbody>
                {summary.slice().reverse().map((r) => (
                  <tr key={r.ver}><td><Link className="underline" href={`/income?game=${gameId}&v=${r.ver}`}>{r.ver}{r.est ? " est." : ""}</Link></td>{CATS.map((c) => <td key={c}>{r.c[c] ? n2(r.c[c]) : ""}</td>)}<td className="font-medium">{n2(r.total)}</td><td>{Math.round(r.cum).toLocaleString()}</td></tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
