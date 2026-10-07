# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Viper** is a **Vulnerability Management Platform (VMP)** for hospitals, funded by ARPA-H under the Resilient Systems focus area. The mission is to help hospital administrators **understand the operational impact** of vulnerabilities and remediations across systems, safety, and clinical workflows. The VMP focuses on **decisions, not graphs**.

### ARPA-H Mission Alignment

This project supports ARPA-H's Resilient Systems initiative, which aims to create capabilities that enhance stability in healthcare infrastructure during disruptive events. Specifically, it addresses:

- Novel ways to protect, secure, integrate, analyze, and communicate health data
- Cyber security with enhanced patient safety properties
- Decision support tools for health infrastructure
- Real-time measurement tools to track health outcomes

### Core Concept: Clinical Digital Twin

Rather than a raw network simulator, the VMP is a **hospital digital twin** where each system is a node representing a **clinical function**, not just an IP address:

- **Nodes**: ICU monitors, infusion pumps, lab analyzers, pharmacy servers, EMR workstations
- **Edges**: Data or workflow dependencies (e.g., "Lab → EMR → Nurse Station → Infusion Pump")
- **Attributes**: Vulnerability score, patch status, uptime requirement, regulatory criticality

### Anchor User Story

> "If I deploy this patch in the ICU monitor today, how many patient systems will be offline and for how long? How will treatments be affected? What security risk remains if I delay it 24 hours? How do these choices affect compliance, safety, and cost?"

### Dual User Base

1. **Clinicians**: Define clinical workflows representing patient care paths (e.g., "Lab → EMR → Nurse Station → Infusion Pump")
2. **Security Engineers**: Define security workflows for patch management and vulnerability remediation

## Development Commands

```bash
# Start Next.js dev server with Turbopack
npm run dev

# Start Inngest development server for background jobs
npm run inngest:dev

# Run both Next.js and Inngest in parallel (recommended)
npm run dev:all

# Build for production
npm run build

# Start production server
npm start

# Lint and format code with Biome
npm run lint
npm run format
```

## Technology Stack

> `package.json` is the source of truth for version info

- **Framework**: Next.js 15 with App Router, React 19, TypeScript (strict mode)
- **API Layer**: tRPC 11 for end-to-end type-safe APIs
- **Database**: Prisma 6 with PostgreSQL
- **Authentication**: Better Auth 1.x
- **Background Jobs**: Inngest 3.x
- **Testing**: Vitest 4 (jsdom for unit/component, node for server-side)
- **State Management**: Jotai (global), TanStack Query (server), nuqs (URL)
- **Visual Editor**: XYFlow React 12
- **UI**: Radix UI + Tailwind CSS 4 + shadcn/ui (New York style)
- **AI / Chat**: LangGraph + LangChain (`ChatOpenAI`, Responses API) for the chat agent and its recommendation node, streamed to the client via Vercel AI SDK UI (`useChat`)
- **AI Providers**: OpenAI (`OPENAI_API_KEY`) via LangChain and the Vercel AI SDK
- **Code Quality**: Biome 2.2.0 (replaces ESLint/Prettier)
- **Observability**: Sentry

## Architecture Overview

### Route Organization

The app uses Next.js route groups for different layouts:

- **(auth)**: Unauthenticated routes (login, signup) with centered auth layout
- **(dashboard)**: Protected routes requiring authentication
  - **(editor)**: Full-screen layout for workflow editing (maximizes canvas space)
  - **(rest)**: Standard dashboard with sidebar and header (workflows, executions, credentials)

### Feature-Based Organization

Each feature is self-contained in `src/features/[feature]/`:

```
feature/
├── components/        # React components
├── hooks/            # Custom hooks (e.g., use-assets.ts)
├── server/
│   ├── routers.ts    # tRPC router definitions
│   ├── prefetch.ts   # Server-side data prefetching
│   └── params-loader.ts  # URL query parameter parsing
└── params.ts         # URL query state definitions (nuqs)
```

### tRPC Pattern

**Server-side** (`src/trpc/init.ts`):

- `baseProcedure`: Unauthenticated endpoints
- `protectedProcedure`: Requires Better Auth session, throws UNAUTHORIZED if missing

**Client-side** (`src/trpc/client.tsx`):

- `TRPCReactProvider`: Wraps QueryClientProvider with SuperJSON serialization
- `useTRPC()`: Hook for accessing tRPC client
- Automatic request batching via httpBatchLink

