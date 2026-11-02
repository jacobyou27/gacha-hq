-- 0010: primogem forecast becomes "catalog + plan".
-- income_items is the shared database of every primogem source (admins keep the numbers right).
-- account_income_items is now each account's plan: an item counts only once the account adds it.
--   status 'todo' = in the plan, 'done' = already finished (kept for the record, not counted again), 'skip' = old marks (ignored).
--   amount          = how much of it you'll do, in % (null = all of it)
--   counts          = for chest pools: chests you'll open per rarity, e.g. {"common": 40, "exquisite": 91}
--   primos_override = this account's own primogem value for the whole item (null = the catalog value)

alter table public.income_items
  add column if not exists region text,   -- Nod-Krai, Snezhnaya, … (filtering)
  add column if not exists pools  jsonb;  -- chest pools: [{"key":"common","label":"Common","count":79,"each":2}, …]; the rest of primos = puzzles / seelies / etc.

alter table public.account_income_items
  add column if not exists amount          numeric check (amount is null or (amount >= 0 and amount <= 100)),
  add column if not exists counts          jsonb,
  add column if not exists primos_override numeric check (primos_override is null or primos_override >= 0);

create index if not exists income_items_region_idx on public.income_items (game_id, region);
