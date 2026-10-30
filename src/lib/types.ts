// Hand-written row types matching supabase/migrations/0001_init.sql.
// (Swap for `supabase gen types` output later if you want full typing.)

export type GameId = "genshin" | "hsr" | "zzz" | "wuwa";

export type Game = {
  id: GameId;
  name: string;
  sort_order: number;
  stamina_name: string;
  stamina_per_day: number;
  stamina_cap: number;
  dupe_label: string;
  weapon_label: string;
  class_label: string;
  element_label: string;
  max_dupes: number;
  max_level: number;
  version_anchor: string | null;
  version_anchor_date: string | null;
  version_length_days: number | null;
  dupe_prefix: string;
  sig_prefix: string;
  old_before_version: string | null;
  avg_pulls_per_copy: number;
  usd_per_pull: number;
  monthly_pass_usd: number;
  monthly_pass_pulls: number;
  battle_pass_usd: number;
  battle_pass_pulls: number;
  bundle_100_pulls: number;
  bundle_100_first_pulls: number;
  free_pulls_per_version: number;
};

export type Profile = {
  id: string;
  display_name: string;
  is_admin: boolean;
};

export type Character = {
  id: string;
  game_id: GameId;
  name: string;
  rarity: number;
  element: string | null;
  weapon_type: string | null;
  version: string | null;
  is_limited: boolean;
  is_free: boolean;
  is_released: boolean;
  image_url: string | null;
  notes: string | null;
  region: string | null;
  release_date: string | null;
  source: string | null;
  farm: Record<string, unknown>; // per-game farming attributes (books / boss / weekly …), see src/lib/farm
};

export type AccountStatus = "active" | "paused" | "dropped";
export type AccountVisibility = "private" | "public";
export type AccountRole = "owner" | "editor" | "viewer";

export type GameAccount = {
  id: string;
  user_id: string; // current owner
  game_id: GameId;
  name: string;
  server: string | null;
  uid: string | null;
  status: AccountStatus;
  world_level: number | null;
  color: string | null;
  sort_order: number;
  notes: string | null;
  settings: Record<string, unknown>;
  visibility: AccountVisibility;
  verified_at: string | null;
  verified_by: string | null;
};

export type AccountMember = {
  user_id: string;
  display_name: string;
  role: AccountRole;
};

export type VerificationChallenge = {
  id: string;
  account_id: string;
  user_id: string;
  code: string;
  expires_at: string;
};

export type Notice = {
  id: string;
  message: string;
  created_at: string;
  read_at: string | null;
};

export type AccountCharacter = {
  id: string;
  account_id: string;
  character_id: string;
  owned: boolean;
  dupes: number;
  goal_dupes: number | null;
  wanted: boolean;
  free_copies: number;
  level: number | null;
  goal_level: number | null;
  priority: number;
  notes: string | null;
  signature: number;
  goal_signature: number | null;
  want_level: string | null;
};

export type WantLevel = "Want" | "Kinda Want" | "Okay With" | "Never";
export type CharacterWant = { user_id: string; character_id: string; want: WantLevel; note: string | null };

export type SpendPlan = {
  account_id: string;
  year: number;
  monthly_pass: boolean;
  monthly_pass_months: number;
  battle_pass: boolean;
  battle_pass_count: number;
  bundles_planned: number;
  pull_blocks_planned: number;
  pull_block_usd: number;
  pull_block_pulls: number;
  budget_usd: number | null;
  notes: string | null;
};

export type PurchaseKind = "monthly_pass" | "battle_pass" | "bundle" | "pull_block" | "other";
export type Purchase = {
  id: string;
  account_id: string;
  bought_on: string;
  kind: PurchaseKind;
  amount_usd: number;
  pulls: number;
  note: string | null;
};

export type FarmBuild = {
  id: string;
  account_id: string;
  character_id: string;
  priority: number;
  inputs: Record<string, unknown>;
  deadline: string | null;
  banner: string | null;
  done: boolean;
  notes: string | null;
  counted_at: string;
  created_at: string;
};

export type FarmInventoryRow = { account_id: string; kind: string; key: string; qty: number };

export type FarmDay = {
  id: string;
  account_id: string;
  day: string;
  build_id: string | null;
  character: string;
  status: "done" | "skipped";
  runs: Record<string, number | string>;
  drops: Record<string, number>;
  stamina_left: number;
  text: string;
  logged_at: string;
};

export type FarmEvent = { id: string; game_id: GameId; kind: "overflow_artifacts" | "overflow_ley" | "overflow_domain"; starts_on: string; ends_on: string; note: string | null };

export type GameVersion = { game_id: GameId; version: string; starts_on: string | null; ends_on: string | null; is_estimate: boolean };

export type Friend = { user_id: string; display_name: string; status: "pending" | "accepted"; direction: "sent" | "received" };
