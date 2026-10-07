# Welcome to Viper

Viper is the PATCH Teams Vulnerability Management Platform (VMP).

- Define healthcare workflows
- Simulate cybersecurity events on those workflows.

## Ticket Tracking

We are using the [Northeastern PATCH Jira](https://northeastern-patch.atlassian.net/jira/software/projects/VW/boards/67) for tracking tickets/progress.

## Getting Started

Check out the documentation under the `docs` folder and also `CLAUDE.md`.

Follow the guide in `.env.example` to create a `.env` file.

Start Postgres (needed before running migrations/seeding, or `mprocs`):

```
docker compose -f compose.dev.yml up -d postgres
```

Install `mprocs` to run the multiple services:

```
npm install -g mprocs
```

Install dependencies:

```
npm i
```

Run mprocs:

```
mprocs
```

Alternatively, use docker: `docker compose -f compose.dev.yml up`
* Note: I had to increase my Docker Desktop memory limit to get ts to compile

## Database Seeding

One command seeds everything:

```bash
npm run db:seed
```

It loads two kinds of data, in this order:

1. **Production data** (`prisma/seeds/production/`): reference data every deployment needs, such as the curated medical device manufacturers in `src/lib/manufacturer-catalog.ts`. These seeds only add what is missing. They never delete or rename anything, so they are safe to run on every deploy.
2. **Demo data** (`prisma/seeds/dev/`): the seed user and sample assets, vulnerabilities, remediations, workflows and work orders for development and testing. Shared demo data lives in `prisma/seeds/dev/base/`, one file per feature. Test data for a single ticket lives in `prisma/seeds/dev/<TICKET>/` and is picked up automatically. See the "Seeding" section of `CLAUDE.md` for how to add one.

To load the production data only, set `SEED_SCOPE=production`:

```bash
SEED_SCOPE=production npm run db:seed
```

The Docker images run this on every boot, and the Neon migrations workflow runs it when a merge to `main` changes the schema, a migration or the production seed data. `SEED_SCOPE` accepts `all` (the default) or `production`; anything else, including an empty value, stops the seed with an error.

If you also want a temporary (24 hour) testing API key, run:

```bash
npm run db:create-test-api-key
``` 

To load only one ticket's test data on top of the base demo data, set `SEED_TICKET`:

```bash
SEED_TICKET=VW-532 npm run db:seed
```

### Back up and restore manufacturers

```bash
npm run db:export-manufacturers -- backups/manufacturers.json
npm run db:upsert-manufacturers -- backups/manufacturers.json
```

The export writes every manufacturer row to a JSON file. The upsert reads a file in the same format and adds what is missing, with the same add-only rules as the production seed.

### Optional: Clear database before seeding

```bash
SEED_CLEAR_DB=true npm run db:seed
```

⚠️ **Warning:** This will delete all existing assets and asset settings before seeding!

### Login after seeding

After seeding, you can log in with:

- Email: `user@example.com`
- Password: (read the seed script)

- In production, only accounts associated with whitelisted domains are able to authenticate. That whitelist exists in Vercel's env vars. 

## Tech Stack

- React Framework: Next.js
- Routing: Next.js App Router
- Data Fetching/Caching: Tanstack
- Styling: Tailwind
- Queue: inngest
- DB: PSQL
- ORM: prisma
- RPC: tRPC
- API Validation: Zod
- Test Framework: Vitest
- API Testing: Supertest
- Linter: biome

## Database

Run `npx prisma studio` to view the database, usually on `http://localhost:5555`

### Manually Migrating Deployments

1. Run `npx prisma migrate status` -- should indicate that you have a generated migration that has not been applied
2. Change your `DATABASE_URL` `.env` file to be the URL associated with your Vercel preview/production environment
    - You can find this by going to our Vercel viper project page -> Storage -> neon-vmp-db
    - Hit "show secret"
3. Verify that you're using the correct `DATABASE_URL` with `npx prisma studio`. Just makes sure the entries look consistent
4. `npx prisma migrate deploy`
5. Got an error? Made a mistake? You can restore our Neon database in the Neon console (accessible through Vercel -> neon-vmp-db -> Open in Neon)
    - Go to "Backup & Restore", select a time to restore to (can often just pick a few mins ago)
    - Check [Prisma docs for failed migrations](https://www.prisma.io/docs/orm/prisma-migrate/workflows/patching-and-hotfixing#failed-migration)

You can also try this process using your Vercel Preview environment *first*, then try it with the main branch. Sometimes however *main* may have more migrations than your preview environment (e.g, you made a branch, and afterwards someone else made a branch with a migration and merged that into main before you could), so this doesn't always work.

## Tests

To run tests with Vitest use `npm run test`.

You will need to manually export your `API_KEY` env variable to test the API.

You can find your API Keys under `/user/settings`.

## Linting

To check for lint errors use `npm run lint`.

To have biome linter make changes use `npm run format`.
