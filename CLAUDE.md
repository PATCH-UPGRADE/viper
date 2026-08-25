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
- **AI / Chat**: LangGraph + LangChain (`ChatAnthropic`) for the chat & recommendations agents, streamed to the client via Vercel AI SDK UI (`useChat`)
- **AI Providers**: Vercel AI SDK with Anthropic, OpenAI, Google
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

LangGraph agents that run a model ↔ tools loop and stream to the UI. They share a
toolset, so they share a home:

- `shared/` — everything used by more than one conversational agent:
  `buildAgentGraph` (deterministic context preload → model ↔ tools, with
  human-in-the-loop stops), the `streamEvents` → AI SDK UI bridge, the hospital-wide
  notes preload, and thread persistence + titling.
- `tools/` — model-facing tools: `query_platform_data` (a read-only allowlist of tRPC
  query procedures — mutations are not representable), `record_note`, and
  `buildAgentTools`, the registry every conversational agent binds.
- One directory per agent (`chat/`, `recommendations/`) holding only that agent's
  graph and prompt.

Because every agent binds the same `buildAgentTools` set, a tool added to the
registry is armed for all of them — describe it in each agent's `<tools>` prompt
block or that agent can call something it was never told about.

`buildAgentGraph` ends the turn after any tool in `HALT_TOOLS` —
`ask_user_questions` and `propose_fleet_work_order` — so the graph stops until the
user answers or accepts. A halting tool can suppress its own stop by prefixing its
result with `TOOL_REJECTED_PREFIX` (`"REJECTED:"`): the turn then continues, so the
model sees its own refusal and can correct or explain it, and the UI does not render
an approval card for a proposal that was rejected.

**Known exception:** the per-role prompt fragments (`ASSET_ROLE_INSTRUCTIONS`,
`VULNERABILITY_ROLE_INSTRUCTIONS`, `RECOMMENDATION_ROLE_INSTRUCTIONS`) still live in
`src/features/chat/utils.ts`, and both graphs import them from there — so not all
agent prompt text is under `agents/` yet. They are keyed `Record<UserRole, string>`,
and `UserRole` is also used by the asset and vulnerability drawers, so rehoming the
fragments means first moving that enum somewhere neutral. Until then, a prompt edit
may mean editing `features/chat/utils.ts`.

Both currently run as a **streaming Next.js route** (`src/app/api/chat/route.ts`),
not as Inngest jobs:

- Haiku for the chat agent, Opus + extended thinking for the recommendations agent.
- The route streams token + reasoning + tool deltas to the client via **Vercel AI SDK UI** (`useChat` in `src/features/chat/hooks/use-viper-chat.ts`); `agents/shared/stream-bridge.ts` maps LangGraph `streamEvents` onto the AI SDK UI message stream.
- Conversation history is persisted to Prisma (`ChatThread` / `ChatMessage`); the `record_note` tool dispatches to the `actionNotesFn` Inngest function.

**Task agents — `src/features/<feature>/agent/`**

Single-shot calls that classify, extract, or score one record. No graph, no tool
loop, no streaming — they are invoked from Inngest background jobs rather than from
a user turn, so they stay beside the feature that owns the data:

- `inbox/agent/` — classify, extract, match, triage, vex, mitigation, question
- `notes/agent/` — extract-notes, noteAction
- `questions/agent/escalationEmail/`

Typical shape: `new ChatAnthropic({ … }).withStructuredOutput(zodSchema)`.

**Constraint that shapes both shapes:** Anthropic extended thinking requires
`tool_choice: "auto"`, and `withStructuredOutput()` forces `tool_choice` — so the two
cannot be combined. When an agent needs thinking *and* a guaranteed output shape,
bind a single recording tool and read its call args instead; see
`inbox/agent/vex/index.ts` and `inbox/agent/mitigation/index.ts`. The same constraint
is why `buildAgentGraph` preloads mandatory context deterministically instead of
forcing a first tool call — a single forced tool turn disables thinking for the rest
of the conversation.

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
