import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { VERIFIABLE_GAMES } from "@/lib/enka";
import type { AccountVisibility, Game, GameId, VerificationChallenge } from "@/lib/types";
import { checkVerification, startVerification } from "../accounts/verify-actions";

type Found = { id: string; owner_name: string; visibility: AccountVisibility; mine: boolean; verified: boolean };

export default async function ClaimPage({ searchParams }: PageProps<"/claim">) {
  const sp = await searchParams;
  const gameParam = typeof sp.game === "string" ? sp.game : "";
  const uid = typeof sp.uid === "string" ? sp.uid.trim() : "";
  const error = typeof sp.error === "string" ? sp.error : null;
  const message = typeof sp.message === "string" ? sp.message : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: games } = await supabase.from("games").select("*").order("sort_order").returns<Game[]>();
  const game = (games ?? []).find((g) => g.id === gameParam) ?? null;

  let found: Found | null = null;
  let challenge: VerificationChallenge | null = null;
  if (game && uid) {
    const { data } = await supabase.rpc("find_account_by_uid", { p_game_id: game.id, p_uid: uid });
    found = (((data ?? []) as unknown) as Found[])[0] ?? null;
    if (found && !found.mine) {
      const { data: ch } = await supabase
        .from("verification_challenges")
        .select("*")
        .eq("account_id", found.id)
        .eq("user_id", user!.id)
        .maybeSingle<VerificationChallenge>();
      challenge = ch ?? null;
    }
  }

  const returnTo = game ? `/claim?game=${game.id}&uid=${encodeURIComponent(uid)}` : "/claim";

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Claim an account by UID</h1>
        <p className="text-sm text-neutral-600">
          If someone else already added your in-game UID, prove it is yours by putting a code in your in-game
          signature. Ownership then moves to you (the previous owner keeps view access). Works for Genshin, HSR and
          ZZZ via Enka.Network; WuWa has no public API.
        </p>
      </div>

      {error && <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">{error}</p>}
      {message && <p className="rounded border border-green-300 bg-green-50 p-2 text-sm text-green-800">{message}</p>}

      <form method="get" className="card flex flex-wrap items-end gap-2">
        <label className="label">Game
          <select className="input" name="game" defaultValue={game?.id ?? ""} required>
            <option value="" disabled>Pick…</option>
            {(games ?? []).map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </label>
        <label className="label grow">UID
          <input className="input" name="uid" defaultValue={uid} required pattern="\d{5,12}" />
        </label>
        <button className="btn" type="submit">Look up</button>
      </form>

      {game && uid && (
        <section className="card flex flex-col gap-3 text-sm">
          {!found ? (
            <p>
              Nobody has claimed {game.name} UID {uid} yet. Just add it as a new account on the{" "}
              <Link href={`/accounts?game=${game.id}`} className="underline">Accounts</Link> page.
            </p>
          ) : found.mine ? (
            <p>
              That is already your account: <Link href={`/accounts/${found.id}`} className="underline">open it</Link>.
            </p>
          ) : (
            <>
              <p>
                {game.name} UID {uid} is currently owned by <b>{found.owner_name}</b>
                {found.verified ? " (verified)" : " (not verified)"}.
              </p>
              {!VERIFIABLE_GAMES.includes(game.id as GameId) ? (
                <p className="text-neutral-600">{game.name} cannot be verified automatically. Ask them to add you as a member or transfer ownership.</p>
              ) : challenge ? (
                <>
                  <p>
                    Put <code className="rounded bg-neutral-100 px-1 font-mono">{challenge.code}</code> in your in-game signature, save,
                    wait about a minute, then check. Valid until {new Date(challenge.expires_at).toLocaleString()}.
                  </p>
                  <div className="flex gap-2">
                    <form action={checkVerification}>
                      <input type="hidden" name="account_id" value={found.id} />
                      <input type="hidden" name="return_to" value={returnTo} />
                      <button className="btn" type="submit">Check signature now</button>
                    </form>
                    <form action={startVerification}>
                      <input type="hidden" name="account_id" value={found.id} />
                      <input type="hidden" name="return_to" value={returnTo} />
                      <button className="btn-secondary" type="submit">New code</button>
                    </form>
                  </div>
                </>
              ) : (
                <form action={startVerification}>
                  <input type="hidden" name="account_id" value={found.id} />
                  <input type="hidden" name="return_to" value={returnTo} />
                  <button className="btn" type="submit">Start verification to take ownership</button>
                </form>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
