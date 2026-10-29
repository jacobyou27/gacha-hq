import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VERIFIABLE_GAMES } from "@/lib/enka";
import type {
  AccountCharacter,
  AccountMember,
  Character,
  Game,
  GameAccount,
  VerificationChallenge,
} from "@/lib/types";
import {
  addAccountCharacter,
  deleteAccount,
  removeAccountCharacter,
  updateAccount,
  updateAccountCharacter,
} from "../actions";
import { inviteMember, removeMember, setVisibility, transferOwnership } from "../sharing-actions";
import { checkVerification, startVerification } from "../verify-actions";

type Row = AccountCharacter & { character: Character };

export default async function AccountPage({ params, searchParams }: PageProps<"/accounts/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;
  const message = typeof sp.message === "string" ? sp.message : null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: account } = await supabase
    .from("game_accounts")
    .select("*")
    .eq("id", id)
    .maybeSingle<GameAccount>();
  if (!account) notFound();

  const [{ data: game }, { data: rows }, { data: allChars }, { data: membersRaw }, { data: challenge }] =
    await Promise.all([
      supabase.from("games").select("*").eq("id", account.game_id).single<Game>(),
      supabase
        .from("account_characters")
        .select("*, character:characters(*)")
        .eq("account_id", id)
        .order("priority")
        .returns<Row[]>(),
      supabase
        .from("characters")
        .select("*")
        .eq("game_id", account.game_id)
        .order("rarity", { ascending: false })
        .order("name")
        .returns<Character[]>(),
      supabase.rpc("account_member_list", { acct: id }),
      supabase
        .from("verification_challenges")
        .select("*")
        .eq("account_id", id)
        .eq("user_id", user!.id)
        .maybeSingle<VerificationChallenge>(),
    ]);

  const members = ((membersRaw ?? []) as unknown) as AccountMember[];
  const me = members.find((m) => m.user_id === user!.id);
  const role = me?.role ?? null; // null = public viewer
  const isOwner = role === "owner";
  const canEdit = role === "owner" || role === "editor";
  const verifiable = VERIFIABLE_GAMES.includes(account.game_id);

  const used = new Set((rows ?? []).map((r) => r.character_id));
  const addable = (allChars ?? []).filter((c) => !used.has(c.id));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/accounts?game=${account.game_id}`} className="text-sm underline">
          ← {game?.name} accounts
        </Link>
        <h1 className="text-xl font-semibold">
          {game?.name} · {account.name}
          <span className="ml-2 text-sm font-normal text-neutral-500">
            {role ?? "public"}
            {account.verified_at ? " · verified ✓" : ""}
            {account.visibility === "public" ? " · public" : ""}
          </span>
        </h1>
      </div>

      {error && <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">{error}</p>}
      {message && <p className="rounded border border-green-300 bg-green-50 p-2 text-sm text-green-800">{message}</p>}

      {/* ---------------------------------------------------- account form */}
      {isOwner ? (
        <form action={updateAccount} className="card grid gap-3 sm:grid-cols-3">
          <input type="hidden" name="id" value={account.id} />
          <label className="label">Name<input className="input" name="name" defaultValue={account.name} required /></label>
          <label className="label">Server<input className="input" name="server" defaultValue={account.server ?? ""} /></label>
          <label className="label">UID<input className="input" name="uid" defaultValue={account.uid ?? ""} /></label>
          <label className="label">Status
            <select className="input" name="status" defaultValue={account.status}>
              <option value="active">active</option>
              <option value="paused">paused</option>
              <option value="dropped">dropped</option>
            </select>
          </label>
          <label className="label">World / account level<input className="input" type="number" name="world_level" defaultValue={account.world_level ?? ""} /></label>
          <label className="label">Sort order<input className="input" type="number" name="sort_order" defaultValue={account.sort_order} /></label>
          <label className="label">Colour (hex)<input className="input" name="color" defaultValue={account.color ?? ""} placeholder="#4a86e8" /></label>
          <label className="label sm:col-span-2">Notes<input className="input" name="notes" defaultValue={account.notes ?? ""} /></label>
          <div className="sm:col-span-3"><button className="btn" type="submit">Save</button></div>
        </form>
      ) : (
        <dl className="card grid gap-2 text-sm sm:grid-cols-3">
          <div><dt className="text-neutral-500">Server</dt><dd>{account.server ?? "—"}</dd></div>
          <div><dt className="text-neutral-500">UID</dt><dd>{account.uid ?? "—"}</dd></div>
          <div><dt className="text-neutral-500">Status</dt><dd>{account.status}</dd></div>
          <div><dt className="text-neutral-500">World / account level</dt><dd>{account.world_level ?? "—"}</dd></div>
          <div className="sm:col-span-2"><dt className="text-neutral-500">Notes</dt><dd>{account.notes ?? "—"}</dd></div>
        </dl>
      )}

      {/* ------------------------------------------------------ characters */}
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Characters on this account</h2>
        <p className="text-xs text-neutral-500">
          {game?.dupe_label}s are 0–{game?.max_dupes} (0 = one copy). Level max {game?.max_level}. Lower priority number = planned first.
          {!canEdit && " You have read-only access."}
        </p>

        <table className="table">
          <thead>
            <tr>
              <th>Character</th><th>Owned</th><th>{game?.dupe_label}</th><th>Goal</th><th>Want</th><th>Free</th><th>Lv</th><th>Goal Lv</th><th>Prio</th><th>Notes</th>{canEdit && <th></th>}
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r) =>
              canEdit ? (
                <tr key={r.id}>
                  <td>
                    <form action={updateAccountCharacter} id={`f-${r.id}`} className="contents">
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="account_id" value={account.id} />
                    </form>
                    {r.character.name} <span className="text-neutral-500">{r.character.rarity}★{r.character.element ? ` ${r.character.element}` : ""}</span>
                  </td>
                  <td><input form={`f-${r.id}`} type="checkbox" name="owned" defaultChecked={r.owned} /></td>
                  <td><input form={`f-${r.id}`} className="input w-14" type="number" name="dupes" min={0} max={game?.max_dupes} defaultValue={r.dupes} /></td>
                  <td><input form={`f-${r.id}`} className="input w-14" type="number" name="goal_dupes" min={0} max={game?.max_dupes} defaultValue={r.goal_dupes ?? ""} /></td>
                  <td><input form={`f-${r.id}`} type="checkbox" name="wanted" defaultChecked={r.wanted} /></td>
                  <td><input form={`f-${r.id}`} className="input w-14" type="number" name="free_copies" min={0} defaultValue={r.free_copies} /></td>
                  <td><input form={`f-${r.id}`} className="input w-16" type="number" name="level" min={1} max={game?.max_level} defaultValue={r.level ?? ""} /></td>
                  <td><input form={`f-${r.id}`} className="input w-16" type="number" name="goal_level" min={1} max={game?.max_level} defaultValue={r.goal_level ?? ""} /></td>
                  <td><input form={`f-${r.id}`} className="input w-14" type="number" name="priority" defaultValue={r.priority} /></td>
                  <td><input form={`f-${r.id}`} className="input" name="notes" defaultValue={r.notes ?? ""} /></td>
                  <td className="whitespace-nowrap">
                    <button form={`f-${r.id}`} className="btn" type="submit">Save</button>{" "}
                    <form action={removeAccountCharacter} className="inline">
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="account_id" value={account.id} />
                      <button className="btn-secondary" type="submit">✕</button>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr key={r.id}>
                  <td>{r.character.name} <span className="text-neutral-500">{r.character.rarity}★{r.character.element ? ` ${r.character.element}` : ""}</span></td>
                  <td>{r.owned ? "✓" : ""}</td><td>{r.dupes}</td><td>{r.goal_dupes ?? ""}</td><td>{r.wanted ? "✓" : ""}</td><td>{r.free_copies}</td>
                  <td>{r.level ?? ""}</td><td>{r.goal_level ?? ""}</td><td>{r.priority}</td><td className="text-neutral-600">{r.notes ?? ""}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>

        {canEdit && (
          <form action={addAccountCharacter} className="card flex max-w-md flex-col gap-3">
            <h3 className="font-medium">Add character</h3>
            <input type="hidden" name="account_id" value={account.id} />
            <select className="input" name="character_id" required defaultValue="">
              <option value="" disabled>Pick a character…</option>
              {addable.map((c) => (
                <option key={c.id} value={c.id}>{c.rarity}★ {c.name}{c.element ? ` (${c.element})` : ""}</option>
              ))}
            </select>
            <div className="flex gap-4 text-sm">
              <label><input type="checkbox" name="owned" /> owned</label>
              <label><input type="checkbox" name="wanted" /> want to pull</label>
            </div>
            <button className="btn w-fit" type="submit">Add</button>
          </form>
        )}
      </section>

      {/* ---------------------------------------------------------- sharing */}
      {role && (
        <section className="card flex flex-col gap-4">
          <h2 className="font-medium">Sharing</h2>

          <div className="text-sm">
            <span className="text-neutral-500">Visibility: </span>
            {account.visibility === "public" ? (
              <>public — anyone with the link can view: <Link href={`/p/${account.id}`} className="underline">/p/{account.id}</Link></>
            ) : (
              "private — members only"
            )}
            {isOwner && (
              <form action={setVisibility} className="mt-2 flex items-center gap-2">
                <input type="hidden" name="id" value={account.id} />
                <input type="hidden" name="visibility" value={account.visibility === "public" ? "private" : "public"} />
                <button className="btn-secondary" type="submit">
                  {account.visibility === "public" ? "Make private" : "Make public"}
                </button>
              </form>
            )}
          </div>

          <table className="table max-w-xl">
            <thead><tr><th>Member</th><th>Role</th>{isOwner && <th></th>}</tr></thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.user_id}>
                  <td>{m.display_name}{m.user_id === user!.id ? " (you)" : ""}</td>
                  <td>{m.role}</td>
                  {isOwner && (
                    <td className="whitespace-nowrap">
                      {m.role !== "owner" && (
                        <>
                          <form action={transferOwnership} className="inline">
                            <input type="hidden" name="id" value={account.id} />
                            <input type="hidden" name="user_id" value={m.user_id} />
                            <button className="btn-secondary" type="submit">Make owner</button>
                          </form>{" "}
                          <form action={removeMember} className="inline">
                            <input type="hidden" name="id" value={account.id} />
                            <input type="hidden" name="user_id" value={m.user_id} />
                            <button className="btn-secondary" type="submit">Remove</button>
                          </form>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {isOwner ? (
            <form action={inviteMember} className="flex max-w-xl flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={account.id} />
              <label className="label grow">Add member by email (they must have signed up)
                <input className="input" type="email" name="email" required />
              </label>
              <label className="label">Role
                <select className="input" name="role" defaultValue="viewer">
                  <option value="viewer">viewer (read-only)</option>
                  <option value="editor">editor (characters)</option>
                </select>
              </label>
              <button className="btn" type="submit">Add</button>
            </form>
          ) : (
            <form action={removeMember}>
              <input type="hidden" name="id" value={account.id} />
              <input type="hidden" name="user_id" value={user!.id} />
              <input type="hidden" name="self" value="1" />
              <button className="btn-secondary" type="submit">Leave this account</button>
            </form>
          )}
        </section>
      )}

      {/* ----------------------------------------------------- verification */}
      {role && (
        <section className="card flex flex-col gap-3 text-sm">
          <h2 className="font-medium">Ownership verification</h2>
          {account.verified_at ? (
            <p>Verified on {new Date(account.verified_at).toLocaleDateString()} via in-game signature.</p>
          ) : (
            <p className="text-neutral-600">Not verified. A verified account cannot be taken over by someone else merely claiming the same UID.</p>
          )}
          {!verifiable ? (
            <p className="text-neutral-500">{game?.name} has no public profile API, so signature verification is not available for it.</p>
          ) : !account.uid ? (
            <p className="text-neutral-500">Set the UID above first.</p>
          ) : challenge ? (
            <>
              <p>
                Put <code className="rounded bg-neutral-100 px-1 font-mono">{challenge.code}</code> in your in-game signature
                (Genshin: Paimon menu → profile; HSR: phone → profile; ZZZ: Inter-Knot profile), save, wait about a minute, then check.
                Code valid until {new Date(challenge.expires_at).toLocaleString()}.
              </p>
              <div className="flex gap-2">
                <form action={checkVerification}>
                  <input type="hidden" name="account_id" value={account.id} />
                  <button className="btn" type="submit">Check signature now</button>
                </form>
                <form action={startVerification}>
                  <input type="hidden" name="account_id" value={account.id} />
                  <button className="btn-secondary" type="submit">New code</button>
                </form>
              </div>
            </>
          ) : (
            <form action={startVerification}>
              <input type="hidden" name="account_id" value={account.id} />
              <button className="btn-secondary" type="submit">
                {account.verified_at ? "Re-verify" : "Start verification"}
              </button>
            </form>
          )}
        </section>
      )}

      {isOwner && (
        <form action={deleteAccount}>
          <input type="hidden" name="id" value={account.id} />
          <input type="hidden" name="game_id" value={account.game_id} />
          <button className="btn-secondary text-red-700" type="submit">
            Delete this account (and its character rows)
          </button>
        </form>
      )}
    </div>
  );
}
