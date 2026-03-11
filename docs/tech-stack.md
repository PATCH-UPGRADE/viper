# Viper Tech Stack Architecture

## Platform Architecture

```mermaid
graph TB
    subgraph client ["Client Layer"]
        ReactFlow["React Flow (XYFlow 12)\nNode-Based Workflow Editor"]
        ShadcnUI["shadcn/ui + Radix UI\nComponent Library"]
        TailwindCSS["Tailwind CSS 4\nStyling"]
        Jotai["Jotai\nGlobal State"]
        Nuqs["nuqs\nURL State"]
        TanStackQuery["TanStack Query\nServer State"]
    end

    subgraph framework ["Framework Layer"]
        NextJS["Next.js 15\nApp Router + Turbopack"]
        TRPC["tRPC 11\nType-Safe API"]
        OpenAPI["trpc-to-openapi\nOpenAPI Generation"]
        BetterAuth["Better Auth\nEmail/Password, Google OAuth, API Keys"]
    end

    subgraph background ["Background Jobs"]
        Inngest["Inngest\nDurable Functions"]
        ChatAgent["Chat Agent\n@inngest/agent-kit"]
        IntegrationSync["Integration Sync\nScheduled + Event-Driven"]
        VulnEnrich["Vulnerability Enrichment\nEPSS / KEV"]
    end

    subgraph ai ["AI Providers"]
        VercelAI["Vercel AI SDK"]
        Anthropic["Anthropic\nClaude"]
        OpenAIProvider["OpenAI\nGPT"]
        Google["Google\nGemini"]
    end

    subgraph external ["External Integrations"]
        N8N["n8n\nWorkflow Automation"]
        Webhooks["Webhooks\nEvent Push"]
        ExternalAPI["OpenAPI Consumers\nExternal Providers"]
    end

    subgraph data ["Data Layer"]
        Prisma["Prisma 6\nORM"]
        PostgreSQL["PostgreSQL 17\nPrimary Database"]
    end

    subgraph infra ["Infrastructure"]
        S3["AWS S3\nArtifact Storage"]
        Sentry["Sentry\nError Tracking + Monitoring"]
    end

    React19["React 19"] --> client

    ReactFlow --> NextJS
    ShadcnUI --> NextJS
    TailwindCSS --> NextJS
    Jotai --> NextJS
    Nuqs --> NextJS
    TanStackQuery --> TRPC

    NextJS --> TRPC
    NextJS --> BetterAuth
    TRPC --> OpenAPI
    TRPC --> Prisma
    OpenAPI --> ExternalAPI

    NextJS --> Inngest
    Inngest --> ChatAgent
    Inngest --> IntegrationSync
    Inngest --> VulnEnrich
    ChatAgent --> VercelAI
    VercelAI --> Anthropic
    VercelAI --> OpenAIProvider
    VercelAI --> Google

    IntegrationSync --> N8N
    IntegrationSync --> Webhooks
    IntegrationSync --> Prisma

    Prisma --> PostgreSQL
    NextJS --> S3
    NextJS --> Sentry
```

### Key Components

**tRPC** serves as the internal API backbone. All client-server communication flows through tRPC procedures (`baseProcedure` for public endpoints, `protectedProcedure` for authenticated ones). For external consumers, `trpc-to-openapi` auto-generates an OpenAPI spec from the same router definitions, exposed at `/api/v1/` and documented at `/api/openapi.json`.

**Inngest** powers all background and long-running work. It runs durable functions for the AI chat agent (via `@inngest/agent-kit`), scheduled integration syncs (cron-triggered), event-driven integration syncs, and daily vulnerability enrichment against EPSS and KEV feeds. Each function benefits from automatic retries and built-in observability.

**n8n** acts as an external workflow automation layer. When an integration provider doesn't follow Viper's standardized sync protocol, n8n orchestrates the crawl-and-transform pipeline that normalizes external data before submitting it to Viper's integration upload endpoints.

---

## Deployment Pathways

```mermaid
graph LR
    subgraph vercelPath ["Vercel (Cloud)"]
        VercelPlatform["Vercel\nNext.js Hosting"]
        NeonDB["Neon / Managed PostgreSQL\nDatabase"]
        InngestCloud["Inngest Cloud\nBackground Jobs"]
        VercelPlatform --> NeonDB
        VercelPlatform --> InngestCloud
    end

    subgraph dockerPath ["Docker Compose (Self-Hosted)"]
        ViperContainer["viper\nNext.js App (Port 3000)"]
        InngestContainer["inngest\nDev Server (Port 8288)"]
        PostgresContainer["postgres\nPostgreSQL 17 (Port 5432)"]
        PrismaStudio["prisma-studio\nDB GUI (Port 5555, dev profile)"]
        ViperContainer --> PostgresContainer
        ViperContainer --> InngestContainer
        InngestContainer --> ViperContainer
        PrismaStudio -.-> PostgresContainer
    end

    SourceCode["Source Code"] --> VercelPlatform
    SourceCode --> ViperContainer
```

### Vercel (Cloud)

The default cloud deployment. Next.js deploys directly to Vercel with zero configuration. The database runs on a managed PostgreSQL provider (e.g., Neon), and Inngest Cloud handles background job orchestration. This pathway is ideal for production and staging environments where managed infrastructure reduces operational overhead.

### Docker Compose (Self-Hosted)

A fully self-contained deployment defined in `compose.yml` with three services:

| Service | Image | Port | Role |
|---|---|---|---|
| **viper** | Custom (multi-stage Node build) | 3000 | Next.js application; runs Prisma migrations and seed on first start |
| **inngest** | `inngest/inngest:v1.17.2` | 8288 | Inngest dev server; bootstraps from `http://viper:3000/api/inngest` |
| **postgres** | PostgreSQL 17 Alpine | 5432 | Primary database with health checks and persistent volume |

An optional `prisma-studio` service (activated with `--profile dev`) provides a database GUI on port 5555.

This pathway suits local development, air-gapped hospital environments, or deployments where data must remain on-premises.