**Server utilities** (`src/trpc/server.tsx`):

- `prefetch()`: Server-side data prefetching for SSR
- `HydrateClient`: Hydrates prefetched data to client
- Marked with 'server-only'

### Standard Data Fetching Pattern

This pattern is used throughout the app for server-rendered pages with client interactivity:

```typescript
// Server Component (Page)
const Page = async ({ searchParams }: Props) => {
  await requireAuth();                          // 1. Check authentication
  const params = await assetsParamsLoader(searchParams); // 2. Parse URL params
  prefetchAssets(params);                       // 3. Prefetch data on server

  return (
    <HydrateClient>                             {/* 4. Hydrate to client */}
      <ErrorBoundary fallback={<Error />}>
        <Suspense fallback={<Loading />}>       {/* 5. Handle loading */}
          <AssetsList />                         {/* 6. Client component */}
        </Suspense>
      </ErrorBoundary>
    </HydrateClient>
  );
};

// Client Component
'use client';
const AssetsList = () => {
  // Uses suspense queries - no loading states needed
  const { data } = useSuspenseAssets();
  return <div>{data.map(...)}</div>;
};
```

> In practice the real list pages compose this pattern via the `createListPage`
> factory (e.g. `src/app/(dashboard)/(rest)/assets/page.tsx`); the shape above is
> the underlying pattern it implements.

### URL State Management (nuqs)

Each feature defines URL state schemas for searchable/shareable state:

```typescript
// src/features/assets/params.ts
// createPaginationParams() → page, pageSize, search, sort,
//                            lastUpdatedStartTime, lastUpdatedEndTime
export const assetsParams = createPaginationParams();

// Server-side: server/params-loader.ts
export const assetsParamsLoader = createLoader(assetsParams);

// Client-side: hooks/use-asset-params.ts
export const useAssetsParams = () => useQueryStates(assetsParams);
```

### Authentication Flow

**Configuration** (`src/lib/auth.ts`):

- Better Auth with Prisma adapter for PostgreSQL
- Email/password authentication with auto sign-in enabled

**Protection Utilities** (`src/lib/auth-utils.ts`):

- `requireAuth()`: Redirects to /login if unauthenticated
- `requireUnauth()`: Redirects to / if authenticated

**tRPC Integration**:

```typescript
export const protectedProcedure = baseProcedure.use(async ({ ctx, next }) => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, auth: session } });
});
```

### Background Jobs (Inngest)

Inngest runs the durable/background work: integration syncs (cron + event-driven),
nightly vulnerability enrichment (EPSS / KEV), chat memory persistence, and
expired-token cleanup. The AI chat does **not** run in Inngest — see "AI Agents" below.

**Setup** (`src/inngest/functions/`):

- Functions defined with `inngest.createFunction()`
- Use `step.sleep()` for delays
- Automatic retry and observability built-in

**API Route** (`src/app/api/inngest/route.ts`): every function must be added to the `functions`
array passed to `serve()`, or it will never run.

Integration syncs are the one group that is *not* extended by editing these files: adding a
platform never touches `src/inngest/functions/sync-integrations.ts`. See
`src/features/integrations/CLAUDE.md` if necessary.

**Development**: Run `npm run inngest:dev` (or `npm run dev:all`) to start the Inngest dev server

### AI Agents

Agents come in two shapes that live in different places. Which shape you need decides
where the code goes.

**Conversational agents — `src/features/agents/`**

LangGraph agents that run a model ↔ tools loop and stream to the UI. There is one
conversational agent, the chat agent, and it has two model nodes:

- `shared/` — `buildAgentGraph` (deterministic context preload → model ↔ tools, with
  human-in-the-loop stops and an optional `recommendation` model node), `recommendation-window.ts`
  (the message window the recommendation node sees), the `streamEvents` → AI SDK UI bridge, the
  hospital-wide notes preload, and thread persistence + titling.
- `tools/` — model-facing tools: `query_platform_data` (a read-only allowlist of tRPC
  query procedures — mutations are not representable), `record_note`, the report tools
  (`search_report`, `read_report`, `edit_report`, `write_report`), `request_recommendation`,
  and `buildAgentTools`, the registry the chat graph binds. The recommendation node gets the
  report tools only on the reports view (`REPORTS_VIEW_TOOL_NAMES`).
- `chat/` — the chat agent's graph and prompt (GPT-6 Luna), plus `recommendation-prompt.ts`: the
  remediation advisor's prompt (GPT-6.1 Sol, high reasoning effort) and `RECOMMENDATION_TOOL_NAMES`,
  the subset of the registry the recommendation node binds.

