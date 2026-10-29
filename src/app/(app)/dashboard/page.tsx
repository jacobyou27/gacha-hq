import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { AccountRole, Game, GameAccount, Notice } from "@/lib/types";
import { dismissNotice } from "./actions";

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

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>

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
