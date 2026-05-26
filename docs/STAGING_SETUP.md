# Staging environment setup

A second Supabase project + Vercel's per-environment env vars gives you a
staging environment that mirrors prod. No second Vercel project needed.

## 1. Create a second Supabase project

1. Go to https://supabase.com/dashboard → **New project**.
2. Name it `punchlister-staging`. Pick a strong DB password and the same
   region as prod.
3. Wait for the project to provision (~2 minutes).
4. From **Project Settings → API**, copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public key** → `VITE_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY`

## 2. Apply all migrations in one go

Migrations live as loose SQL files in [`supabase/`](../supabase/). A build
script concatenates them into a single file in the right order:

```bash
./scripts/build-migrations.sh
```

This writes `supabase/_all_migrations.sql`. Open it, copy the contents, paste
into the new staging project's **SQL Editor → New query**, hit **Run**.

After any new migration file is added, re-run the script and re-apply the
new file on staging (don't re-paste the whole consolidated file — that would
fail on already-existing tables).

## 3. Wire up Vercel environments

1. In Vercel → your project → **Settings → Environment Variables**.
2. For every variable in `.env.example`, set two values:
   - **Production** scope → the prod Supabase credentials
   - **Preview** scope → the staging Supabase credentials
3. Non-Supabase keys (`ANTHROPIC_API_KEY`, `MAILGUN_*`, etc.) can use the
   same value across both scopes unless you want full isolation.

## 4. Create a `staging` branch

```bash
git checkout -b staging
git push -u origin staging
```

Vercel automatically deploys every branch push as a **Preview** with the
Preview-scoped env vars. Your staging URL will look like
`punchlister-git-staging-<team>.vercel.app`.

## 5. Workflow

- Feature work → branch off `staging` → PR into `staging` → test on the
  Preview URL.
- Ship to prod → PR `staging` → `main`. `main` redeploys with Production
  env vars.

## Adding a new migration

1. Create `supabase/add_<name>.sql`.
2. Apply it to **prod** via the Supabase SQL editor (so prod stays current
   with what's running in `main`).
3. Apply the same file to **staging** so they don't drift.
4. Re-run `./scripts/build-migrations.sh` and commit the regenerated
   `_all_migrations.sql` — it's a convenience snapshot for future fresh
   environments.
