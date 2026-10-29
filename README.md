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

Everything a user creates is protected with Postgres row-level security keyed on `auth.uid()`, so pages can query Supabase directly without a custom API layer.

## Layout

```
supabase/
  migrations/0001_init.sql   schema + RLS
  seed.sql                   games + starter characters
src/
  proxy.ts                   runs on every request (session refresh, auth redirect)
  lib/supabase/              browser / server clients
  lib/types.ts               row types
  app/
    login/                   sign in / sign up (server actions)
    auth/callback/           email-link / OAuth code exchange
    (app)/                   signed-in pages: dashboard, accounts, characters, profile
```

## Not yet (next steps, in rough order)

1. Bulk import of the full character lists from the Gacha Roster sheet (CSV paste on the Characters page).
2. Shared accounts (`account_members`) so a "joint" account can be edited by two people.
3. Stamina planners: per-account settings (bank cap, days off, weekly-boss day), material inventory, daily log with "Done" ticks — ported from the sheets one game at a time.
4. Pull planner: version calendar + banners, pull budget per account.
5. Google sign-in (one toggle in Supabase + a button on `/login`).
6. Generated Supabase types (`supabase gen types`) instead of `src/lib/types.ts`.

## Scripts

```bash
npm run dev     # local dev server
npm run build   # production build (also typechecks)
npm run lint
```
