# CLAUDE.md

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

The platform is built as a visual workflow builder (similar to n8n/Zapier) with Next.js 15 and a node-based editor powered by React Flow.

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

- **Framework**: Next.js 15.5.4 with App Router, React 19, TypeScript (strict mode)
- **API Layer**: tRPC 11.6.0 for end-to-end type-safe APIs
- **Database**: Prisma 6.16.3 with PostgreSQL
- **Authentication**: Better Auth 1.3.26
- **Background Jobs**: Inngest 3.44.1
- **State Management**: Jotai (global), TanStack Query (server), nuqs (URL)
- **Visual Editor**: XYFlow React 12.8.6
- **UI**: Radix UI + Tailwind CSS 4 + shadcn/ui (New York style)
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
├── hooks/            # Custom hooks (e.g., use-workflows.ts)
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
  const params = await paramsLoader(searchParams); // 2. Parse URL params
  prefetchWorkflows(params);                    // 3. Prefetch data on server

  return (
    <HydrateClient>                             {/* 4. Hydrate to client */}
      <ErrorBoundary fallback={<Error />}>
        <Suspense fallback={<Loading />}>       {/* 5. Handle loading */}
          <WorkflowsClient />                   {/* 6. Client component */}
        </Suspense>
      </ErrorBoundary>
    </HydrateClient>
  );
};

// Client Component
'use client';
const WorkflowsClient = () => {
  // Uses suspense queries - no loading states needed
  const { data } = useSuspenseWorkflows();
  return <div>{data.map(...)}</div>;
};
```

### URL State Management (nuqs)

Each feature defines URL state schemas for searchable/shareable state:

```typescript
// src/features/workflows/params.ts
export const workflowsParams = {
  page: parseAsInteger.withDefault(1),
  pageSize: parseAsInteger.withDefault(5),
  search: parseAsString.withDefault(""),
};

// Server-side: params-loader.ts
export const workflowsParamsLoader = createLoader(workflowsParams);

// Client-side: hooks/use-workflows-params.ts
export const useWorkflowsParams = () => useQueryStates(workflowsParams);
```

### React Flow Node System

The VMP uses a **node-based workflow DSL** with the following node categories:

**VMP Node Categories**:

1. **Trigger Nodes**: Fire on events (e.g., "new patch submitted", "new CVE for device class", "ticket state changes")
2. **Transform Nodes**: Shape the payload (dependency expansion, data cleanup, CMDB lookup)
3. **AI Execution Nodes**: LLM-powered tools that summarize, classify, plan
   - `AI.PatchRead`: Extract structured data from patch notes (requires reboot, downtime estimate, affected services)
   - `AI.RiskNarrative`: Generate human-readable risk summaries for hospital admins
   - `AI.RolloutPlanner`: Propose staged rollout schedules respecting maintenance windows
   - `AI.ChangeSummary`: Create admin-readable markdown summaries
4. **Deterministic Execution Nodes**: Simulate events in the WHS (Workflow Hospital Simulator), e.g., patch device, calculate downtime
5. **Human-in-the-Loop Nodes**: Approvals, edits, overrides (clinical lead approval gates)
6. **Policy Nodes**: Boolean gates (e.g., "Downtime < 15m", "life_safety=true")

**Node Registration** (`src/config/node-components.ts`):

```typescript
export const nodeComponents = {
  [NodeType.INITIAL]: InitialNode,
  [NodeType.HTTP_REQUEST]: HttpRequestNode,
  [NodeType.MANUAL_TRIGGER]: ManualTriggerNode,
} as const satisfies NodeTypes;
```

To add a new node type:

1. Add enum value to `NodeType` in Prisma schema
2. Create node component extending an existing base 
3. Register in `node-components.ts`
4. Add to node selector in `components/node-selector.tsx`

**Node Component Architecture**:

- Base components: `BaseTriggerNode`, `BaseExecutionNode`, `BaseAssetNode`, `BaseStepNode`
- Wrapper: `WorkflowNode` (provides toolbar, delete button, settings)
- Primitives: `BaseNode`, `BaseHandle`, `NodeStatusIndicator`
- Each node type has companion dialog for configuration

**Node State & Data Flow**:

- Editor instance stored in Jotai atom (`editorAtom`)
- Nodes/edges synced with database via tRPC mutations
- Local React state for real-time editing, debounced saves to database
- Data flows forward as a JSON payload ("context bag"); nodes append artifacts (summaries, diffs, charts) and outputs

### Example VMP Workflow

A typical patch management workflow:

```
PatchSubmitted (trigger)
  → AI.PatchRead (extracts: requires_reboot, downtime)
  → CMDBLookup (find affected assets)
  → DependencyExpand (map clinical workflows)
  → SimulateImpact (calculate downtime, risk delta)
  → CriticalityGate (if life_safety=true)
      → Approval (clinical lead review) → RolloutPlanner
      → SchedulePatch
  → AI.RiskNarrative (generate summary)
  → AI.RolloutPlanner (staged rollout schedule)
  → OpenChangeTicket
  → ReportPDF
  → Notify (Teams, Email)
  → GitCommit (manifest.json)
