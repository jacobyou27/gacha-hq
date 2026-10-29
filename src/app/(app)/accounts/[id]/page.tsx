import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AccountCharacter, Character, Game, GameAccount } from "@/lib/types";
import {
  addAccountCharacter,
  deleteAccount,
  removeAccountCharacter,
  updateAccount,
  updateAccountCharacter,
} from "../actions";

type Row = AccountCharacter & { character: Character };

export default async function AccountPage({ params, searchParams }: PageProps<"/accounts/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;
  const supabase = await createClient();

  const { data: account } = await supabase
    .from("game_accounts")
    .select("*")
    .eq("id", id)
    .maybeSingle<GameAccount>();
  if (!account) notFound();

  const [{ data: game }, { data: rows }, { data: allChars }] = await Promise.all([
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
  ]);

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
        </h1>
      </div>

      {error && (
        <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">{error}</p>
      )}

      {/* ---------------------------------------------------- account form */}
      <form action={updateAccount} className="card grid gap-3 sm:grid-cols-3">
        <input type="hidden" name="id" value={account.id} />
        <label className="label">
          Name
          <input className="input" name="name" defaultValue={account.name} required />
        </label>
        <label className="label">
          Server
          <input className="input" name="server" defaultValue={account.server ?? ""} />
        </label>
        <label className="label">
          UID
          <input className="input" name="uid" defaultValue={account.uid ?? ""} />
        </label>
        <label className="label">
          Status
          <select className="input" name="status" defaultValue={account.status}>
            <option value="active">active</option>
            <option value="paused">paused</option>
            <option value="dropped">dropped</option>
          </select>
        </label>
        <label className="label">
          World / account level
          <input className="input" type="number" name="world_level" defaultValue={account.world_level ?? ""} />
        </label>
        <label className="label">
          Sort order
          <input className="input" type="number" name="sort_order" defaultValue={account.sort_order} />
        </label>
        <label className="label">
          Colour (hex)
          <input className="input" name="color" defaultValue={account.color ?? ""} placeholder="#4a86e8" />
        </label>
        <label className="label sm:col-span-2">
          Notes
          <input className="input" name="notes" defaultValue={account.notes ?? ""} />
        </label>
        <div className="flex gap-2 sm:col-span-3">
          <button className="btn" type="submit">Save</button>
        </div>
      </form>

      <form action={deleteAccount} className="flex gap-2">
        <input type="hidden" name="id" value={account.id} />
        <input type="hidden" name="game_id" value={account.game_id} />
        <button className="btn-secondary text-red-700" type="submit">
          Delete this account (and its character rows)
        </button>
      </form>

      {/* ------------------------------------------------------ characters */}
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Characters on this account</h2>
        <p className="text-xs text-neutral-500">
          {game?.dupe_label}s are 0–{game?.max_dupes} (0 = one copy). Level max {game?.max_level}.
          Lower priority number = planned first.
        </p>

        <table className="table">
          <thead>
            <tr>
              <th>Character</th>
              <th>Owned</th>
              <th>{game?.dupe_label}</th>
              <th>Goal</th>
              <th>Want</th>
              <th>Free</th>
              <th>Lv</th>
              <th>Goal Lv</th>
              <th>Prio</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r) => (
              <tr key={r.id}>
                <td>
                  <form action={updateAccountCharacter} id={`f-${r.id}`} className="contents">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="account_id" value={account.id} />
                  </form>
                  {r.character.name}{" "}
                  <span className="text-neutral-500">
                    {r.character.rarity}★{r.character.element ? ` ${r.character.element}` : ""}
                  </span>
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
            ))}
          </tbody>
        </table>

        <form action={addAccountCharacter} className="card flex max-w-md flex-col gap-3">
          <h3 className="font-medium">Add character</h3>
          <input type="hidden" name="account_id" value={account.id} />
          <select className="input" name="character_id" required defaultValue="">
            <option value="" disabled>
              Pick a character…
            </option>
            {addable.map((c) => (
              <option key={c.id} value={c.id}>
                {c.rarity}★ {c.name}
                {c.element ? ` (${c.element})` : ""}
              </option>
            ))}
          </select>
          <div className="flex gap-4 text-sm">
            <label><input type="checkbox" name="owned" /> owned</label>
            <label><input type="checkbox" name="wanted" /> want to pull</label>
          </div>
          <button className="btn w-fit" type="submit">Add</button>
          {addable.length === 0 && (
            <p className="text-xs text-neutral-500">
              Every character in the list is already on this account. Admins can add more on the{" "}
              <Link href={`/characters?game=${account.game_id}`} className="underline">Characters</Link> page.
            </p>
          )}
        </form>
      </section>
    </div>
  );
}
