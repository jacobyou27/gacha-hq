import { loadFarm } from "@/lib/farm/load";
import { saveInventory } from "../actions";
import { FarmNav } from "../ui";
import { GenshinInventory, type GenshinPlan } from "../genshin";
import { HsrInventory, type HsrPlan } from "../hsr";

export default async function InventoryPage({ params, searchParams }: PageProps<"/accounts/[id]/farm/inventory">) {
  const { id } = await params;
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;
  const message = typeof sp.message === "string" ? sp.message : null;
  const { account, game, inventory, canEdit, plan } = await loadFarm(id);
  const isGenshin = game.id === "genshin";
  return (
    <div className="flex flex-col gap-6">
      <FarmNav id={id} game={game} account={account} active="inventory" />
      {error && <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">{error}</p>}
      {message && <p className="rounded border border-green-300 bg-green-50 p-2 text-sm text-green-800">{message}</p>}
      <p className="text-sm text-neutral-600">What this account owns. Need = what the unfinished builds still need (before inventory); Short by = what is missing. Saving stamps the count, so runs logged before now stop being subtracted (nothing is counted twice). {isGenshin ? "Books and weapon mats count 3 lower = 1 higher." : "Trace materials count 3 lower = 1 higher (Omni-Synthesizer)."}</p>
      <form action={saveInventory} className="flex flex-col gap-6 text-sm">
        <input type="hidden" name="account_id" value={id} />
        {canEdit && <div><button className="btn" type="submit">Save inventory</button></div>}
        {isGenshin ? <GenshinInventory plan={plan as GenshinPlan} inventory={inventory} canEdit={canEdit} /> : <HsrInventory plan={plan as HsrPlan} inventory={inventory} canEdit={canEdit} />}
        {canEdit && <div><button className="btn" type="submit">Save inventory</button></div>}
      </form>
    </div>
  );
}