The chat model decides, per turn, whether a question needs the recommendation node by calling
`request_recommendation`. The graph then routes to the `recommendation` node, which owns the rest of
the turn: it runs the same tools loop with its own system prompt, and its text is the
reply. When the recommendation node's turn ended on a question card, the next request starts on the
recommendation node directly (`lastAssistantTurnAwaitsRecommendation` reads the saved tool parts of
the last assistant turn), so the answers reach the model that asked.

Every tool in the registry must be described in the chat prompt, and in
`recommendation-prompt.ts` too if it is in `RECOMMENDATION_TOOL_NAMES` — otherwise a model can call
something it was never told about.

**The recommendation node never sees the chat model's tool-call turns.** Those calls were made by
a different model running without reasoning, and a reasoning model on the Responses API expects each
function-call item it is handed to arrive with the reasoning item that produced it.
`recommendationWindow` keeps the conversation text and the recommendation node's own turns only; it
has a unit test, keep it green.

`buildAgentGraph` ends the turn after any tool in `HALT_TOOLS` —
`ask_user_questions` and `propose_work_order` — so the graph stops until the
user answers or accepts. A halting tool can suppress its own stop by prefixing its
result with `TOOL_REJECTED_PREFIX` (`"REJECTED:"`): the turn then continues, so the
model sees its own refusal and can correct or explain it, and the UI does not render
an approval card for a proposal that was rejected.

**Known exception:** the per-role prompt fragments (`ASSET_ROLE_INSTRUCTIONS`,
`VULNERABILITY_ROLE_INSTRUCTIONS`, `RECOMMENDATION_ROLE_INSTRUCTIONS`) still live in
`src/features/chat/utils.ts`, and the chat graph imports them from there — so not all
agent prompt text is under `agents/` yet. They are keyed `Record<UserRole, string>`,
and `UserRole` is also used by the asset and vulnerability drawers, so rehoming the
fragments means first moving that enum somewhere neutral. Until then, a prompt edit
may mean editing `features/chat/utils.ts`.

It runs as a **streaming Next.js route** (`src/app/api/chat/route.ts`), not as an
Inngest job:

- GPT-6 Luna (`reasoning.effort: "none"`) for the chat model; GPT-6.1 Sol (`effort: "high"`, `summary: "auto"`) for the recommendation node. The reasoning summary is what streams into the UI's reasoning block.
- The route streams token + reasoning + tool deltas to the client via **Vercel AI SDK UI** (`useChat` in `src/features/chat/hooks/use-viper-chat.ts`); `agents/shared/stream-bridge.ts` maps LangGraph `streamEvents` onto the AI SDK UI message stream.
- Conversation history is persisted to Prisma (`ChatThread` / `ChatMessage`); the `record_note` tool dispatches to the `actionNotesFn` Inngest function.

**Task agents — `src/features/<feature>/agent/`**

Single-shot calls that classify, extract, or score one record. No graph, no tool
loop, no streaming — they are invoked from Inngest background jobs rather than from
a user turn, so they stay beside the feature that owns the data:

- `inbox/agent/` — classify, extract, match, triage, vex, mitigation, question
- `notes/agent/` — extract-notes, noteAction
- `questions/agent/escalationEmail/`

Typical shape: `new ChatOpenAI({ model, useResponsesApi: true, reasoning: { effort } })
.withStructuredOutput(zodSchema, { method: "functionCalling" })`.

**Constraints that shape both shapes:**

- **Always pass `method: "functionCalling"` to `withStructuredOutput`.** The default
  (`jsonSchema`) hard-codes OpenAI strict mode for zod schemas, and strict mode rejects
  `.optional()`, `.default()` and `z.record` fields with a 400 — which many of our schemas use.
- **Reasoning tokens count toward `maxTokens`.** Budget for the reasoning as well as the
  output whenever `effort` is above `"none"`.
- **Sol's lowest effort is `"low"`; only Luna accepts `"none"`.** Reasoning models also
  reject `temperature`, so never set it.
- Agents whose output schema is built per call (vex, mitigation) bind a single recording
  tool with `tool_choice: "required"` and validate its args themselves; see
  `inbox/agent/vex/index.ts` and `inbox/agent/mitigation/index.ts`.

## Database

**Prisma Configuration**:

