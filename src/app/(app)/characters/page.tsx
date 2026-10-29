import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Character, Game, Profile } from "@/lib/types";
import { createCharacter, deleteCharacter } from "./actions";

export default async function CharactersPage({ searchParams }: PageProps<"/characters">) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: games }, { data: profile }] = await Promise.all([
    supabase.from("games").select("*").order("sort_order").returns<Game[]>(),
    supabase.from("profiles").select("id, display_name, is_admin").eq("id", user!.id).maybeSingle<Profile>(),
  ]);
  const gameList = games ?? [];
  const game = gameList.find((g) => g.id === params.game) ?? gameList[0];
  const error = typeof params.error === "string" ? params.error : null;

  const { data: chars } = game
    ? await supabase
        .from("characters")
        .select("*")
        .eq("game_id", game.id)
        .order("rarity", { ascending: false })
        .order("version")
        .order("name")
        .returns<Character[]>()
    : { data: [] as Character[] };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Characters (master list)</h1>

      <div className="flex flex-wrap gap-2 text-sm">
        {gameList.map((g) => (
          <Link key={g.id} href={`/characters?game=${g.id}`} className={g.id === game?.id ? "btn" : "btn-secondary"}>
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
            <th>★</th>
            <th>{game?.element_label}</th>
            <th>{game?.class_label}</th>
            <th>Version</th>
            <th>Counts</th>
            <th>Free</th>
            <th>Released</th>
            {profile?.is_admin && <th></th>}
          </tr>
        </thead>
        <tbody>
          {(chars ?? []).map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td>{c.rarity}</td>
              <td>{c.element ?? ""}</td>
              <td>{c.weapon_type ?? ""}</td>
              <td>{c.version ?? ""}</td>
              <td>{c.is_limited ? "Y" : ""}</td>
              <td>{c.is_free ? "Y" : ""}</td>
              <td>{c.is_released ? "" : "leak"}</td>
              {profile?.is_admin && (
                <td>
                  <form action={deleteCharacter}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="game_id" value={c.game_id} />
                    <button className="btn-secondary" type="submit">✕</button>
                  </form>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {profile?.is_admin ? (
        <form action={createCharacter} className="card grid max-w-2xl gap-3 sm:grid-cols-3">
          <h2 className="font-medium sm:col-span-3">Add character to {game?.name}</h2>
          <input type="hidden" name="game_id" value={game?.id} />
          <label className="label">Name<input className="input" name="name" required /></label>
          <label className="label">Rarity
            <select className="input" name="rarity" defaultValue="5">
              <option value="5">5★ / S</option>
              <option value="4">4★ / A</option>
            </select>
          </label>
          <label className="label">Version<input className="input" name="version" placeholder="7.1" /></label>
          <label className="label">{game?.element_label}<input className="input" name="element" /></label>
          <label className="label">{game?.class_label}<input className="input" name="weapon_type" /></label>
          <div className="flex flex-col gap-1 text-sm">
            <label><input type="checkbox" name="is_limited" defaultChecked /> counts toward pulls (limited)</label>
            <label><input type="checkbox" name="is_free" /> free unit</label>
            <label><input type="checkbox" name="is_released" defaultChecked /> released</label>
          </div>
          <button className="btn w-fit" type="submit">Add</button>
        </form>
      ) : (
        <p className="text-xs text-neutral-500">Only admins can edit the master list.</p>
      )}
    </div>
  );
}
