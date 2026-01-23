# Welcome to Viper

Viper is the PATCH Teams Vulnerability Management Platform (VMP).

- Define healthcare workflows
- Simulate cybersecurity events on those workflows.

## Ticket Tracking

We are using the [Northeastern PATCH Jira](https://northeastern-patch.atlassian.net/jira/software/projects/VW/boards/67) for tracking tickets/progress.

## Getting Started

Check out the documentation under the `docs` folder and also `CLAUDE.md`.

Follow the guide in `.env.example` to create a `.env` file.

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

## Database Seeding

The project includes a seed script to populate the database with sample data for development and testing.

### How to seed:

```bash
npm run db:seed
```

The seed script will:

1. Check if the seed user exists (creates if needed)
2. Seed 20 realistic hospital assets owned by the seed user

If you also want a temporary (24 hour) testing API key, run:

```bash
npm run db:create-test-api-key
``` 

### Optional: Clear database before seeding

```bash
SEED_CLEAR_DB=true npm run db:seed
```

⚠️ **Warning:** This will delete all existing assets and asset settings before seeding!

### Login after seeding

After seeding, you can log in with:

- Email: `user@example.com`
- Password: (read the seed script)

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

## Tests

To run tests with Vitest use `npm run test`.

You will need to manually export your `API_KEY` env variable to test the API.

You can find your API Keys under `/user/settings`.

## Linting

To check for lint errors use `npm run lint`.

To have biome linter make changes use `npm run format`.
