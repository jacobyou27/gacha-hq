import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { versionRows } from "@/lib/calendar";
import { fmtDay, isoDay } from "@/lib/farm/schedule";
import { gameToday } from "@/lib/farm/plan";
import { forecast, incomeSettings } from "@/lib/income/forecast";
import { INCOME_GAMES, loadIncomeItems, loadPlan } from "@/lib/income/load";
import type { Banner, Character, Game, GameAccount, GameVersion } from "@/lib/types";
import { addBanner, deleteBanner, deleteVersion, saveVersion } from "./actions";

const n1 = (x: number) => (Math.round(x * 10) / 10).toLocaleString();

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const sp = await searchParams;
  const gameId = typeof sp.game === "string" ? sp.game : "genshin";
  const accountId = typeof sp.account === "string" ? sp.account : "";
  const error = typeof sp.error === "string" ? sp.error : null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: games }, { data: me }, { data: versions }, { data: banners }, { data: chars }, { data: accounts }, { data: wants }] = await Promise.all([
    supabase.from("games").select("*").order("sort_order").returns<Game[]>(),
    supabase.from("profiles").select("is_admin").eq("id", user!.id).maybeSingle<{ is_admin: boolean }>(),
    supabase.from("game_versions").select("*").eq("game_id", gameId).returns<GameVersion[]>(),
    supabase.from("banners").select("*").eq("game_id", gameId).returns<Banner[]>(),
    supabase.from("characters").select("id, name, rarity, is_released, release_date").eq("game_id", gameId).order("name").returns<Pick<Character, "id" | "name" | "rarity" | "is_released" | "release_date">[]>(),
    supabase.from("game_accounts").select("*").eq("game_id", gameId).order("name").returns<GameAccount[]>(),
    supabase.from("character_wants").select("character_id, want_level").eq("user_id", user!.id).returns<{ character_id: string; want_level: number }[]>(),
  ]);
  const { data: memberOf } = await supabase.from("account_members").select("account_id").eq("user_id", user!.id).returns<{ account_id: string }[]>();
  const mine = new Set((memberOf ?? []).map((m) => m.account_id));
  const isAdmin = !!me?.is_admin;
  const game = (games ?? []).find((g) => g.id === gameId);
  const rows = versionRows(versions ?? [], gameId, 8);
  const today = gameToday("America");
  const charName = new Map((chars ?? []).map((c) => [c.id, c]));
  const wanted = new Map((wants ?? []).map((w) => [w.character_id, w.want_level]));
  const myAccounts = (accounts ?? []).filter((a) => a.user_id === user!.id || mine.has(a.id));

  // builds that aim at a banner phase (planner deadline "7.2 Phase 1")
  const ids = myAccounts.map((a) => a.id);
  const { data: builds } = ids.length
    ? await supabase.from("farm_builds").select("account_id, character_id, banner, done").in("account_id", ids).not("banner", "is", null).returns<{ account_id: string; character_id: string; banner: string; done: boolean }[]>()
    : { data: [] as { account_id: string; character_id: string; banner: string; done: boolean }[] };
  const accName = new Map(myAccounts.map((a) => [a.id, a.name]));

  // pulls by each phase for one account (Genshin forecast)
  let pullsAt: ((day: number) => number) | null = null;
  const acct = myAccounts.find((a) => a.id === accountId);
  if (acct && INCOME_GAMES.includes(gameId)) {
    const items = await loadIncomeItems(supabase, gameId);
    const plan = await loadPlan(supabase, acct.id);
    const acctRows = versionRows(versions ?? [], gameId, 12);
    const t = gameToday(acct.server);
    const settings = incomeSettings(((acct.settings ?? {}) as Record<string, unknown>).income as Record<string, unknown> | undefined);
    const last = rows.length ? rows[rows.length - 1].end : t + 365;
    const f = forecast({ items, plan, settings, rows: acctRows, today: t, until: Math.min(last, t + 400) });
    pullsAt = (d: number) => f.at(d).pulls;
  }

  const shown = rows.filter((r) => r.end >= today - 42);
  const fiveStars = (chars ?? []).filter((c) => c.rarity >= 5);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Banner calendar</h1>
        <p className="text-sm text-neutral-600">Versions and banner phases (Phase 2 starts 21 days in). Versions after the newest known one are projected 42 days apart (marked ?). Pick a Genshin account to see how many pulls it will have when each phase starts.</p>
      </div>
      <div className="flex flex-wrap gap-3 text-sm">{(games ?? []).map((g) => <Link key={g.id} href={`/calendar?game=${g.id}`} className={g.id === gameId ? "font-semibold underline" : "underline"}>{g.name}</Link>)}</div>
      {error && <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">{error}</p>}
      {INCOME_GAMES.includes(gameId) && (
        <form method="get" className="flex flex-wrap items-end gap-2 text-sm">
          <input type="hidden" name="game" value={gameId} />
          <label className="label">Pulls for account<select className="input" name="account" defaultValue={accountId}><option value="">—</option>{myAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <button className="btn-secondary" type="submit">Show</button>
          {acct && <Link className="text-xs underline" href={`/accounts/${acct.id}/income`}>forecast settings for {acct.name}</Link>}
        </form>
      )}
      {!rows.length ? <p className="text-sm text-neutral-500">No versions known for {game?.name} yet{isAdmin ? " — add one below." : "."}</p> : (
        <table className="table text-sm">
          <thead><tr><th>Phase</th><th>Dates</th><th>Featured</th><th>Builds aiming here</th>{pullsAt && <th>Pulls by then</th>}{isAdmin && <th></th>}</tr></thead>
          <tbody>
            {shown.flatMap((r) => [1, 2].map((ph) => {
              const s = r.start + (ph === 2 ? 21 : 0), e = ph === 1 ? r.start + 20 : r.end;
              const now = today >= s && today <= e;
              const feat = (banners ?? []).filter((b) => b.version === r.version && b.phase === ph);
              const key = `${r.version} Phase ${ph}`;
              const aiming = (builds ?? []).filter((b) => !b.done && b.banner.replace("?", "").trim() === key);
              return (
                <tr key={key} className={now ? "bg-blue-50" : e < today ? "text-neutral-400" : ""}>
                  <td className="whitespace-nowrap font-medium">{r.version}{r.estimate ? "?" : ""} Phase {ph}</td>
                  <td className="whitespace-nowrap">{fmtDay(s)} – {fmtDay(e)}{s > today ? <span className="text-xs text-neutral-500"> · in {s - today} d</span> : now ? <span className="text-xs text-blue-700"> · now</span> : null}</td>
                  <td>
                    {feat.length ? feat.map((b) => {
                      const c = charName.get(b.character_id);
                      return (
                        <span key={b.id} className="mr-2 whitespace-nowrap">
                          {c?.name ?? "?"}{b.is_rerun ? " (rerun)" : ""}{b.is_estimate ? "?" : ""}{wanted.get(b.character_id) ? <span title="on your wishlist"> ★</span> : null}
                          {isAdmin && <form action={deleteBanner} className="inline"><input type="hidden" name="game_id" value={gameId} /><input type="hidden" name="account" value={accountId} /><input type="hidden" name="id" value={b.id} /><button className="ml-0.5 text-xs text-neutral-400 underline" type="submit">✕</button></form>}
                        </span>
                      );
                    }) : <span className="text-neutral-400">—</span>}
                  </td>
                  <td className="text-xs">{aiming.map((b) => `${charName.get(b.character_id)?.name ?? "?"} (${accName.get(b.account_id)})`).join(", ")}</td>
                  {pullsAt && <td>{e < today ? "" : n1(pullsAt(Math.max(s, today)))}</td>}
                  {isAdmin && ph === 1 && <td rowSpan={2} className="align-top">{!r.projected && <form action={deleteVersion}><input type="hidden" name="game_id" value={gameId} /><input type="hidden" name="account" value={accountId} /><input type="hidden" name="version" value={r.version} /><button className="text-xs text-neutral-400 underline" type="submit">remove version</button></form>}</td>}
                </tr>
              );
            }))}
          </tbody>
        </table>
      )}
      {isAdmin && (
        <div className="grid gap-4 md:grid-cols-2">
          <form action={addBanner} className="card flex flex-wrap items-end gap-2 text-sm">
            <h2 className="w-full font-medium">Add a banner character</h2>
            <input type="hidden" name="game_id" value={gameId} /><input type="hidden" name="account" value={accountId} />
            <label className="label">Version<select className="input" name="version">{shown.map((r) => <option key={r.version} value={r.version}>{r.version}</option>)}</select></label>
            <label className="label">Phase<select className="input" name="phase"><option value="1">1</option><option value="2">2</option></select></label>
            <label className="label">Character<select className="input" name="character_id" required defaultValue=""><option value="" disabled>Pick…</option>{fiveStars.map((c) => <option key={c.id} value={c.id}>{c.name}{c.is_released ? "" : " (leak)"}</option>)}</select></label>
            <label><input type="checkbox" name="is_rerun" /> rerun</label>
            <label><input type="checkbox" name="is_estimate" defaultChecked /> estimate / leak</label>
            <button className="btn" type="submit">Add</button>
          </form>
          <form action={saveVersion} className="card flex flex-wrap items-end gap-2 text-sm">
            <h2 className="w-full font-medium">Set a version&apos;s dates</h2>
            <input type="hidden" name="game_id" value={gameId} /><input type="hidden" name="account" value={accountId} />
            <label className="label">Version<input className="input w-20" name="version" required placeholder="7.2" /></label>
            <label className="label">Starts<input className="input" type="date" name="starts_on" required defaultValue={rows.find((r) => r.projected) ? isoDay(rows.find((r) => r.projected)!.start) : ""} /></label>
            <label className="label">Ends (optional)<input className="input" type="date" name="ends_on" /></label>
            <label><input type="checkbox" name="is_estimate" /> estimate</label>
            <button className="btn" type="submit">Save</button>
            <p className="w-full text-xs text-neutral-500">The planner, forecast and this page all use these dates; later versions are projected from the newest one.</p>
          </form>
        </div>
      )}
    </div>
  );
}
