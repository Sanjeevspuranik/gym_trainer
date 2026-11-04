# Gym Trainer

A Next.js workout tracker for planning gym sessions, recording exercises, sets,
reps, and weights, and keeping each account's training history separate.

The interface combines a vibrant block-based palette with a restrained RGB-split
landing-page title. It is responsive, keyboard accessible, and respects reduced
motion preferences. Session histories can be exported as PNG or SVG.

## What it does

- Create an account with a username and passphrase, or sign back in.
- Create workout sessions with dates, notes, exercises, sets, reps, and weights
  in kilograms.
- Mark sessions complete, reopen them, or delete them.
- View a personal summary and session history for the signed-in account.
- Export the complete signed-in account history as a PNG or scalable SVG poster.
- View short text-based form cues for squats, presses, and hip hinges.

No exercise video files are bundled with this repository. Form cues are general
information, not individualized coaching or medical advice.

## Requirements

- Node.js 22.13 or newer
- npm
- A PostgreSQL database; [Neon](https://neon.tech/) is the recommended Vercel
  integration

The application uses Next.js App Router route handlers and PostgreSQL. There is
no Python server, no runtime SQLite dependency, and no database initialization
during requests. Versioned migrations are applied explicitly.

## Local setup

Create a Neon development database, then configure the connection and secrets:

```powershell
Copy-Item .env.example .env.local
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Use the first generated value for `AUTH_RATE_LIMIT_SECRET` and generate a
separate value for `CRON_SECRET`. Put your development database's pooled
PostgreSQL connection string in `DATABASE_URL` and its direct connection string
in `DATABASE_URL_UNPOOLED`. Keep `.env.local` private; it is ignored by Git.

Install dependencies, apply the schema, and start Next.js:

```powershell
npm ci
npm run db:migrate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), create an account, and add
a workout. The app requires a PostgreSQL connection; it no longer creates a
local SQLite database automatically.

## Deploy to Vercel

1. Push this repository to GitHub and import it into Vercel. Use the repository
   root as the project root and allow Vercel to detect Next.js and its default
   `npm run build` command.
2. Create a Neon database through the Vercel Marketplace integration. Use
   separate database branches or projects for Preview and Production; do not
   point Preview deployments at Production data.
3. Add these server-only environment variables in Vercel Project Settings. Set
   separate values for Preview and Production.

   | Variable | Required | Purpose |
   | --- | --- | --- |
   | `DATABASE_URL` | Yes | Pooled PostgreSQL connection URL |
   | `DATABASE_URL_UNPOOLED` | For migrations/imports | Direct PostgreSQL connection URL |
   | `AUTH_RATE_LIMIT_SECRET` | Yes | HMAC key for privacy-preserving rate-limit identifiers; at least 32 characters |
   | `CRON_SECRET` | Yes | Secret used to authorize the scheduled cleanup endpoint; at least 32 characters |

   Do not prefix secrets with `NEXT_PUBLIC_`.
4. Apply migrations to the Preview and Production databases from a trusted
   shell, using the matching direct/unpooled connection string. The application
   uses Neon HTTP with pooled `DATABASE_URL`; migrations use the direct URL for
   advisory locks. Migrations are deliberately not run during the Vercel build.

   ```powershell
   $env:DATABASE_URL_UNPOOLED = "<the matching Neon direct connection string>"
   npm run db:migrate
   Remove-Item Env:DATABASE_URL_UNPOOLED
   ```