- Custom output location: `src/generated/prisma` (instead of node_modules)
- PostgreSQL provider
- Cascade deletes for workflow integrity

**Key Models**:

- `User`: Authentication (managed by Better Auth)
- `Asset`: A concrete networked device instance on the hospital network (a real box with an IP)
- `DeviceGroup`: Canonical identity for a *class* of devices — the resolved Vendor + Product + Version triple that `Asset`s are grouped under
- `DeviceGroupMatching`: A matching *rule* (wildcard-capable: null `productId` = all products of a vendor; `versionRange` is a VERS expression) that attaches `Vulnerability`, `Remediation`, and `Issue` records to whole classes of devices.
* `Issue`: A mapping between a Vulnerability and an Asset/DeviceGroupMatching. An Issue affects an Asset if:
    * The issue is linked to a device group matching that resolves to that asset, and there is no issue that overrides it
    * The issue is directly linked to the asset

**Model relationships**: `Asset` → `DeviceGroup` is the concrete grouping; `DeviceGroupMatching` is the parallel *rule* construct (there is no direct FK between `DeviceGroup` and `DeviceGroupMatching`). `Issue` joins a `Vulnerability` to either a `DeviceGroupMatching` (class-level) or a specific `Asset` (which overrides the class-level record).

**Schema Location**: `prisma/schema.prisma`

## Seeding

One command seeds everything: `npm run db:seed` (`npx prisma db seed`). **Do not add a
`db:seed-<thing>` script or a standalone seed file that someone has to remember to run.** New
seed data goes into one of the folders below, and the entry point picks it up.

```
prisma/seed.ts                 # entry point only: no data lives here
prisma/seeds/production/       # data every deployment needs (manufacturers, the CISA CSAF integration)
prisma/seeds/dev/base/         # shared demo data, one file per feature, plus shared helpers
prisma/seeds/dev/<TICKET>/     # test data for one ticket, e.g. prisma/seeds/dev/VW-532/
```

**Production data** (`prisma/seeds/production/`) runs on every Docker boot and on the Neon
migrations workflow, against databases that already hold real data. A production seed must only
add what is missing: never delete, rename or overwrite. Register it in
`prisma/seeds/production/index.ts`.

**Ticket test data** (`prisma/seeds/dev/<TICKET>/index.ts`) is how a PR ships the data a reviewer
needs. The folder name is the ticket code, and `index.ts` exports one function:

```typescript
import prisma from "@/lib/db";
import type { TicketSeedContext } from "../ticket-seeds";

export async function seed({ seedUserId }: TicketSeedContext) {
  await prisma.workflow.upsert({
    where: { id: "vw-532-night-shift-imaging" },
    update: {},
    create: {
      id: "vw-532-night-shift-imaging",
      name: "VW-532: Night shift imaging coverage",
      userId: seedUserId,
    },
  });
}
```

**Which ticket folder runs.** `npm run db:seed` reads the current Git branch, takes the ticket
code at the start of its name (`VW-532`, `vw-532` and `VW-532-some-suffix` all mean `VW-532`), and
runs `prisma/seeds/dev/VW-532/` if that folder exists. With no ticket in the branch name, no
matching folder, or no Git branch at all (`main`, CI, a Docker image), no ticket folder runs and
the seed is the plain dev seed. So after checking out a PR, plain `npm run db:seed` loads that
PR's test data.

The folder name must be the upper-case ticket code (`VW-532`, not `vw-532`). Any other folder
under `prisma/seeds/dev/`, apart from `base`, stops the seed with an error.

The base demo data loads once. If a database already has it, `npm run db:seed` skips it and runs
only the production data and the ticket folder, without duplicating the base rows.

A reviewer may run a ticket seed more than once, on a database other tickets have also seeded.
Each one must:

- be safe to run twice: `upsert` on a stable id you choose, or find before create;
- leave rows owned by the base demo data or by another ticket alone (do not move the seed user to
  another department, for example);
- not depend on another ticket's folder.

Delete the folder when the ticket's PR has merged and reviewers no longer need the data. Move
anything worth keeping into `prisma/seeds/dev/base/`.

**Switches** (environment variables):

- `SEED_SCOPE=production`: production data only.
- `SEED_SCOPE=all`: load the base demo data again even if it is already there. Several base seeds
  use plain `create`, so this duplicates their rows.
- `SEED_TICKET=VW-532`: run that ticket's folder instead of the current branch's. Takes a
  comma-separated list (`SEED_TICKET=VW-532,VW-540`). Cannot be combined with
  `SEED_SCOPE=production`.

