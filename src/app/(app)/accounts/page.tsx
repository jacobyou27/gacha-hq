import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { AccountRole, Game, GameAccount } from "@/lib/types";
import { createAccount } from "./actions";

export default async function AccountsPage({ searchParams }: PageProps<"/accounts">) {
  const params = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ data: games }, { data: accounts }, { data: memberships }] = await Promise.all([
    supabase.from("games").select("*").order("sort_order").returns<Game[]>(),
    supabase
      .from("game_accounts")
      .select("*")
      .order("sort_order")
      .order("created_at")
      .returns<GameAccount[]>(),
    supabase
      .from("account_members")
      .select("account_id, role")
      .eq("user_id", user!.id)
      .returns<{ account_id: string; role: AccountRole }[]>(),
  ]);
  const roleOf = new Map((memberships ?? []).map((m) => [m.account_id, m.role]));

  const gameList = games ?? [];
  const selected =
    gameList.find((g) => g.id === params.game)?.id ?? gameList[0]?.id ?? "";
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Accounts</h1>

      <div className="flex flex-wrap gap-2 text-sm">
        {gameList.map((g) => (
          <Link
            key={g.id}
            href={`/accounts?game=${g.id}`}
            className={g.id === selected ? "btn" : "btn-secondary"}
          >
            {g.name}
          </Link>
        ))}
      </div>

      {error && (
        <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">{error}</p>
      )}

      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Server</th>
            <th>UID</th>
            <th>Status</th>
            <th>Level</th>
            <th>Your role</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {(accounts ?? [])
            .filter((a) => a.game_id === selected && roleOf.has(a.id))
            .map((a) => (
              <tr key={a.id}>
                <td>
                  <Link href={`/accounts/${a.id}`} className="underline">
                    {a.name}
                  </Link>
                  {a.verified_at ? " ✓" : ""}
                  {a.visibility === "public" ? <span className="text-neutral-500"> · public</span> : ""}
                </td>
                <td>{a.server ?? ""}</td>
                <td>{a.uid ?? ""}</td>
                <td>{a.status}</td>
                <td>{a.world_level ?? ""}</td>
                <td>{roleOf.get(a.id)}</td>
                <td className="text-neutral-600">{a.notes ?? ""}</td>
              </tr>
            ))}
        </tbody>
      </table>

      <form action={createAccount} className="card flex max-w-md flex-col gap-3">
        <h2 className="font-medium">Add account</h2>
        <label className="label">
          Game
          <select className="input" name="game_id" defaultValue={selected} required>
            {gameList.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label className="label">
          Name (main, pastel, joint…)
          <input className="input" name="name" required />
        </label>
        <label className="label">
          Server
          <input className="input" name="server" placeholder="Asia / America / Europe" />
        </label>
        <label className="label">
          UID (optional; one account per UID — if someone else already added yours, use{" "}
          <Link href="/claim" className="underline">Claim UID</Link>)
          <input className="input" name="uid" />
        </label>
        <button className="btn w-fit" type="submit">
          Add
        </button>
      </form>
    </div>
  );
}
