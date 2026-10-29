import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { budgetCopies, copiesToPulls, money, num, planIncome, pullsToUsd, purchasesTotal, rowCost, versionGroup } from "@/lib/cost";
import type { AccountCharacter, AccountRole, Character, Game, GameAccount, Purchase, SpendPlan } from "@/lib/types";

type Row = AccountCharacter & { character: Character };

/** Everything across every account you can see (yours + shared with you), per game and in total. */
export default async function OverviewPage({ searchParams }: PageProps<"/overview">) {
  const sp = await searchParams;
  const year = Number(typeof sp.year === "string" ? sp.year : new Date().getFullYear());
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: games }, { data: accounts }, { data: memberships }, { data: rows }, { data: plans }, { data: purchases }] = await Promise.all([
    supabase.from("games").select("*").order("sort_order").returns<Game[]>(),
    supabase.from("game_accounts").select("*").order("game_id").order("sort_order").returns<GameAccount[]>(),
    supabase.from("account_members").select("account_id, role").eq("user_id", user!.id).returns<{ account_id: string; role: AccountRole }[]>(),
    supabase.from("account_characters").select("*, character:characters(*)").returns<Row[]>(),
    supabase.from("spend_plans").select("*").eq("year", year).returns<SpendPlan[]>(),
    supabase.from("purchases").select("*").returns<Purchase[]>(),
  ]);

  const roleOf = new Map((memberships ?? []).map((m) => [m.account_id, m.role]));
  const mine = (accounts ?? []).filter((a) => roleOf.has(a.id));
  const gameById = new Map((games ?? []).map((g) => [g.id, g]));
  const planOf = new Map((plans ?? []).map((p) => [p.account_id, p]));

  const perAccount = mine.map((a) => {
    const game = gameById.get(a.game_id)!;
    const myRows = (rows ?? []).filter((r) => r.account_id === a.id);
    const costed = myRows.map((r) => ({ r, cost: rowCost(r, r.character), group: versionGroup(game, r.character.version) })).filter((x) => x.cost.total > 0);
    const copies = costed.reduce((s, x) => s + x.cost.total, 0);
    const groups = new Set(costed.map((x) => x.group)).size;
    const pulls = copiesToPulls(game, copies);
    const income = planIncome(game, planOf.get(a.id) ?? null);
    const spent = purchasesTotal((purchases ?? []).filter((p) => p.account_id === a.id), year);
    const toBuy = Math.max(0, pulls - income.pulls);
    return {
      a, game, role: roleOf.get(a.id)!, copies, groups, budget: budgetCopies(a, groups), pulls,
      wishUsd: pullsToUsd(game, pulls), incomePulls: income.pulls, plannedUsd: income.usd,
      toBuyPulls: toBuy, toBuyUsd: pullsToUsd(game, toBuy), spentUsd: spent.usd, spentPulls: spent.pulls,
      owned: myRows.filter((r) => r.owned).length,
    };
  });

  const sum = (xs: typeof perAccount) =>
    xs.reduce(
      (s, x) => ({
        copies: s.copies + x.copies, pulls: s.pulls + x.pulls, wishUsd: s.wishUsd + x.wishUsd, plannedUsd: s.plannedUsd + x.plannedUsd,
        toBuyUsd: s.toBuyUsd + x.toBuyUsd, spentUsd: s.spentUsd + x.spentUsd, owned: s.owned + x.owned, accounts: s.accounts + 1,
      }),
      { copies: 0, pulls: 0, wishUsd: 0, plannedUsd: 0, toBuyUsd: 0, spentUsd: 0, owned: 0, accounts: 0 },
    );
  const total = sum(perAccount);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Overview · all accounts</h1>
          <p className="text-sm text-neutral-600">Wishlist cost, planned spending and actual purchases for {year}, per account, per game and in total.</p>
        </div>
        <span className="flex gap-2 text-sm">
          <Link className="btn-secondary" href={`/overview?year=${year - 1}`}>← {year - 1}</Link>
          <Link className="btn-secondary" href={`/overview?year=${year + 1}`}>{year + 1} →</Link>
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-5 text-sm">
        <div className="card"><div className="text-xs text-neutral-500">Accounts</div><div className="text-lg">{total.accounts}</div></div>
        <div className="card"><div className="text-xs text-neutral-500">Copies wanted</div><div className="text-lg">{total.copies} <span className="text-sm text-neutral-500">≈ {num(total.pulls)} pulls</span></div></div>
        <div className="card"><div className="text-xs text-neutral-500">Wishlist at retail</div><div className="text-lg">{money(total.wishUsd)}</div></div>
        <div className="card"><div className="text-xs text-neutral-500">Planned spend {year}</div><div className="text-lg">{money(total.plannedUsd)}</div><div className="text-xs text-neutral-500">still to buy after plan: {money(total.toBuyUsd)}</div></div>
        <div className="card"><div className="text-xs text-neutral-500">Actually spent {year}</div><div className="text-lg">{money(total.spentUsd)}</div></div>
      </div>

      {(games ?? []).map((g) => {
        const xs = perAccount.filter((x) => x.a.game_id === g.id);
        if (xs.length === 0) return null;
        const t = sum(xs);
        return (
          <section key={g.id} className="card">
            <h2 className="mb-2 font-medium">
              {g.name} <span className="text-sm font-normal text-neutral-500">— {t.accounts} accounts · {t.copies} copies · {money(t.wishUsd)} wishlist · {money(t.plannedUsd)} planned · {money(t.spentUsd)} spent</span>
            </h2>
            <table className="table">
              <thead>
                <tr><th>Account</th><th>Role</th><th>Status</th><th>Owned</th><th>Copies wanted</th><th>Budget</th><th>≈ pulls</th><th>Wishlist $</th><th>Income {year}</th><th>Planned $</th><th>Still to buy</th><th>Spent $</th></tr>
              </thead>
              <tbody>
                {xs.map((x) => (
                  <tr key={x.a.id}>
                    <td><Link href={`/accounts/${x.a.id}/plan`} className="underline">{x.a.name}</Link>{x.a.verified_at ? " ✓" : ""}</td>
                    <td>{x.role}</td>
                    <td>{x.a.status}</td>
                    <td>{x.owned}</td>
                    <td>{x.copies}</td>
                    <td>{x.budget ?? ""}</td>
                    <td>{num(x.pulls)}</td>
                    <td>{money(x.wishUsd)}</td>
                    <td>{num(x.incomePulls)} pulls</td>
                    <td>{money(x.plannedUsd)}</td>
                    <td>{num(x.toBuyPulls)} pulls ≈ {money(x.toBuyUsd)}</td>
                    <td>{money(x.spentUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
      {perAccount.length === 0 && <p className="text-sm text-neutral-500">No accounts yet.</p>}
    </div>
  );
}
