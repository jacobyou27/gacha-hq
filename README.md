# Gacha HQ

A small web app that replaces the pile of Google Sheets planners (Genshin Resin Planner, HSR TP Planner, ZZZ Battery Planner, WuWa Waveplate Planner, Gacha Roster) with one site with logins.

**Stack:** Next.js (App Router) + Tailwind · Supabase (Postgres + Auth) · Vercel. All free tiers.

Setup instructions: [SETUP.md](./SETUP.md).

## What is in v1 (the core)

| Thing | Where |
|---|---|
| Sign up / sign in / sign out (email + password, Supabase Auth) | `/login`, `src/app/login/actions.ts` |
| Session refresh + redirect to login on every request | `src/proxy.ts` |
| Profile (display name, admin flag) | `/profile` |
| Games reference table (stamina model, labels per game) | `games` table, seeded |
| Character master list per game (shared; admins edit) | `/characters`, `characters` table |
| Your in-game accounts per game (main, pastel, joint…) | `/accounts`, `game_accounts` table |
| What each account has / wants per character (dupes, level, priority) | `/accounts/[id]`, `account_characters` table |
| Sharing: owner / editor / viewer members, invite by email, transfer ownership | `/accounts/[id]` → Sharing, `account_members` table |
| Public read-only page per account (anyone with the link, no login) | `/p/[id]`, `visibility` column |
| One account record per in-game UID; in-game signature verification via Enka.Network (Genshin/HSR/ZZZ) with ownership takeover | `/claim`, `verification_challenges`, `src/lib/enka.ts` |
| Pull & money plan per account: wishlist cost in copies/pulls/$, version groups, budget per group, yearly spending plan (monthly pass, battle pass, bundles, pull blocks), purchase log | `/accounts/[id]/plan`, `spend_plans`, `purchases`, `src/lib/cost.ts` |
| Overview across all accounts (per game and total): copies wanted, pulls, wishlist $, planned $, actual $ | `/overview` |
| Stamina planner (Genshin Resin + HSR Trailblaze Power; ZZZ next): per-build materials → inventory → runs → day-by-day schedule with weekly bosses / Echo of War, domain weekdays, days off, Stygian week, overflow weeks, light cones, bonus traces, Done / Skip daily log, real drops | `/accounts/[id]/farm`, `farm_builds`, `farm_inventory`, `farm_days`, `farm_events`, `src/lib/farm/`, `src/data/farm/` |
| Full character lists incl. leaks (unreleased rows, source, region), per-user “game want” | `/characters`, `character_wants` |
| Friends: request by email, see friends' public/shared accounts | `/friends`, `friendships` |

Everything a user creates is protected with Postgres row-level security keyed on `auth.uid()` and the `account_members` table, so pages can query Supabase directly without a custom API layer. The only place the app uses the service-role key is `checkVerification` (after it has itself confirmed the Enka signature), because a takeover writes rows the prover cannot yet access.

### Access model

- **owner** — everything: account fields, characters, members, visibility, verification, delete. Exactly one per account (`game_accounts.user_id`).
- **editor** — edit character rows only.
- **viewer** — read-only.
- **public** — if the owner sets visibility to public, anyone with `/p/<id>` can read it (no login).
- **UID claims** — `(game, uid)` is unique. If someone else already added your UID, go to **Claim UID**, put the code in your in-game signature, and verification transfers ownership to you; the previous owner is demoted to viewer and gets a notice. WuWa has no public API, so it is claim-only.

## Layout

```
supabase/
  migrations/0001_init.sql   schema + RLS
  migrations/0002_…          admin allow-list (DB-only)
  migrations/0003_…          members, visibility, UID uniqueness, verification, notices
  migrations/0004_…          RLS fix (insert visibility) + code generator fix
  migrations/0005_…          planner schema: wants, spend plans, purchases, versions/banners, friends, farm goals/log
  migrations/0006_…          OAuth sign-ups: display name from Google profile
  migrations/0007_…          stamina planner: builds, inventory, daily log, overflow events, characters.farm
  seed.sql                   games + starter characters
  seed_genshin_farm.sql      Genshin farming attributes per character (books / boss / weekly) for the planner
  seed_hsr_farm.sql          HSR farming attributes per character (trace family / boss / weekly / cost profile) + per-path Trailblazers
src/
  proxy.ts                   runs on every request (session refresh, auth redirect)
  lib/supabase/              browser / server clients
  lib/types.ts               row types
  app/
    login/                   sign in / sign up (server actions)
    auth/callback/           email-link / OAuth code exchange
    (app)/                   signed-in pages: dashboard, accounts, characters, claim, profile
    p/[id]/                  public read-only account page
  lib/enka.ts                Enka.Network signature lookup
  lib/supabase/admin.ts      service-role client (server only; needs SUPABASE_SECRET_KEY)
```

## Cost model (from the Gacha Roster sheet)

A limited 5★ costs **copies**: `(goal dupes + 1) + goal signature − copies you have − free copies` (Genshin C#R#, HSR E#S#, ZZZ M#W#, WuWa S#R#). Characters before `games.old_before_version` form one “Old” cost group; later versions group by major version. 1 copy ≈ `games.avg_pulls_per_copy` pulls (default 94) ≈ `usd_per_pull` dollars (default $1.98). Admins can tune these per game; income assumptions (monthly pass, battle pass, $100 bundles, f2p pulls per version) live on `games` too.

## Not yet (next steps, in rough order)

1. ZZZ (and WuWa) in the stamina planner (the engine is generic — see `src/lib/farm/game.ts`; their data lives in the sheet planners' `Code.gs`).
2. Banner calendar UI (`game_versions` / `banners` tables exist, no page yet).
3. Generated Supabase types (`supabase gen types`) instead of `src/lib/types.ts`.

## Scripts

```bash
npm run dev     # local dev server
npm run build   # production build (also typechecks)
npm run lint
```
