import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Friend, Game, GameAccount } from "@/lib/types";
import { acceptFriend, removeFriend, sendFriendRequest } from "./actions";

export default async function FriendsPage({ searchParams }: PageProps<"/friends">) {
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;
  const message = typeof sp.message === "string" ? sp.message : null;
  const supabase = await createClient();

  const [{ data: friendsRaw }, { data: games }] = await Promise.all([
    supabase.rpc("friend_list"),
    supabase.from("games").select("id, name").returns<Pick<Game, "id" | "name">[]>(),
  ]);
  const friends = ((friendsRaw ?? []) as unknown) as Friend[];
  const gameName = new Map((games ?? []).map((g) => [g.id, g.name]));

  const accepted = friends.filter((f) => f.status === "accepted");
  const visible = await Promise.all(
    accepted.map(async (f) => {
      const { data } = await supabase.rpc("visible_accounts_of", { owner: f.user_id });
      return [f.user_id, ((data ?? []) as unknown) as GameAccount[]] as const;
    }),
  );
  const accountsOf = new Map(visible);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Friends</h1>
        <p className="text-sm text-neutral-600">Friends see each other&apos;s public accounts here, plus any account shared with them directly. Sharing an account is still done per account (Sharing → add member).</p>
      </div>
      {error && <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">{error}</p>}
      {message && <p className="rounded border border-green-300 bg-green-50 p-2 text-sm text-green-800">{message}</p>}

      <form action={sendFriendRequest} className="card flex flex-wrap items-end gap-2 text-sm">
        <label className="label grow">Add a friend by email (they must have signed up)<input className="input" type="email" name="email" required /></label>
        <button className="btn" type="submit">Send request</button>
      </form>

      {friends.filter((f) => f.status === "pending").length > 0 && (
        <section className="card text-sm">
          <h2 className="mb-2 font-medium">Pending</h2>
          <ul className="flex flex-col gap-1">
            {friends.filter((f) => f.status === "pending").map((f) => (
              <li key={f.user_id} className="flex items-center gap-2">
                <span>{f.display_name}</span>
                <span className="text-neutral-500">{f.direction === "received" ? "wants to be friends" : "request sent"}</span>
                {f.direction === "received" && (
                  <form action={acceptFriend}><input type="hidden" name="user_id" value={f.user_id} /><button className="btn" type="submit">Accept</button></form>
                )}
                <form action={removeFriend}><input type="hidden" name="user_id" value={f.user_id} /><button className="btn-secondary" type="submit">{f.direction === "received" ? "Decline" : "Cancel"}</button></form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3">
        {accepted.length === 0 && <p className="text-sm text-neutral-500">No friends yet.</p>}
        {accepted.map((f) => {
          const accts = accountsOf.get(f.user_id) ?? [];
          return (
            <div key={f.user_id} className="card text-sm">
              <div className="flex items-center justify-between">
                <h2 className="font-medium">{f.display_name}</h2>
                <form action={removeFriend}><input type="hidden" name="user_id" value={f.user_id} /><button className="btn-secondary" type="submit">Remove</button></form>
              </div>
              {accts.length === 0 ? (
                <p className="text-neutral-500">No accounts visible to you (ask them to make one public or add you as a member).</p>
              ) : (
                <ul className="mt-2">
                  {accts.map((a) => (
                    <li key={a.id}>
                      <Link href={`/accounts/${a.id}`} className="underline">{gameName.get(a.game_id)} · {a.name}</Link>
                      {a.visibility === "public" ? " · public" : " · shared with you"}{a.verified_at ? " ✓" : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