```

**Key VMP Workflow Outcomes**:

- Risk reduction metrics (e.g., "risk ↓ 46%, from CVSS 8.2 → 4.4")
- Downtime estimates (e.g., "30 min total across 15 ICU monitors")
- Clinical impact analysis (e.g., "affects life_safety path: Lab→EMR→Nurse Station→medical delivery")
- Staged rollout plan (e.g., "two 30m ICU windows, staggered to avoid shift changes")
- Approval gates for high-criticality changes

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

**Setup** (`src/inngest/functions.ts`):

- Functions defined with `inngest.createFunction()`
- Use `step.ai.wrap()` for AI SDK telemetry
- Use `step.sleep()` for delays
- Automatic retry and observability built-in

**API Route** (`src/app/api/inngest/route.ts`):

```typescript
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [execute],
});
```

**Development**: Run `npm run inngest:dev` (or `npm run dev:all`) to start the Inngest dev server

## Database

**Prisma Configuration**:

- Custom output location: `src/generated/prisma` (instead of node_modules)
- PostgreSQL provider
- Cascade deletes for workflow integrity

**Key Models**:

- `User`: Authentication (managed by Better Auth)
- `Workflow`: Top-level workflow container (user-owned)
- `Node`: Individual workflow nodes with position, type, and JSON data
- `Connection`: Edges between nodes with from/to handles
- `NodeType` enum: INITIAL, MANUAL_TRIGGER, HTTP_REQUEST

**Schema Location**: `prisma/schema.prisma`

## State Management Strategy

- **Server state**: React Query via tRPC (server data, API calls)
- **URL state**: nuqs (pagination, filters, search - searchable/shareable)
- **Global state**: Jotai (editor instance, cross-component state)
- **Local state**: React useState (UI interactions, forms)

## Important Conventions

### File Naming

- Components: PascalCase (e.g., `WorkflowNode.tsx`)
- Utilities: kebab-case (e.g., `auth-utils.ts`)
- Features: organized by domain (auth, workflows, editor)

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

**Feature Example (Workflows)**:

- `src/features/workflows/server/routers.ts` - tRPC router
- `src/features/workflows/hooks/use-workflows.ts` - Client hooks
- `src/features/workflows/params.ts` - URL state schema

**Editor**:

- `src/features/editor/components/editor.tsx` - React Flow editor
- `src/config/node-components.ts` - Node type registry
- `src/components/node-selector.tsx` - Node picker sheet

**Database**:

- `prisma/schema.prisma` - Database schema definition
- `src/lib/db.ts` - Prisma client singleton

**VMP Documentation**:

- `docs/technical-overview.md` - VMP technical architecture and node design
- `docs/upgrade-baa.pdf` - ARPA-H BAA funding requirements and mission

## VMP-Specific Development Guidelines

### AI Execution Node Patterns

When implementing AI execution nodes:

1. **AI.PatchRead** (extraction, deterministic JSON):
   - System: "Extract ONLY fields per schema. If uncertain, set null."
   - Output: Structured JSON only (no free-text)
   - Guard: regex validator + max tokens

2. **AI.RiskNarrative** (NLG, human-facing):
   - System: "Summarize for non-technical hospital admin"
   - Must reference fields by key; never invent numbers
   - Unit test with golden samples

3. **AI.RolloutPlanner** (planning):
   - System: "Propose batches respecting windows, concurrency, blackout rules"
   - Output: Validated time-based schedule
   - Validator checks time math

### Healthcare Data Compliance

- **PHI/PII Protection**: All patient and facility data must comply with HIPAA
- **Clinical Safety**: Life-safety workflows (identified by `life_safety=true` flag) require additional approval gates
- **Audit Trail**: All workflow executions, approvals, and decisions must be logged
- **Section 508**: All UI components must meet accessibility requirements

### Hospital Digital Twin Modeling

When modeling hospital systems:

- **Nodes represent clinical functions**, not just network devices
- **Edges represent dependencies** (data flow or workflow dependencies)
- **Attributes include**:
  - Vulnerability scores (CVSS)
  - Patch status
  - Uptime requirements (SLA)
  - Regulatory criticality
  - Clinical impact (life_safety flag)

### Testing Requirements

- **Unit tests**: All AI node prompts with golden samples
- **Integration tests**: Full workflow simulations with hospital simulator (WHS)
- **Validation**: Time calculations, risk metrics, downtime estimates must be deterministic and testable
