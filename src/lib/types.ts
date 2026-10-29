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
};
