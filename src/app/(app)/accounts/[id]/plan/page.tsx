import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { budgetCopies, copiesToPulls, fmtDupes, money, num, planIncome, pullsToUsd, purchasesTotal, rowCost, versionGroup } from "@/lib/cost";
import type { AccountCharacter, Character, Game, GameAccount, Purchase, SpendPlan } from "@/lib/types";
import { addPurchase, deletePurchase, saveCostPerGroup, saveSpendPlan } from "./actions";

type Row = AccountCharacter & { character: Character };

export default async function PlanPage({ params, searchParams }: PageProps<"/accounts/[id]/plan">) {
  const { id } = await params;
  const sp = await searchParams;
  const now = new Date();
  const year = Number(typeof sp.year === "string" ? sp.year : now.getFullYear());
  const today = now.toISOString().slice(0, 10);
  const error = typeof sp.error === "string" ? sp.error : null;
  const message = typeof sp.message === "string" ? sp.message : null;
  const supabase = await createClient();

  const { data: account } = await supabase.from("game_accounts").select("*").eq("id", id).maybeSingle<GameAccount>();
  if (!account) notFound();

  const [{ data: game }, { data: rows }, { data: plan }, { data: purchases }] = await Promise.all([
    supabase.from("games").select("*").eq("id", account.game_id).single<Game>(),
    supabase.from("account_characters").select("*, character:characters(*)").eq("account_id", id).returns<Row[]>(),
    supabase.from("spend_plans").select("*").eq("account_id", id).eq("year", year).maybeSingle<SpendPlan>(),
    supabase.from("purchases").select("*").eq("account_id", id).order("bought_on", { ascending: false }).returns<Purchase[]>(),
  ]);
  if (!game) notFound();
  const isOwner = account.user_id === (await supabase.auth.getUser()).data.user?.id;

  // ---------------------------------------------------------------- wishlist
  const wish = (rows ?? [])
    .map((r) => ({ r, cost: rowCost(r, r.character), group: versionGroup(game, r.character.version) }))
    .filter((x) => x.cost.total > 0 || x.r.wanted)
    .sort((a, b) => (b.r.character.version ?? "").localeCompare(a.r.character.version ?? "") || a.r.priority - b.r.priority);
  const groups = new Map<string, typeof wish>();
  for (const w of wish) groups.set(w.group, [...(groups.get(w.group) ?? []), w]);
  const totalCopies = wish.reduce((a, w) => a + w.cost.total, 0);
  const totalPulls = copiesToPulls(game, totalCopies);
  const totalUsd = pullsToUsd(game, totalPulls);
  const budget = budgetCopies(account, groups.size);

  // ---------------------------------------------------------------- money
  const income = planIncome(game, plan);
  const spent = purchasesTotal(purchases ?? [], year);
  const pullsToBuy = Math.max(0, totalPulls - income.pulls);
  const usdToBuy = pullsToUsd(game, pullsToBuy);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/accounts/${id}`} className="text-sm underline">← {game.name} · {account.name}</Link>
        <h1 className="text-xl font-semibold">Pull & money plan · {account.name}</h1>
        <p className="text-sm text-neutral-600">
          Costs are in limited-5★ copies: (goal {game.dupe_prefix} + 1) + goal {game.sig_prefix} − what you have − free copies.
          1 copy ≈ {num(Number(game.avg_pulls_per_copy))} pulls ≈ {money(pullsToUsd(game, Number(game.avg_pulls_per_copy)))} at {money(Number(game.usd_per_pull))}/pull (admins can change these on the game).
          See all accounts on the <Link href="/overview" className="underline">Overview</Link>.
        </p>
      </div>

      {error && <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">{error}</p>}
      {message && <p className="rounded border border-green-300 bg-green-50 p-2 text-sm text-green-800">{message}</p>}

      {/* summary */}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="card"><div className="text-xs text-neutral-500">Copies still wanted</div><div className="text-lg">{totalCopies}{budget !== null && <span className="text-sm text-neutral-500"> / budget {budget}</span>}</div></div>
        <div className="card"><div className="text-xs text-neutral-500">≈ pulls</div><div className="text-lg">{num(totalPulls)}</div></div>
        <div className="card"><div className="text-xs text-neutral-500">Income {year} (plan + f2p)</div><div className="text-lg">{num(income.pulls)} pulls · {money(income.usd)}</div></div>
        <div className="card"><div className="text-xs text-neutral-500">Still to buy for the wishlist</div><div className="text-lg">{num(pullsToBuy)} pulls ≈ {money(usdToBuy)}</div><div className="text-xs text-neutral-500">(wishlist alone ≈ {money(totalUsd)} at retail)</div></div>
      </div>

      {/* wishlist by version group */}
      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Wishlist by version group</h2>
        {wish.length === 0 && <p className="text-sm text-neutral-500">Nothing wanted yet — set a goal ({game.dupe_prefix}/{game.sig_prefix}) or tick “want” on the account page.</p>}
        {[...groups.entries()].map(([g, items]) => {
          const copies = items.reduce((a, w) => a + w.cost.total, 0);
          return (
            <div key={g} className="card">
              <div className="mb-1 flex justify-between text-sm">
                <b>{g}</b>
                <span>{copies} copies · {num(copiesToPulls(game, copies))} pulls · {money(pullsToUsd(game, copiesToPulls(game, copies)))}</span>
              </div>
              <table className="table">
                <thead><tr><th>Character</th><th>Ver</th><th>Have</th><th>Goal</th><th>Free</th><th>Want</th><th>Copies</th><th>≈ pulls</th><th>≈ $</th></tr></thead>
                <tbody>
                  {items.map(({ r, cost }) => (
                    <tr key={r.id}>
                      <td>{r.character.name}{!r.character.is_released && <span className="text-neutral-500"> (leak)</span>}</td>
                      <td>{r.character.version ?? ""}</td>
                      <td>{r.owned ? fmtDupes(game, r.dupes, r.signature) : "—"}</td>
                      <td>{r.goal_dupes !== null ? fmtDupes(game, r.goal_dupes, r.goal_signature ?? 0) : r.wanted ? fmtDupes(game, 0, 0) : "—"}</td>
                      <td>{r.free_copies || ""}</td>
                      <td>{r.want_level ?? (r.wanted ? "✓" : "")}</td>
                      <td>{cost.total}{cost.sigMissing ? <span className="text-neutral-500"> ({cost.copiesMissing}+{cost.sigMissing}{game.sig_prefix})</span> : null}</td>
                      <td>{num(copiesToPulls(game, cost.total))}</td>
                      <td>{money(pullsToUsd(game, copiesToPulls(game, cost.total)))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </section>

      {/* budget in copies */}
      {isOwner && (
        <form action={saveCostPerGroup} className="card flex flex-wrap items-end gap-2 text-sm">
          <input type="hidden" name="account_id" value={id} />
          <input type="hidden" name="year" value={year} />
          <label className="label">Budget: copies per version group (from the sheet&apos;s “Cost per group”)
            <input className="input w-28" type="number" step="0.5" name="cost_per_group" defaultValue={String((account.settings as Record<string, unknown>)?.cost_per_group ?? "")} />
          </label>
          <button className="btn" type="submit">Save</button>
          <span className="text-neutral-500">Groups on the wishlist now: {groups.size || 0}.</span>
        </form>
      )}

      {/* spend plan */}
      <section className="card flex flex-col gap-3 text-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Spending plan {year}</h2>
          <span className="flex gap-2">
            <Link className="btn-secondary" href={`/accounts/${id}/plan?year=${year - 1}`}>← {year - 1}</Link>
            <Link className="btn-secondary" href={`/accounts/${id}/plan?year=${year + 1}`}>{year + 1} →</Link>
          </span>
        </div>
        <form action={saveSpendPlan} className="grid gap-3 sm:grid-cols-4">
          <input type="hidden" name="account_id" value={id} />
          <input type="hidden" name="year" value={year} />
          <label className="flex items-center gap-2"><input type="checkbox" name="monthly_pass" defaultChecked={plan?.monthly_pass ?? false} disabled={!isOwner} /> monthly pass (Welkin etc.)</label>
          <label className="label">months / year<input className="input" type="number" name="monthly_pass_months" min={0} max={12} defaultValue={plan?.monthly_pass_months ?? 12} disabled={!isOwner} /></label>
          <label className="flex items-center gap-2"><input type="checkbox" name="battle_pass" defaultChecked={plan?.battle_pass ?? false} disabled={!isOwner} /> battle pass</label>
          <label className="label">passes / year<input className="input" type="number" name="battle_pass_count" min={0} max={12} defaultValue={plan?.battle_pass_count ?? 6} disabled={!isOwner} /></label>
          <label className="label">extra $100 bundles planned<input className="input" type="number" name="bundles_planned" min={0} defaultValue={plan?.bundles_planned ?? 0} disabled={!isOwner} /></label>
          <label className="label">pull blocks planned<input className="input" type="number" name="pull_blocks_planned" min={0} defaultValue={plan?.pull_blocks_planned ?? 0} disabled={!isOwner} /></label>
          <label className="label">$ per pull block<input className="input" type="number" name="pull_block_usd" step="1" defaultValue={plan?.pull_block_usd ?? 300} disabled={!isOwner} /></label>
          <label className="label">pulls per block<input className="input" type="number" name="pull_block_pulls" defaultValue={plan?.pull_block_pulls ?? 150} disabled={!isOwner} /></label>
          <label className="label">hard budget $ (optional)<input className="input" type="number" name="budget_usd" step="1" defaultValue={plan?.budget_usd ?? ""} disabled={!isOwner} /></label>
          <label className="label sm:col-span-2">notes<input className="input" name="notes" defaultValue={plan?.notes ?? ""} disabled={!isOwner} /></label>
          {isOwner && <div className="self-end"><button className="btn" type="submit">Save plan</button></div>}
        </form>
        <table className="table max-w-xl">
          <thead><tr><th>Source</th><th>pulls / yr</th><th>$ / yr</th></tr></thead>
          <tbody>
            <tr><td>f2p income (≈{num(Number(game.free_pulls_per_version))}/version)</td><td>{num(income.free)}</td><td>$0</td></tr>
            <tr><td>monthly pass</td><td>{num(income.monthly.pulls)}</td><td>{money(income.monthly.usd)}</td></tr>
            <tr><td>battle pass</td><td>{num(income.bp.pulls)}</td><td>{money(income.bp.usd)}</td></tr>
            <tr><td>$100 bundles</td><td>{num(income.bundles.pulls)}</td><td>{money(income.bundles.usd)}</td></tr>
            <tr><td>pull blocks (win or lose)</td><td>{num(income.blocks.pulls)}</td><td>{money(income.blocks.usd)}</td></tr>
            <tr className="font-medium"><td>planned total</td><td>{num(income.pulls)}</td><td>{money(income.usd)}{plan?.budget_usd ? ` / cap ${money(Number(plan.budget_usd))}` : ""}</td></tr>
            <tr><td>actually spent in {year}</td><td>{num(spent.pulls)}</td><td>{money(spent.usd)}</td></tr>
          </tbody>
        </table>
      </section>

      {/* purchases */}
      <section className="card flex flex-col gap-3 text-sm">
        <h2 className="font-medium">Purchases (what was actually bought)</h2>
        <table className="table">
          <thead><tr><th>Date</th><th>Kind</th><th>$</th><th>Pulls</th><th>Note</th><th></th></tr></thead>
          <tbody>
            {(purchases ?? []).map((p) => (
              <tr key={p.id}>
                <td>{p.bought_on}</td><td>{p.kind.replace("_", " ")}</td><td>{money(Number(p.amount_usd))}</td><td>{num(Number(p.pulls))}</td><td>{p.note ?? ""}</td>
                <td>
                  <form action={deletePurchase}><input type="hidden" name="account_id" value={id} /><input type="hidden" name="purchase_id" value={p.id} /><input type="hidden" name="year" value={year} /><button className="btn-secondary" type="submit">✕</button></form>
                </td>
              </tr>
            ))}
            {(purchases ?? []).length === 0 && <tr><td colSpan={6} className="text-neutral-500">Nothing logged yet.</td></tr>}
          </tbody>
        </table>
        <form action={addPurchase} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="account_id" value={id} />
          <input type="hidden" name="year" value={year} />
          <label className="label">Date<input className="input" type="date" name="bought_on" defaultValue={today} /></label>
          <label className="label">Kind
            <select className="input" name="kind" defaultValue="monthly_pass">
              <option value="monthly_pass">monthly pass</option>
              <option value="battle_pass">battle pass</option>
              <option value="bundle">$100 bundle</option>
              <option value="pull_block">pull block</option>
              <option value="other">other</option>
            </select>
          </label>
          <label className="label">$<input className="input w-24" type="number" step="0.01" name="amount_usd" /></label>
          <label className="label">pulls<input className="input w-24" type="number" step="0.5" name="pulls" /></label>
          <label className="label">note<input className="input" name="note" /></label>
          <button className="btn" type="submit">Log</button>
        </form>
      </section>
    </div>
  );
}
