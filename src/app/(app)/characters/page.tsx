import Link from "next/link";
import { GENSHIN_DATA } from "@/data/farm/genshin";
import { HSR_DATA } from "@/data/farm/hsr";
import { ZZZ_DATA } from "@/data/farm/zzz";
import { createClient } from "@/lib/supabase/server";
import type { Character, CharacterWant, Game, Profile } from "@/lib/types";
import { createCharacter, deleteCharacter, setWant, updateCharacter } from "./actions";

const WANTS = ["Want", "Kinda Want", "Okay With", "Never"] as const;

export default async function CharactersPage({ searchParams }: PageProps<"/characters">) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: games }, { data: profile }, { data: wantsRaw }] = await Promise.all([
    supabase.from("games").select("*").order("sort_order").returns<Game[]>(),
    supabase.from("profiles").select("id, display_name, is_admin").eq("id", user!.id).maybeSingle<Profile>(),
    supabase.from("character_wants").select("*").eq("user_id", user!.id).returns<CharacterWant[]>(),
  ]);
  const gameList = games ?? [];
  const game = gameList.find((g) => g.id === params.game) ?? gameList[0];
  const error = typeof params.error === "string" ? params.error : null;
  const message = typeof params.message === "string" ? params.message : null;
  const edit = typeof params.edit === "string" ? params.edit : null;
  const showAll = params.all === "1";
  const wantOf = new Map((wantsRaw ?? []).map((w) => [w.character_id, w]));

  const { data: chars } = game
    ? await supabase
        .from("characters")
        .select("*")
        .eq("game_id", game.id)
        .order("is_released")
        .order("version", { ascending: false })
        .order("rarity", { ascending: false })
        .order("name")
        .returns<Character[]>()
    : { data: [] as Character[] };
  const list = (chars ?? []).filter((c) => showAll || c.rarity >= 5 || c.is_limited);
  const isAdmin = !!profile?.is_admin;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Characters (master list)</h1>
        <p className="text-sm text-neutral-600">
          Shared by everyone. “Counts” = counts toward pull costs (limited 5★). Unreleased rows are leaks — add them early, set the version from the leak, and tick “released” when the patch drops.
          Your “want” column is private to you.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {gameList.map((g) => (
          <Link key={g.id} href={`/characters?game=${g.id}${showAll ? "&all=1" : ""}`} className={g.id === game?.id ? "btn" : "btn-secondary"}>{g.name}</Link>
        ))}
        <Link href={`/characters?game=${game?.id}${showAll ? "" : "&all=1"}`} className="ml-auto underline">{showAll ? "hide 4★ / standard" : "show all incl. 4★"}</Link>
      </div>

      {error && <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">{error}</p>}
      {message && <p className="rounded border border-green-300 bg-green-50 p-2 text-sm text-green-800">{message}</p>}

      {isAdmin && (
        <form action={createCharacter} className="card grid max-w-3xl gap-3 text-sm sm:grid-cols-4">
          <h2 className="font-medium sm:col-span-4">Add character to {game?.name} (official or leaked)</h2>
          <input type="hidden" name="game_id" value={game?.id} />
          <label className="label">Name<input className="input" name="name" required /></label>
          <label className="label">Rarity
            <select className="input" name="rarity" defaultValue="5"><option value="5">5★ / S</option><option value="4">4★ / A</option></select>
          </label>
          <label className="label">Version<input className="input" name="version" placeholder="7.3" /></label>
          <label className="label">Region<input className="input" name="region" /></label>
          <label className="label">{game?.element_label}<input className="input" name="element" /></label>
          <label className="label">{game?.class_label}<input className="input" name="weapon_type" /></label>
          <label className="label">Source<input className="input" name="source" placeholder="leak / official / who said it" /></label>
          <label className="label">Notes<input className="input" name="notes" /></label>
          {game?.id === "genshin" && (
            <>
              <label className="label">Talent books<input className="input" name="farm_books" list="gi-books" placeholder="Justice (Traveler: a|b|c)" /></label>
              <label className="label">Boss drop<input className="input" name="farm_boss" list="gi-boss" /></label>
              <label className="label">Weekly mat<input className="input" name="farm_weekly" list="gi-weekly" /></label>
              <label className="label">Specialty<input className="input" name="farm_specialty" /></label>
            </>
          )}
          {game?.id === "hsr" && (
            <>
              <label className="label">Trace mats (tier 3)<input className="input" name="farm_family" list="hsr-fam" /></label>
              <label className="label">Boss mat<input className="input" name="farm_boss" list="hsr-boss" /></label>
              <label className="label">Weekly mat<input className="input" name="farm_weekly" list="hsr-weekly" /></label>
              <label className="label">Cost profile<input className="input" name="farm_profile" list="hsr-profile" placeholder="P2 (5★) · P1 (4★) · P3 Remembrance · P4 Elation" /></label>
              <label className="label">Extra talent max (memo / Elation skill)<input className="input" name="farm_extra_max" placeholder="0" /></label>
              <label className="label">2nd extra talent max (memo talent)<input className="input" name="farm_extra2_max" placeholder="0" /></label>
            </>
          )}
          {game?.id === "zzz" && (
            <>
              <label className="label">Skill chips (tier 3)<input className="input" name="farm_family" list="zzz-fam" /></label>
              <label className="label">Promotion seal (tier 3)<input className="input" name="farm_seal" list="zzz-seal" /></label>
              <label className="label">Expert Challenge mat<input className="input" name="farm_boss" list="zzz-boss" /></label>
              <label className="label">Notorious Hunt mat<input className="input" name="farm_weekly" list="zzz-weekly" /></label>
              <label className="label">Cost profile<input className="input" name="farm_profile" list="zzz-profile" placeholder="P1" /></label>
              <label className="label">Chain Attack max<input className="input" name="farm_extra_max" placeholder="12" /></label>
            </>
          )}
          <div className="flex flex-wrap gap-4 sm:col-span-3">
            <label><input type="checkbox" name="is_limited" defaultChecked /> counts toward pulls</label>
            <label><input type="checkbox" name="is_free" /> free unit</label>
            <label><input type="checkbox" name="is_released" /> released (leave unticked for leaks)</label>
          </div>
          <button className="btn w-fit" type="submit">Add</button>
        </form>
      )}

      <table className="table">
        <thead>
          <tr>
            <th>Name</th><th>★</th><th>{game?.element_label}</th><th>{game?.class_label}</th><th>Ver</th><th>Counts</th><th>Status</th><th>My want</th>{isAdmin && <th></th>}
          </tr>
        </thead>
        <tbody>
          {list.map((c) => {
            const w = wantOf.get(c.id);
            if (isAdmin && edit === c.id) {
              return (
                <tr key={c.id} className="bg-neutral-50">
                  <td colSpan={9}>
                    <form action={updateCharacter} className="flex flex-wrap items-end gap-2 text-sm">
                      <input type="hidden" name="id" value={c.id} /><input type="hidden" name="game_id" value={c.game_id} />
                      <label className="label">Name<input className="input" name="name" defaultValue={c.name} /></label>
                      <label className="label">★<select className="input" name="rarity" defaultValue={String(c.rarity)}><option value="5">5</option><option value="4">4</option></select></label>
                      <label className="label">{game?.element_label}<input className="input w-24" name="element" defaultValue={c.element ?? ""} /></label>
                      <label className="label">{game?.class_label}<input className="input w-28" name="weapon_type" defaultValue={c.weapon_type ?? ""} /></label>
                      <label className="label">Region<input className="input w-28" name="region" defaultValue={c.region ?? ""} /></label>
                      <label className="label">Version<input className="input w-20" name="version" defaultValue={c.version ?? ""} /></label>
                      <label className="label">Source<input className="input w-28" name="source" defaultValue={c.source ?? ""} /></label>
                      {c.game_id === "genshin" && (
                        <>
                          <label className="label">Books<input className="input w-32" name="farm_books" list="gi-books" defaultValue={Array.isArray(c.farm?.books) ? (c.farm.books as string[]).join("|") : String(c.farm?.books ?? "")} /></label>
                          <label className="label">Boss drop<input className="input w-40" name="farm_boss" list="gi-boss" defaultValue={String(c.farm?.boss ?? "")} /></label>
                          <label className="label">Weekly mat<input className="input w-40" name="farm_weekly" list="gi-weekly" defaultValue={String(c.farm?.weekly ?? "")} /></label>
                        </>
                      )}
                      {c.game_id === "hsr" && (
                        <>
                          <label className="label">Trace mats<input className="input w-40" name="farm_family" list="hsr-fam" defaultValue={String(c.farm?.family ?? "")} /></label>
                          <label className="label">Boss mat<input className="input w-40" name="farm_boss" list="hsr-boss" defaultValue={String(c.farm?.boss ?? "")} /></label>
                          <label className="label">Weekly mat<input className="input w-40" name="farm_weekly" list="hsr-weekly" defaultValue={String(c.farm?.weekly ?? "")} /></label>
                          <label className="label">Profile<input className="input w-16" name="farm_profile" list="hsr-profile" defaultValue={String(c.farm?.profile ?? "")} /></label>
                          <label className="label">Extra max<input className="input w-14" name="farm_extra_max" defaultValue={String(c.farm?.extra_max ?? "")} /></label>
                          <label className="label">Extra2 max<input className="input w-14" name="farm_extra2_max" defaultValue={String(c.farm?.extra2_max ?? "")} /></label>
                        </>
                      )}
                      {c.game_id === "zzz" && (
                        <>
                          <label className="label">Chips<input className="input w-40" name="farm_family" list="zzz-fam" defaultValue={String(c.farm?.family ?? "")} /></label>
                          <label className="label">Seal<input className="input w-40" name="farm_seal" list="zzz-seal" defaultValue={String(c.farm?.seal ?? "")} /></label>
                          <label className="label">Expert mat<input className="input w-40" name="farm_boss" list="zzz-boss" defaultValue={String(c.farm?.boss ?? "")} /></label>
                          <label className="label">Notorious mat<input className="input w-40" name="farm_weekly" list="zzz-weekly" defaultValue={String(c.farm?.weekly ?? "")} /></label>
                          <label className="label">Profile<input className="input w-16" name="farm_profile" list="zzz-profile" defaultValue={String(c.farm?.profile ?? "")} /></label>
                          <label className="label">Chain max<input className="input w-14" name="farm_extra_max" defaultValue={String(c.farm?.extra_max ?? "")} /></label>
                        </>
                      )}
                      <label><input type="checkbox" name="is_limited" defaultChecked={c.is_limited} /> counts</label>
                      <label><input type="checkbox" name="is_free" defaultChecked={c.is_free} /> free</label>
                      <label><input type="checkbox" name="is_released" defaultChecked={c.is_released} /> released</label>
                      <button className="btn" type="submit">Save</button>
                      <Link className="btn-secondary" href={`/characters?game=${c.game_id}`}>Cancel</Link>
                    </form>
                  </td>
                </tr>
              );
            }
            return (
              <tr key={c.id} className={c.is_released ? "" : "text-neutral-500"}>
                <td>{c.name}{c.is_free ? <span className="text-neutral-400"> (free)</span> : ""}</td>
                <td>{c.rarity}</td>
                <td>{c.element ?? ""}</td>
                <td>{c.weapon_type ?? ""}</td>
                <td>{c.version ?? ""}</td>
                <td>{c.is_limited ? "Y" : ""}</td>
                <td>{c.is_released ? "" : `leak${c.source && c.source !== "leak" ? ` (${c.source})` : ""}`}</td>
                <td>
                  <form action={setWant} className="flex gap-1">
                    <input type="hidden" name="game_id" value={c.game_id} /><input type="hidden" name="character_id" value={c.id} />
                    <select className="input w-32" name="want" defaultValue={w?.want ?? ""}>
                      <option value="">—</option>
                      {WANTS.map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                    <input className="input w-36" name="note" defaultValue={w?.note ?? ""} placeholder="for which accounts" />
                    <button className="btn-secondary" type="submit">Save</button>
                  </form>
                </td>
                {isAdmin && (
                  <td className="whitespace-nowrap">
                    <Link className="btn-secondary" href={`/characters?game=${c.game_id}&edit=${c.id}${showAll ? "&all=1" : ""}`}>Edit</Link>{" "}
                    <form action={deleteCharacter} className="inline"><input type="hidden" name="id" value={c.id} /><input type="hidden" name="game_id" value={c.game_id} /><button className="btn-secondary" type="submit">✕</button></form>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-xs text-neutral-500">{list.length} shown of {(chars ?? []).length}.</p>
      <datalist id="gi-books">{GENSHIN_DATA.bookDomains.map((b) => <option key={b.series} value={b.series} />)}</datalist>
      <datalist id="gi-boss">{GENSHIN_DATA.bosses.map((b) => <option key={b.drop} value={b.drop} />)}</datalist>
      <datalist id="gi-weekly">{GENSHIN_DATA.weeklyBosses.map((w) => <option key={w.mat} value={w.mat} />)}</datalist>
      <datalist id="hsr-fam">{HSR_DATA.families.map((f) => <option key={f.t3} value={f.t3} />)}</datalist>
      <datalist id="hsr-boss">{HSR_DATA.bosses.map((b) => <option key={b.mat} value={b.mat} />)}</datalist>
      <datalist id="hsr-weekly">{HSR_DATA.weeklies.map((w) => <option key={w.mat} value={w.mat} />)}</datalist>
      <datalist id="hsr-profile">{["P1", "P2", "P3", "P4", "P5", "P6", "P7"].map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="zzz-fam">{ZZZ_DATA.families.filter((f) => f.farm.endsWith("Agent Skill")).map((f) => <option key={f.t3} value={f.t3} />)}</datalist>
      <datalist id="zzz-seal">{ZZZ_DATA.families.filter((f) => f.farm.endsWith("Agent Promotion")).map((f) => <option key={f.t3} value={f.t3} />)}</datalist>
      <datalist id="zzz-boss">{ZZZ_DATA.bosses.map((b) => <option key={b.mat} value={b.mat} />)}</datalist>
      <datalist id="zzz-weekly">{ZZZ_DATA.weeklies.map((w) => <option key={w.mat} value={w.mat} />)}</datalist>
      <datalist id="zzz-profile">{Array.from(new Set(ZZZ_DATA.costs.filter((c) => c.slot === "ASC").map((c) => c.profile))).map((x) => <option key={x} value={x} />)}</datalist>
    </div>
  );
}
