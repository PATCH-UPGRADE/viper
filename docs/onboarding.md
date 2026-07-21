# Onboarding

## Tech Stack

### Frontend
- [React](https://react.dev/) - UI library
- [Next.js 15](https://nextjs.org/docs) - React framework. App router.
- TypeScript - Type-safe JavaScript

### API & State Management
- [tRPC](https://trpc.io/docs) - End-to-end typesafe APIs
- [Better Auth](https://www.better-auth.com/) - Login / auth framework 
- [TanStack Query](https://tanstack.com/query/latest) (React Query) - Data fetching and caching
- [trpc-to-openapi](https://github.com/mcampa/trpc-to-openapi) - OpenAPI support for tRPC
- [nuqs](https://nuqs.dev/) - Type-safe URL search params
- [Zod](https://zod.dev/) - Typescript-based schema validator
- [Scalar](https://scalar.com/) - OpenAPI visualization

### UI & Styling
- [shadcn/ui](https://ui.shadcn.com/) - Re-usable component library
- [Tailwind CSS](https://tailwindcss.com/docs) - Utility-first CSS framework
- [React Flow](https://reactflow.dev/) - Node-based UI builder
- [Sonner](https://sonner.emilkowal.ski/) - Toast notifications

### Database
- [Prisma](https://www.prisma.io/docs) - ORM and database toolkit
- [Neon](https://neon.tech/docs/introduction) - Serverless Postgres for staging/production, integrated with Vercel

### Linting & Formatting
- [Biome](https://biomejs.dev/) - Fast formatter and linter

### DevOps
- [Vercel](https://vercel.com/docs) - Deployment platform
- [GitHub Actions](https://docs.github.com/en/actions) - CI/CD workflows

### Testing
- [Supertest](https://github.com/ladjs/supertest) - HTTP assertion library
- [Vitest](https://nextjs.org/docs/app/guides/testing/vitest) - JavaScript testing framework
- [Playwright](https://playwright.dev/docs/intro) - End-to-end testing

### Misc 
- [n8n](https://docs.n8n.io/) - Additional backend, AI automation workflows. Accessed with webhooks.
- Code Rabbit - Automatic code reviews. It's free for us, we found it helpful especially initially with a smaller team.
- [Resend](https://resend.com/emails) - Email management

## Tests

There is no QA team, you're responsible for writing your own tests (a process I'll note is currently behind).

See [Next.js Guide to Testing](https://nextjs.org/docs/app/guides/testing).

Ideally, we have:
- component tests focused on regression testings (i.e, does this internal api endpoint still return data in the correct format?)
- comprehensive end to end and unit tests for API endpoints, with a specific focus on our external API endpoints
- (later) Playwright tests for the most common user tasks (i.e, logging in and viewing assets)

Existing Vitest tests are in `__tests__` directories, i.e `src/app/api/v1/__tests__/assets.test.ts`. Component level tests go with their components.

## API Endpoints and Considerations

There are two sets of API endpoints:

### 1. External API Endpoints
These endpoints must be accessible by other TA performers.
- Use `trpc-to-openapi` for these endpoints
- View the OpenAPI visualization at `/api/openapi-ui` (using Scalar)
- Must be well-tested and focused on **TA2, TA3, and TA4 teams**
- Should never reference internal concepts like Issues or Workflows (which are currently internal to VMP/WHS, not necessary for other teams)
- All external APIs are consolidated into a single `openapi.json` file for sharing

### 2. Internal API Endpoints
These endpoints should only be accessed by VIPER.
- **Do not use `trpc-to-openapi`** for internal endpoints (we want to create one `openapi.json` file we can share to other performers)

There's currently some duplication with internal <-> external API endpoint code. My philosophy is that this is ok for now with our rapid prototyping, as we're still seeing what sticks.

Currently API endpoints that need auth (pretty much all of them, except sign up), are protected using better auth + trpc `protectedProcedure` (defined in `src/trpc/init.ts`).

## Contributing / Creating a PR

- Post the Jira ticket key you're working on in the title, ex `[VW-31] added initial onboarding doc`
    - If working on multiple, put the most relevant in the title
    - Please consider putting additional keys in the description
- If there is no Jira ticket, and you really don't think there should be one, use `[VW-0]`, ex `[VW-0] chore: fixed typo`
- PR's must receive a human approval, although anyone can approve. You should request a review from someone relevant
    - We found Code Rabbit's automated PR's a helpful additional resource
    - Post a link to your PR and tag reviewers in #vmp-dev channel. After approval, you must merge in yourself
- Should be able to test PR yourself in Vercel deployment
- Must pass GitHub Actions pipeline (code builds and deploys successfully, is linted/formatted, tests pass, etc)
    - Run these first before you open a PR:
        - `npm run lint` - lint. Can use `npm run format` to format, `npx biome check --write --unsafe` to auto-fix linter errors if you verify it's safe
        - `npx tsc` - compile, type checks
        - `npm run db:create-test-api-key` and `API_KEY=${api_key_from_last_test} npm run tests`- run vitest

What's our staging environment?
- [viper-xi.vercel.app](https://viper-xi.vercel.app/)

How do I log in?
- Can either use email/password, or use "Continue with GitHub" if the email associated with your gh is linked to a whitelisted domain (e.g, @bugcrowd.com)

What's our production environment?
- See, "What's our staging environment?". This is a research project.

## Email Pipeline (Resend) Setup

VIPER turns inbound security emails into Notifications and Work Order tickets. Resend receives the mail, parses it, and calls a webhook on your machine; `processInboxEmail` (Inngest) does the rest.

This walks you from nothing to a real email being processed locally. You only need it if you're working on the inbox pipeline. Allow ~20 minutes.

### 1. Sign up with a personal email

**Use a personal email address, not your work one.**

Our Google Workspace blocks outbound mail to `*.resend.app`, which is exactly where you'll be sending test emails. If your Resend account is tied to your work address you'll be stuck immediately. Sign up at [resend.com](https://resend.com) with a personal address, and send your test emails from that account.

The free tier is plenty, and you get your own sandbox — no shared credentials.

### 2. Sending vs receiving, and API key permissions

Two distinctions trip people up, and they're unrelated:

**The product has two halves.** *Sending* is transactional email your app pushes out. *Receiving* (inbound) is Resend accepting mail on your behalf, parsing it, and calling a webhook. The inbox pipeline only uses **receiving**.

**API keys have two permission levels.** New keys default to **Sending access**, which cannot read received email. The pipeline calls `emails.receiving.get()` and `attachments.get()`, so it needs **Full access** or it dies immediately with a 401.

Create the key under **API Keys → Create API Key → Full access**, then add it to `.env`:

```
RESEND_API_KEY=re_xxxxxxxxxxxx
```

Verify before going further — a `restricted_api_key` error means you made a sending-only key:

```bash
curl -s -H "Authorization: Bearer $RESEND_API_KEY" https://api.resend.com/emails/receiving
```

> ⚠️ Secrets go in `.env`, **never `.env.ci`**. Despite `.gitignore` listing `.env*`, `.env.ci` is *tracked* — tracked files ignore that pattern — and it feeds a GitHub Actions workflow. A key committed there is a leaked key.

### 3. Get your receiving address

Resend gives you a working inbound address with **no domain and no DNS setup**:

> **Emails → Receiving** tab → **⋯** → **Receiving address**

You'll get something like `anything@ab12cd34.resend.app`. The part before the `@` is freeform, so `test@`, `advisories@` etc. all land in the same inbox.

> 🚫 If the dashboard pushes you to "Add a domain", back out. Adding a company domain would reroute real company email into Resend. You do not need it.

### 4. Expose your local app to the internet

Resend has to reach your laptop, so you need a tunnel. (Same applies if you're testing with n8n.)

**cloudflared** is easiest — no account needed:

```bash
brew install cloudflared
cloudflared tunnel --url http://localhost:3000
```

It prints a URL like `https://corps-issn-portrait-fighter.trycloudflare.com`. Keep the terminal open; **if the process dies the URL changes** and you'll have to update the webhook.

**ngrok** works too, but needs a free account and `ngrok config add-authtoken <token>` first, then `ngrok http 3000`.

Run VIPER with the tunnel URL so the links it generates are correct:

```bash
NEXT_PUBLIC_APP_URL="https://<YOUR_TUNNEL_URL>" npm run dev:all
```

### 5. Point a webhook at your machine

> **Webhooks → Add Webhook**
> - **Endpoint URL:** `https://<YOUR_TUNNEL_URL>/api/email`
> - **Event:** `email.received` — that one only

Copy the **signing secret** it shows you into `.env`:

```
RESEND_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx
```

`/api/email` returns a 500 until *both* `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET` are set. Restart the dev server after editing `.env` — it's only read at boot.

Sanity check — a **400 is correct** here, it means the route is live and rejecting an unsigned payload. A 500 means a missing env var; a 404 means the tunnel is pointing at the wrong port.

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://<YOUR_TUNNEL_URL>/api/email -H 'content-type: application/json' -d '{}'
```

### 6. Set your Anthropic key

The pipeline makes several Anthropic calls (relevance triage, classification, entity extraction, hospital-impact triage), so `ANTHROPIC_API_KEY` must be set in `.env` or the run fails partway through.

### 7. Send a test email

From your **personal** account, email your `@…resend.app` address. Attach a PDF if you want to exercise attachment handling.

Write it like a genuine security advisory. The first agent in the chain decides whether the email is relevant at all, and drops marketing, newsletters and meeting invites as `not_relevant` before anything else runs — a "test test test" email will be correctly ignored.

### 8. Watch it run

Resend POSTs to `/api/email`, which enqueues an Inngest event.

**Inngest dev UI — <http://localhost:8288>** → *Runs* → newest `process-inbox-email`. Every step and its output is visible, which makes this the best place to debug.

Note the webhook payload is **metadata only** — no body, no attachment bytes. The pipeline calls Resend back for the email content and downloads each attachment separately.

**MinIO console — <http://localhost:9001>** (login `minioadmin` / `minioadmin`) → the `viper` bucket → `inbox/<emailId>/`. Attachments are uploaded here, and it's the quickest way to confirm they made it.

**Database** — a successful run leaves a `notification_source` row joined to a `notification` (with `type`, `priority` and a populated `hospitalImpact`), plus one `notification_attachment` per file.

### Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Run dies at `fetch-email-content` with a 401 | Sending-only API key | Step 2 |
| `/api/email` returns 500 | `RESEND_API_KEY` or `RESEND_WEBHOOK_SECRET` missing from `.env` | Steps 2 & 5 |
| `/api/email` returns 404 | Tunnel pointing at the wrong port | Step 4 |
| Webhook never arrives | Tunnel died, so its URL changed | Restart it, update the webhook URL |
| Gmail bounces with "Message blocked" | Workspace blocks `*.resend.app` | Send from a personal account (step 1) |
| Run returns `{skipped: true, reason: "duplicate"}` | That email was already processed — `externalId` is unique | Send a new email |
| Run returns `{skipped: true}` | Triage judged the email `not_relevant` | Write a realistic advisory (step 7) |


## Additional Resources

- [CLAUDE.md](/CLAUDE.md) - Additional project background, including code patterns
    - A note from a real human: pretty sure parts of this were AI generated but it's still largely helpful
- [Video Tutorial](https://www.youtube.com/watch?v=ED2H_y6dmC8) - a (long) tutorial for a project with a similar tech stack
