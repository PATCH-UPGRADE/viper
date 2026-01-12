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

## Tests

There is no QA team, you're responsible for writing your own tests (a process I'll note is currently behind).

See [Next.js Guide to Testing](https://nextjs.org/docs/app/guides/testing).

Ideally, we have:
- component tests focused on regression testings (i.e, does this internal api endpoint still return data in the correct format?)
- comprehensive end to end and unit tests for API endpoints, with a specific focus on our external API endpoints
- Playwright tests for the most common user tasks (i.e, logging in and viewing assets)

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
- Should be able to test PR yourself in Vercel deployment
- Must past GitHub Actions pipeline (code builds and deploys successfully, is linted/formatted, tests pass, etc) 

## Additional Resources

- [CLAUDE.md](/CLAUDE.md) - Additional project background, including code patterns
    - A note from a real human: pretty sure parts of this were AI generated but it's still largely helpful
- [Video Tutorial](https://www.youtube.com/watch?v=ED2H_y6dmC8) - a (long) tutorial for a project with a similar tech stack
