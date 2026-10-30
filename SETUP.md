# Setup: Supabase + Vercel (about 10 minutes)

Everything here is on free tiers. You need a GitHub account and nothing else.

> This repository is **public**. Never commit `.env.local`, the Supabase *secret* key, the database password, or personal emails. The publishable key and project URL in `.env.example` are meant to be public.

## 1. Supabase (database + auth)

> **Already done (Oct 29 2026):** project `gacha-hq` exists (org `gacha-hq`, ref `ixipxzwdwkhgtfurksec`), the migration and seed are applied, and *Confirm email* is OFF. Steps 1–5 are only needed if you ever recreate the project. Step 6 (URL configuration) still needs the Vercel URL once you have it.

1. Go to https://supabase.com/dashboard and sign in with GitHub.
2. **New project** → name `gacha-hq`, pick a strong database password (save it somewhere; the app never needs it), region closest to you, Free plan → **Create new project**. Wait ~1 minute.
3. **SQL Editor** (left sidebar) → **New query** → paste each file in `supabase/migrations/` in order (`0001` … `0007`) → **Run**. Each should say "Success. No rows returned".
4. Same again with `supabase/seed.sql` (games + starter characters), then `supabase/seed_genshin_farm.sql`, `supabase/seed_hsr_farm.sql` and `supabase/seed_zzz_farm.sql` (per-character farming data for the planner).
5. **Authentication → Sign In / Providers → Email**:
   - Keep *Enable Email provider* on.
   - Turn **Confirm email OFF** if you want friends to be able to sign in right after signing up (otherwise they must click a link in an email first — the free tier only sends ~2 auth emails/hour, so OFF is the practical choice for a friends-only site).
6. **Authentication → URL Configuration**:
   - *Site URL*: `http://localhost:3000` for now; change to your Vercel URL after step 2 (e.g. `https://gacha-hq.vercel.app`).
   - *Redirect URLs*: add `http://localhost:3000/auth/callback` and `https://gacha-hq.vercel.app/auth/callback` (and `https://*.vercel.app/auth/callback` if you want preview deploys to work).
7. **Project Settings → API Keys**: copy the **Project URL** and the **publishable** key (`sb_publishable_…`; the legacy `anon` key also works). These are safe to ship to the browser — row-level security is what protects the data.

### Admins (can edit the character master list)

Admins are whoever is in the `public.admin_emails` table (the list lives only in the database because this repo is public). To add one, run in the SQL Editor:

```sql
insert into public.admin_emails (email) values ('someone@example.com');
-- and, if they already signed up:
update public.profiles p set is_admin = true from auth.users u
where u.id = p.id and lower(u.email) = 'someone@example.com';
```

### Google sign-in (optional, ~5 minutes)

1. https://console.cloud.google.com → create a project (any name) → **APIs & Services → OAuth consent screen** → External → fill app name + your email → add yourself (and friends) as test users, or publish the app.
2. **APIs & Services → Credentials → Create credentials → OAuth client ID** → *Web application*.
   - Authorised JavaScript origins: `https://gacha-hq.vercel.app` (and `http://localhost:3000`).
   - Authorised redirect URI: `https://ixipxzwdwkhgtfurksec.supabase.co/auth/v1/callback` (Supabase → Authentication → Sign In / Providers → Google shows this exact URL).
3. Copy the client ID + client secret into Supabase → **Authentication → Sign In / Providers → Google** → enable → Save.
4. Vercel → Settings → Environment Variables → add `NEXT_PUBLIC_GOOGLE_SIGNIN` = `1` → Redeploy. A **Continue with Google** button appears on the login page.

Someone who already has an email/password account and signs in with Google using the *same* email is attached to the existing account (Supabase links identities with a matching verified email), so nothing is lost.

## 2. Local run (optional)

```bash
cp .env.example .env.local   # fill in the two values from step 1.7
npm install
npm run dev                  # http://localhost:3000
```

## 3. Vercel (hosting)

1. Push this repo to GitHub (already done if you are reading this on GitHub).
2. https://vercel.com → sign in with GitHub → **Add New… → Project** → import `jacobyou27/gacha-hq`.
3. Framework preset is detected as Next.js. Before **Deploy**, open **Environment Variables** and add:
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = publishable key
   - `SUPABASE_SECRET_KEY` = the **secret** key from Supabase → Project Settings → API Keys → Secret keys (`sb_secret_…`). Server-only; needed for signature verification / UID takeover. Never put this in the repo.
4. **Deploy**. You get a URL like `https://gacha-hq.vercel.app` — share that with friends.
5. Go back to Supabase → Authentication → URL Configuration and set the Site URL / Redirect URL to that address (step 1.6).

Every later `git push` to `main` redeploys automatically.

## 4. Inviting friends

They open the site → **Create an account** → sign in. Each person only ever sees their own accounts and character rows (enforced in the database by RLS, not just in the UI). The game list and character master list are shared; only admins can edit those.

## Troubleshooting

- *"No games found"* on the dashboard → seed.sql was not run.
- Sign-up says *Email rate limit exceeded* → turn Confirm email off (step 1.5) or set up a custom SMTP provider.
- Redirect goes to localhost after confirming email on the live site → Site URL still points at localhost (step 1.6).
- Characters page shows no "Add character" form → you are not an admin yet (see the SQL above).
