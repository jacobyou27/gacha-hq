import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Game, GameAccount } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = await createClient();

  const [{ data: games }, { data: accounts }] = await Promise.all([
    supabase.from("games").select("*").order("sort_order").returns<Game[]>(),
    supabase
      .from("game_accounts")
      .select("*")
      .order("game_id")
      .order("sort_order")
      .returns<GameAccount[]>(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        {(games ?? []).map((g) => {
          const mine = (accounts ?? []).filter((a) => a.game_id === g.id);
          return (
            <section key={g.id} className="card flex flex-col gap-2">
              <h2 className="font-medium">{g.name}</h2>
              <p className="text-xs text-neutral-500">
                {g.stamina_name}: {g.stamina_per_day}/day, cap {g.stamina_cap}
              </p>
              {mine.length === 0 ? (
                <p className="text-sm text-neutral-500">No accounts yet.</p>
              ) : (
                <ul className="text-sm">
                  {mine.map((a) => (
                    <li key={a.id}>
                      <Link href={`/accounts/${a.id}`} className="hover:underline">
                        {a.name}
                      </Link>
                      {a.server ? ` · ${a.server}` : ""}
                      {a.status !== "active" ? ` · ${a.status}` : ""}
                    </li>
                  ))}
                </ul>
              )}
              <Link href={`/accounts?game=${g.id}`} className="text-sm underline">
                Manage accounts
              </Link>
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
