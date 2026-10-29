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
  seed.sql                   games + starter characters
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

## Not yet (next steps, in rough order)

1. Bulk import of the full character lists from the Gacha Roster sheet (CSV paste on the Characters page).
2. Stamina planners: per-account settings (bank cap, days off, weekly-boss day), material inventory, daily log with "Done" ticks — ported from the sheets one game at a time.
3. Pull planner: version calendar + banners, pull budget per account.
4. Google sign-in (one toggle in Supabase + a button on `/login`).
5. Generated Supabase types (`supabase gen types`) instead of `src/lib/types.ts`.

## Scripts

```bash
npm run dev     # local dev server
npm run build   # production build (also typechecks)
npm run lint
```
