import type { AccountCharacter, Character, Game, GameAccount, Purchase, SpendPlan } from "./types";

/**
 * Cost model from the Gacha Roster sheet:
 *   cost (in limited-5★ "copies") = (dupes + 1) + signature − free copies,
 *   counted only for characters that count toward pulls (is_limited).
 * Here we compute what is still MISSING to reach the goal on an account.
 */

export function fmtDupes(game: Pick<Game, "dupe_prefix" | "sig_prefix">, dupes: number, sig: number) {
  return `${game.dupe_prefix}${dupes}${sig > 0 ? `${game.sig_prefix}${sig}` : ""}`;
}

/** "Old" for anything before games.old_before_version, otherwise the major version ("6.x"). */
export function versionGroup(game: Pick<Game, "old_before_version">, version: string | null): string {
  if (!version) return "?";
  const v = parseFloat(version);
  const cutoff = game.old_before_version ? parseFloat(game.old_before_version) : NaN;
  if (!Number.isNaN(cutoff) && !Number.isNaN(v) && v < cutoff) return "Old";
  return Number.isNaN(v) ? version : `${Math.floor(v)}.x`;
}

export type RowCost = {
  copiesHave: number;
  copiesGoal: number;
  copiesMissing: number; // characters
  sigMissing: number; // signature weapons / light cones / w-engines
  total: number; // copiesMissing + sigMissing
};

export function rowCost(row: AccountCharacter, ch: Character): RowCost {
  const copiesHave = (row.owned ? row.dupes + 1 : 0) + row.free_copies;
  const copiesGoal = row.goal_dupes !== null && row.goal_dupes !== undefined ? row.goal_dupes + 1 : row.wanted ? Math.max(1, copiesHave) : 0;
  const copiesMissing = ch.is_limited ? Math.max(0, copiesGoal - copiesHave) : 0;
  const sigGoal = row.goal_signature ?? 0;
  const sigMissing = ch.is_limited ? Math.max(0, sigGoal - row.signature) : 0;
  return { copiesHave, copiesGoal, copiesMissing, sigMissing, total: copiesMissing + sigMissing };
}

export function copiesToPulls(game: Pick<Game, "avg_pulls_per_copy">, copies: number) {
  return copies * Number(game.avg_pulls_per_copy);
}
export function pullsToUsd(game: Pick<Game, "usd_per_pull">, pulls: number) {
  return pulls * Number(game.usd_per_pull);
}

/** Yearly plan → pulls and dollars from each income source. */
export function planIncome(game: Game, plan: SpendPlan | null) {
  const versionsPerYear = 365 / (game.version_length_days ?? 42);
  const free = Number(game.free_pulls_per_version) * versionsPerYear;
  if (!plan) return { free, monthly: { pulls: 0, usd: 0 }, bp: { pulls: 0, usd: 0 }, bundles: { pulls: 0, usd: 0 }, blocks: { pulls: 0, usd: 0 }, pulls: free, usd: 0 };
  const monthly = plan.monthly_pass
    ? { pulls: Number(game.monthly_pass_pulls) * plan.monthly_pass_months, usd: Number(game.monthly_pass_usd) * plan.monthly_pass_months }
    : { pulls: 0, usd: 0 };
  const bp = plan.battle_pass
    ? { pulls: Number(game.battle_pass_pulls) * plan.battle_pass_count, usd: Number(game.battle_pass_usd) * plan.battle_pass_count }
    : { pulls: 0, usd: 0 };
  const bundles = { pulls: Number(game.bundle_100_pulls) * plan.bundles_planned, usd: 99.99 * plan.bundles_planned };
  const blocks = { pulls: plan.pull_block_pulls * plan.pull_blocks_planned, usd: Number(plan.pull_block_usd) * plan.pull_blocks_planned };
  return {
    free,
    monthly,
    bp,
    bundles,
    blocks,
    pulls: free + monthly.pulls + bp.pulls + bundles.pulls + blocks.pulls,
    usd: monthly.usd + bp.usd + bundles.usd + blocks.usd,
  };
}

export function purchasesTotal(purchases: Purchase[], year?: number) {
  const rows = year ? purchases.filter((p) => p.bought_on.startsWith(String(year))) : purchases;
  return rows.reduce((a, p) => ({ usd: a.usd + Number(p.amount_usd), pulls: a.pulls + Number(p.pulls) }), { usd: 0, pulls: 0 });
}

export function budgetCopies(account: GameAccount, groups: number) {
  const per = Number((account.settings as Record<string, unknown>)?.cost_per_group ?? 0);
  return per > 0 ? per * Math.max(groups, 1) : null;
}

export const money = (n: number) => `$${n.toFixed(0)}`;
export const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
