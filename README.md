# Welcome to Pulse

Pulse is the PATCH Teams Vulnerability Management Platform (VMP).

- Define healthcare workflows
- Simulate cybersecurity events on those workflows.

## Getting Started

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

### What gets seeded:

- **1 test user** with credentials:
  - Email: `user@example.com`
  - Password: `abcd1234`
- **20 hospital assets** including ICU devices, lab equipment, imaging systems, IT infrastructure, surgical equipment, workstations, and network devices

### How to seed:

```bash
npm run db:seed
```

The seed script will:
1. Check if the seed user exists (creates if needed)
2. Seed 20 realistic hospital assets owned by the seed user

### Optional: Clear database before seeding

```bash
SEED_CLEAR_DB=true npm run db:seed
```

⚠️ **Warning:** This will delete all existing assets and asset settings before seeding!

### Login after seeding

After seeding, you can log in with:
- Email: `user@example.com`
- Password: `abcd1234`

## Tech Stack

- Queue: inngest
- ORM: prisma. Run `npx prisma studio` to view the database, usually on http://localhost:5555

You can view the DB with prisma studio, usually running on port 5555.