5. If you want to carry over the local SQLite accounts and workouts, follow the
   [data migration](#migrate-existing-sqlite-data) instructions before inviting
   users.
6. Deploy a Preview, test registration and a workout round-trip, and check
   `/api/health`. Then deploy Production. The daily cleanup job is declared in
   [`vercel.json`](./vercel.json); make sure `CRON_SECRET` is configured.

The Node.js runtime is set to 22 or newer through [`.nvmrc`](./.nvmrc) and the
`engines` field in `package.json`. The Vercel function filesystem is not used
for application data. Database backups and retention depend on the selected
Postgres provider and plan; configure and verify them there.

## Migrate existing SQLite data

The importer preserves account credentials and workout history while leaving the
SQLite source untouched. It reads the database in read-only mode, requires an
empty, migrated PostgreSQL destination, and imports in one transaction. Login
sessions are not copied because old browser cookies are not valid for the
deployed hostname; migrated users should sign in again.

Back up the source database first. Do not copy only the SQLite main file while
its WAL sidecar may contain recent writes. Run the importer from the project
root with `DATABASE_URL_UNPOOLED` pointing to the **empty** target database:

```powershell
$env:DATABASE_URL_UNPOOLED = "<the target Neon direct connection string>"
npm run db:migrate
npm run db:import:sqlite -- --confirm
Remove-Item Env:DATABASE_URL_UNPOOLED
```

To select a different source:

```powershell
npm run db:import:sqlite -- --source "C:\path\to\gym_trainer.sqlite3" --confirm
```

The importer refuses to write if the target already contains users, workouts,
or exercises. It does not delete or modify the source. It imports the existing
PBKDF2 credential hashes, so users can keep their passphrases.

## Configuration and operations

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | None | PostgreSQL connection URL; required at runtime |
| `DATABASE_URL_UNPOOLED` | None | Direct PostgreSQL URL used by migration/import scripts |
| `AUTH_RATE_LIMIT_SECRET` | None | HMAC secret for rate-limit buckets; required for registration and login |
| `CRON_SECRET` | None | Bearer secret for the scheduled cleanup route |
| `GYM_TRAINER_SQLITE_SOURCE` | `data/gym_trainer.sqlite3` | Default source for the one-time SQLite importer |

Authentication attempts use database-backed limits shared across function
instances: login is limited to 10 attempts per 15 minutes per address and
account, and registration to 8 per hour per address and username. The
identifiers are HMAC-hashed before storage. A daily Vercel Cron route removes
expired login sessions and old rate-limit buckets.

`/api/health` performs a database connectivity check and does not expose
connection details. API failures return a generic message; server logs contain
event names and error codes, not passwords, session tokens, or database URLs.

## Implementation overview

- [`src/app`](./src/app) contains the App Router pages, API routes, and shared
  styles.
- [`src/lib/auth.ts`](./src/lib/auth.ts) hashes passphrases with PBKDF2, issues
  opaque random cookies, and stores only a hash of each cookie token.
- [`src/lib/database.ts`](./src/lib/database.ts) validates `DATABASE_URL` and
  uses Neon's stateless HTTP driver for serverless application queries.
- [`src/lib/session-store.ts`](./src/lib/session-store.ts) uses parameterized
  PostgreSQL queries and enforces owner-scoped reads and writes.
- [`src/lib/rate-limit.ts`](./src/lib/rate-limit.ts) stores HMAC-hashed auth
  rate-limit buckets in PostgreSQL.
- [`db/migrations`](./db/migrations) contains ordered SQL migrations applied by
  `npm run db:migrate`.
- [`scripts/sqlite-importer.ts`](./scripts/sqlite-importer.ts) implements the
  opt-in, read-only-source SQLite import.
- [`src/lib/session-image-export.ts`](./src/lib/session-image-export.ts)
  creates the account's PNG/SVG poster in the browser.
- [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) runs tests,
  type-checking, lint, production dependency audit, and the Next.js build.

## API routes

| Method | Route | Description |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Create an account and sign in |
| `POST` | `/api/auth/login` | Sign in |
| `POST` | `/api/auth/logout` | Revoke the current login session |
| `GET` | `/api/auth/me` | Return the current account |
| `GET` | `/api/sessions` | List only the current account's workouts |
| `POST` | `/api/sessions` | Add a workout and its exercise rows atomically |
| `PATCH` | `/api/sessions/:id` | Mark an owned workout complete or reopen it |
| `DELETE` | `/api/sessions/:id` | Delete an owned workout |
| `GET` | `/api/health` | Check application-to-database connectivity |
| `GET` | `/api/cron/cleanup` | Remove expired auth and rate-limit records; requires the cron bearer secret |

Mutation APIs enforce same-origin requests. Session routes resolve ownership
from the HTTP-only session cookie and never accept a client-supplied owner ID.

## Checks

```powershell
npm test
npm run typecheck
npm run lint
npm run audit:prod
npm run build
```

The tests use PGlite, a PostgreSQL-compatible in-memory test database, to cover
migrations, account isolation, transaction rollback, distributed rate-limit
state, SQLite import, and image exports without a live production database.

## Security and production scope

- Passwords use PBKDF2-HMAC-SHA256 with a random salt. Session cookies are
  HTTP-only, `SameSite=Strict`, secure in production, and time-limited.
- Session tokens are random and only their SHA-256 hashes are stored.
- Database reads and writes use parameterized SQL and authenticated user IDs.
- Login and registration have shared rate limits; the database and application
  health routes do not return secrets.
- The app currently has **username-only accounts and no password-recovery
  flow**. Decide on verified email and a mail provider before opening public
  registration to users who need account recovery.
- Configure database backups, monitoring/alerts, and a tested restore process
  with the chosen Postgres provider before treating user data as production
  critical.
- Exercise cues are general information, not medical or individualized
  training advice.
