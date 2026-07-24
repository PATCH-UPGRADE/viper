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

## Email Pipeline (Resend)
The email pipeline is essential for testing anything in the inbox flow (e.g. Notifications, Work Orders). 

What do I need?
- You need access to Resend. This is separate from the core-project access IT sets you up with on your first day, so you'll need your own Resend account. Reach out to the team for a project-dedicated email, or use your personal email if you don't have one.

Where do I get Resend API keys and Secrets?
- You need two values in your `.env`: `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET`. The `/api/email` route checks for both on every request and returns a 500 if either is missing, so the pipeline does nothing until you have both.
- The API key: once you're in the Resend dashboard, three sections in the side nav matter — Emails, API keys, and Webhooks. Signing up automatically creates an "Onboarding" API key. Go to API keys, find that key, click the ellipsis (...) at the end of the row, hit Edit, and change its permission to "Full Access". By default it's sending-only, which can't read inbound email, and the pipeline reads inbound email — so a sending-only key fails. Copy the key into `.env` as `RESEND_API_KEY`.
- The webhook secret comes from the webhook step below, not here.

How to set up the webhook?
- First make your local server reachable from the internet with ngrok or cloudflared (more info **[here](./email-pipeline-setup.md)**). That gives you a public URL like `https://something.trycloudflare.com`; your webhook target is that URL plus `/api/email`.
- In Resend's Webhooks section, create a webhook pointing at `https://<your-tunnel>/api/email` and subscribe to the "email.received" event.
- Creating the webhook gives you a signing secret (it looks like `whsec_...`). Copy it into `.env` as `RESEND_WEBHOOK_SECRET`. The route verifies every incoming webhook against this secret, so if it's missing or wrong you'll get a 400 and the email never reaches Inngest — with no obvious error on the Resend side. This is the second of the two values from the section above.

How to trigger an "email.received" event?
- To replicate the event, go to the Email section in the side nav and open the "Receiving" tab. It shows the Resend test address to send to. Send a test email to that address from your own inbox.

TIPS: 
- If you don't see the test address, it's probably because you've already received an email. Use the address in the "To" column, or click the ellipsis (...) at the top right and choose "Receiving Address" to see it.
- Give the email a real subject, like "Hospital Equipment Details". Don't just put "testing": Google may flag it, and if you fire off a lot of test emails back-to-back (which happens when you're testing), Google can block you from sending more, thinking you're a spammer.

How to know if it works?
- Have the Inngest dev server running first (`npm run dev:all` runs everything, or `npm run inngest:dev` on its own). Its UI is at http://localhost:8288.
- If it worked, the Inngest UI shows a new run for the `process-inbox-email` function — that's the event landing and the pipeline kicking off. Open the run to watch each step (classify, extract, match) and see the Notification or Work Order it creates.
- If nothing shows up, the usual causes are: a sending-only API key, a missing or mismatched `RESEND_WEBHOOK_SECRET`, or a dead tunnel (if the ngrok/cloudflared process restarts, the URL changes and the old webhook points nowhere — update the webhook URL in Resend).


Full walkthrough (agentic) — API key, tunnel, webhook, sending a test email, and where to
watch it land: **[Email Pipeline (Resend) Setup](./email-pipeline-setup.md)**.


## Frequently Asked Questions

What does Viper actually do — and what does it not do?
- It's a visualization, communication, and prioritization layer. It sits on top of the systems a hospital already runs; it doesn't detect vulnerabilities or generate data of its own, and it doesn't pipe in new feeds — it takes what external systems produce and organizes it so someone can act on it quickly, providing the visibility and communication to solve vulnerabilities as fast as possible since hospital systems are slow and fractured.

Are vulnerabilities and email triage the same system?
- No — they're two separate, independent systems that happen to sit next to each other. Vulnerabilities come from the outside: external tools and TA3 team detect them and push them in through integrations and a REST API (POST), and a nightly job enriches them; a vulnerability is a tracked finding measured against your inventory. Email triage is its own inbound pipeline — a message lands in the inbox, gets classified, and becomes a notification or a work order.

How do vulnerabilities and assets get populated from emails?
- When an email lands, Resend fires a webhook and Viper kicks off a background pipeline (the `processInboxEmail` job). It first classifies the email — work order, notification, or not relevant — and then an LLM reads the body and attachments and extracts any device groups, vulnerabilities, remediations, and assets it can find.

Does Viper have its own ticketing?
- Not yet. Right now it integrates with whatever ticketing system a customer already runs. Native ticketing, for hospitals without one, is on the roadmap but not built.

What's the difference between a Device Group and an Asset?
- A Device Group is an identity: manufacturer + product + version. An Asset is a physical device on the hospital floor. Many assets roll up under one Device Group — every infusion pump of the same make, model, and version is its own asset, all pointing at the same group.

What is Device Group Matching?
- It's how impact gets flagged without hand-tagging every physical device — a query, or pre-filter, over that manufacturer/product/version identity. Flag versions 1, 2, and 3 of a product as vulnerable and every asset on those versions is caught automatically; assets on v4 or v5 fall outside the match and stay clear, and anything new that appears later sorts itself the same way.

What are the differences between DeviceGroup and DeviceGroupMatching?
- As explained above, one is a group-of-devices model and the other is just a pattern-matching model.

What are Entity Filters for?
- They do the same trick as DeviceGroupMatching for notes: instead of pinning a note to thousands of individual assets, the filter describes the set — say, "all infusion pumps in the ICU" — and resolves to the assets that match.
- Note: an Entity Filter's output is treated as trustworthy and verified through Chat. We don't second-guess whether it caught the right set.

How does sync work between Viper and other systems?
- As the Sync Inngest worker runs: An operation fires an outbound request, but the downstream system needs time to work, so a callback comes back roughly 30 to 60 seconds later to confirm the sync landed. Build for that gap rather than expecting an answer on the first hop.


## Additional Resources

- [CLAUDE.md](/CLAUDE.md) - Additional project background, including code patterns
    - A note from a real human: pretty sure parts of this were AI generated but it's still largely helpful
- [Video Tutorial](https://www.youtube.com/watch?v=ED2H_y6dmC8) - a (long) tutorial for a project with a similar tech stack
