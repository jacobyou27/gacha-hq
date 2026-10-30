import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { AccountRole, Character, FarmBuild, FarmDay, FarmEvent, FarmInventoryRow, Game, GameAccount, GameVersion, Notice } from "@/lib/types";
import { dismissNotice } from "./actions";
import { logDay } from "@/app/(app)/accounts/[id]/farm/actions";
import { DayButtons } from "@/app/(app)/accounts/[id]/farm/ui";
import { planAccount } from "@/lib/farm/plan";
import { PLANNER_GAMES } from "@/lib/farm/game";
import { fmtDay, isoDay } from "@/lib/farm/schedule";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: games }, { data: accounts }, { data: memberships }, { data: notices }] = await Promise.all([
    supabase.from("games").select("*").order("sort_order").returns<Game[]>(),
    supabase.from("game_accounts").select("*").order("game_id").order("sort_order").returns<GameAccount[]>(),
    supabase
      .from("account_members")
      .select("account_id, role")
      .eq("user_id", user!.id)
      .returns<{ account_id: string; role: AccountRole }[]>(),
    supabase
      .from("notices")
      .select("id, message, created_at, read_at")
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .returns<Notice[]>(),
  ]);

  const roleOf = new Map((memberships ?? []).map((m) => [m.account_id, m.role]));
  // Only accounts I am a member of (public accounts of strangers are not listed here).
  const mine = (accounts ?? []).filter((a) => roleOf.has(a.id));

  // ACCOUNTS TODAY: every active account with builds, each on its own server day
  const planned = mine.filter((a) => a.status === "active" && PLANNER_GAMES.includes(a.game_id));
  const ids = planned.map((a) => a.id);
  const now = new Date();
  const since = isoDay(Math.floor(now.getTime() / 864e5) - 60);
  const [{ data: builds }, { data: chars }, { data: inv }, { data: days }, { data: versions }, { data: events }] = ids.length
    ? await Promise.all([
        supabase.from("farm_builds").select("*").in("account_id", ids).returns<FarmBuild[]>(),
        supabase.from("characters").select("*").in("game_id", PLANNER_GAMES).returns<Character[]>(),
        supabase.from("farm_inventory").select("*").in("account_id", ids).returns<FarmInventoryRow[]>(),
        supabase.from("farm_days").select("*").in("account_id", ids).gte("day", since).order("day", { ascending: false }).returns<FarmDay[]>(),
        supabase.from("game_versions").select("*").returns<GameVersion[]>(),
        supabase.from("farm_events").select("*").returns<FarmEvent[]>(),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const today = planned
    .filter((a) => (builds ?? []).some((b) => b.account_id === a.id && !b.done))
    .map((a) => {
      const game = (games ?? []).find((g) => g.id === a.game_id)!;
      const plan = planAccount({ game, account: a, builds: (builds ?? []).filter((b) => b.account_id === a.id), characters: (chars ?? []).filter((c) => c.game_id === a.game_id), inventory: (inv ?? []).filter((i) => i.account_id === a.id), log: (days ?? []).filter((d) => d.account_id === a.id), versions: versions ?? [], events: (events ?? []).filter((e) => e.game_id === a.game_id), now });
      return { a, game, plan, canEdit: roleOf.get(a.id) !== "viewer" };
    });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <Link href="/overview" className="btn-secondary">Overview: all accounts</Link>
      </div>

      {(notices ?? []).length > 0 && (
        <ul className="flex flex-col gap-2">
          {(notices ?? []).map((n) => (
            <li key={n.id} className="flex items-start justify-between gap-3 rounded border border-amber-300 bg-amber-50 p-2 text-sm">
              <span>{n.message}</span>
              <form action={dismissNotice}>
                <input type="hidden" name="id" value={n.id} />
                <button className="btn-secondary" type="submit">Dismiss</button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {today.length > 0 && (
        <section className="card flex flex-col gap-2">
          <h2 className="font-medium">Accounts today <span className="text-sm font-normal text-neutral-500">— each account&apos;s own server day · Done = you used its stamina today · Skip = it went elsewhere</span></h2>
          <table className="table text-sm">
            <thead><tr><th>Account</th><th>Day</th><th>Today&apos;s plan</th><th></th></tr></thead>
            <tbody>
              {today.map(({ a, game, plan, canEdit }) => {
                const logged = plan.todayLogged.length > 0 && !plan.todaySkipped;
                return (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap font-medium"><Link href={`/accounts/${a.id}/farm`} className="hover:underline">{a.name}</Link><div className="text-xs font-normal text-neutral-500">{game.name} · {a.server ?? "America"}</div></td>
                    <td className="whitespace-nowrap">{fmtDay(plan.today)}</td>
                    <td className={logged ? "text-neutral-500" : plan.notTicked > 0 ? "text-amber-700" : ""}>
                      {plan.todaySkipped ? "✕ Skipped" : logged ? `✓ ${plan.todayLogged.map((l) => l.text).filter(Boolean).join(" · ")}` : `${plan.notTicked > 0 ? `⚠ ${plan.notTicked} day(s) not ticked · ` : ""}${plan.todayText}`}
                    </td>
                    <td className="whitespace-nowrap">{canEdit && <DayButtons id={a.id} day={isoDay(plan.today)} logged={logged} skipped={plan.todaySkipped} action={logDay} returnTo="dashboard" />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {(games ?? []).map((g) => {
          const list = mine.filter((a) => a.game_id === g.id);
          return (
            <section key={g.id} className="card flex flex-col gap-2">
              <h2 className="font-medium">{g.name}</h2>
              <p className="text-xs text-neutral-500">
                {g.stamina_name}: {g.stamina_per_day}/day, cap {g.stamina_cap}
              </p>
              {list.length === 0 ? (
                <p className="text-sm text-neutral-500">No accounts yet.</p>
              ) : (
                <ul className="text-sm">
                  {list.map((a) => {
                    const role = roleOf.get(a.id);
                    return (
                      <li key={a.id}>
                        <Link href={`/accounts/${a.id}`} className="hover:underline">{a.name}</Link>
                        {a.server ? ` · ${a.server}` : ""}
                        {a.status !== "active" ? ` · ${a.status}` : ""}
                        {role !== "owner" ? ` · ${role}` : ""}
                        {a.verified_at ? " ✓" : ""}
                        <span className="text-neutral-400"> · <Link href={`/accounts/${a.id}/plan`} className="hover:underline">plan</Link> · <Link href={`/accounts/${a.id}/farm`} className="hover:underline">farm</Link></span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <Link href={`/accounts?game=${g.id}`} className="text-sm underline">Manage accounts</Link>
            </section>
          );
        })}
      </div>

      {(games ?? []).length === 0 && (
        <p className="text-sm text-amber-800">
          No games found. Run <code>supabase/seed.sql</code> in the Supabase SQL editor.
        </p>
      )}
    </div>
  );
}
