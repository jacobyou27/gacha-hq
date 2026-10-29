import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AccountCharacter, Character, Game, GameAccount } from "@/lib/types";

type Row = AccountCharacter & { character: Character };

/** Public, read-only view of an account. Only returns data when visibility = 'public' (RLS). */
export default async function PublicAccountPage({ params }: PageProps<"/p/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: account } = await supabase.from("game_accounts").select("*").eq("id", id).maybeSingle<GameAccount>();
  if (!account) notFound();

  const [{ data: game }, { data: rows }] = await Promise.all([
    supabase.from("games").select("*").eq("id", account.game_id).single<Game>(),
    supabase
      .from("account_characters")
      .select("*, character:characters(*)")
      .eq("account_id", id)
      .order("priority")
      .returns<Row[]>(),
  ]);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-4">
      <p className="text-xs text-neutral-500">
        <Link href="/" className="underline">Gacha HQ</Link> · public account page
      </p>
      <h1 className="mt-1 text-xl font-semibold">
        {game?.name} · {account.name}
        {account.verified_at && <span className="ml-2 text-sm font-normal text-neutral-500">verified ✓</span>}
      </h1>
      <p className="text-sm text-neutral-600">
        {account.server ?? ""}{account.uid ? ` · UID ${account.uid}` : ""}{account.world_level ? ` · level ${account.world_level}` : ""}
      </p>

      <table className="table mt-4">
        <thead>
          <tr><th>Character</th><th>★</th><th>{game?.element_label}</th><th>Owned</th><th>{game?.dupe_label}</th><th>Lv</th><th>Goal Lv</th><th>Want</th></tr>
        </thead>
        <tbody>
          {(rows ?? []).map((r) => (
            <tr key={r.id}>
              <td>{r.character.name}</td><td>{r.character.rarity}</td><td>{r.character.element ?? ""}</td>
              <td>{r.owned ? "✓" : ""}</td><td>{r.owned ? r.dupes : ""}</td><td>{r.level ?? ""}</td><td>{r.goal_level ?? ""}</td><td>{r.wanted ? "✓" : ""}</td>
            </tr>
          ))}
          {(rows ?? []).length === 0 && (
            <tr><td colSpan={8} className="text-neutral-500">No characters listed.</td></tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