Any other value of `SEED_SCOPE`, including an empty one, stops the seed with an error.

For a clean database, use Prisma's own reset: `npx prisma migrate reset` drops the database,
re-applies every migration and runs the seed.

The older `scripts/seed-*.ts` files are manual, local-only scripts from before this layout. Do
not copy that pattern for new work.

## State Management Strategy

- **Server state**: React Query via tRPC (server data, API calls)
- **URL state**: nuqs (pagination, filters, search - searchable/shareable)
- **Global state**: Jotai (editor instance, cross-component state)
- **Local state**: React useState (UI interactions, forms)

## Important Conventions

### File Naming

- Components: PascalCase (e.g., `AssetNode.tsx`)
- Utilities: kebab-case (e.g., `auth-utils.ts`)
- Features: organized by domain (auth, assets, editor)

### Import Aliases

- `@/*`: Maps to `src/*`
- Use consistently throughout codebase

### Server/Client Boundaries

- Server files marked with `'server-only'`
- Client components marked with `'use client'`
- Clear separation enforced by Next.js

### Error Handling

- ErrorBoundary at page level
- Toast notifications (sonner) for user feedback
- Sentry for production error tracking

### Code Quality

- Biome for linting/formatting (recommended rules enabled)
- Auto-organize imports on save
- Next.js and React domains configured
- TypeScript strict mode enabled

## Key Files to Understand

**Core Setup**:

- `src/app/layout.tsx` - Root providers (tRPC, themes, error tracking)
- `src/trpc/init.ts` - tRPC procedures and context
- `src/lib/auth.ts` - Better Auth configuration

**Feature Example (Assets)**:

- `src/features/assets/server/routers.ts` - tRPC router (`assetsRouter`)
- `src/features/assets/hooks/use-assets.ts` - Client hooks
- `src/features/assets/params.ts` - URL state schema

**Editor**:

- `src/features/editor/components/editor.tsx` - React Flow editor
- `src/config/node-components.ts` - Node type registry
- `src/components/node-selector.tsx` - Node picker sheet

**Database**:

- `prisma/schema.prisma` - Database schema definition
- `src/lib/db.ts` - Prisma client singleton

## VMP-Specific Development Guidelines

### Healthcare Data Compliance

- **PHI/PII Protection**: All patient and facility data must comply with HIPAA
- **Section 508**: All UI components must meet accessibility requirements

### Testing Requirements

- **Unit tests**: All AI prompts with golden samples
- **Validation**: Time calculations, risk metrics, downtime estimates must be deterministic and testable

## Testing

Most of the suite is ordinary unit tests, but the API tests in `src/app/api/v1/__tests__/` drive a
**live server over HTTP** with supertest. They are not excluded from the default vitest project, so
a bare `npm run test` without `API_KEY` throws at import time. The full local run:

```bash
npm run db:create-test-api-key
```

That prints `API_KEY=<key>`. It requires the seed user (`user@example.com`). The key lasts 24 hours.

The server must be started, since the API tests hit `http://localhost:3000`:

```bash
API_KEY=<key> npm run test -- --run
```

`npm run test` is bare `vitest`, i.e. **watch mode** — pass `-- --run` for a terminating one-shot
run. `.github/workflows/ci.yml` (job `run-npm-tests`) is the canonical version of this recipe.

**Integration suite**: `npm run test:integration` runs `tests/integration/` under
`vitest.integration.config.mts` (node environment). It is a separate cross-service suite against
Blueflow with its own env vars — `VIPER_API_URL`, `VIPER_API_KEY`, `BLUEFLOW_URL`,
`VIPER_CALLBACK_URL` — and its own token script, `npm run db:create-blueflow-integration`.

**Conventions**:

- `vitest.config.mts` is jsdom, sets a 60s timeout, aliases `@` → `src`, and stubs `server-only`.
- Files are `*.test.ts` / `*.test.tsx`; integration suites are `*.integration.test.ts`. Both
  colocation styles exist — a `__tests__/` sibling directory or the file next to its source.
- Server-side tests opt out of jsdom per file:

```typescript
// @vitest-environment node
vi.mock("server-only", () => ({}));
```

  `src/inngest/functions/__tests__/sync-integrations.test.ts` is a good model — it mocks `@/lib/db`
  and stubs `createFunction` to return the raw handler, so an Inngest function can be driven with a
  fake `step`.
