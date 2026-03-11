# Viper Tech Stack Architecture

## Platform Architecture

```mermaid
graph TB
    subgraph client ["Client Layer"]
        ShadcnUI["shadcn/ui + Radix UI<br/>Component Library"]
        TailwindCSS["Tailwind CSS 4<br/>Styling"]
        Nuqs["nuqs<br/>URL State"]
        TanStackQuery["TanStack Query<br/>Server State"]
    end

    subgraph framework ["Framework Layer"]
        NextJS["Next.js 15<br/>App Router + Turbopack"]
        TRPC["tRPC 11<br/>Type-Safe API"]
        OpenAPI["trpc-to-openapi<br/>OpenAPI Generation"]
        BetterAuth["Better Auth<br/>Email/Password, Google OAuth, API Keys"]
    end

    subgraph background ["Background Jobs"]
        Inngest["Inngest<br/>Durable Functions"]
        ChatAgent["Chat Agent<br/>@inngest/agent-kit"]
        IntegrationSync["Integration Sync<br/>Scheduled + Event-Driven"]
        VulnEnrich["Vulnerability Enrichment<br/>EPSS / KEV"]
    end

    subgraph ai ["AI Providers"]
        VercelAI["Vercel AI SDK"]
        Anthropic["Anthropic<br/>Claude"]
        OpenAIProvider["OpenAI<br/>GPT"]
        Google["Google<br/>Gemini"]
    end

    subgraph external ["External Integrations"]
        N8N["n8n<br/>Workflow Automation"]
        Webhooks["Webhooks<br/>Event Push"]
        ExternalAPI["OpenAPI Consumers<br/>External Providers"]
    end

    subgraph data ["Data Layer"]
        Prisma["Prisma 6<br/>ORM"]
        PostgreSQL["PostgreSQL 17<br/>Primary Database"]
    end

    subgraph infra ["Infrastructure"]
        S3["AWS S3<br/>Artifact Storage"]
        Sentry["Sentry<br/>Error Tracking + Monitoring"]
    end

    React19["React 19"] --> client

    ShadcnUI --> NextJS
    TailwindCSS --> NextJS
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
        VercelPlatform["Vercel<br/>Next.js Hosting"]
        NeonDB["Neon / Managed PostgreSQL<br/>Database"]
        InngestCloud["Inngest Cloud<br/>Background Jobs"]
        VercelPlatform --> NeonDB
        VercelPlatform --> InngestCloud
    end

    subgraph dockerPath ["Docker Compose (Self-Hosted)"]
        ViperContainer["viper<br/>Next.js App (Port 3000)"]
        InngestContainer["inngest<br/>Dev Server (Port 8288)"]
        PostgresContainer["postgres<br/>PostgreSQL 17 (Port 5432)"]
        PrismaStudio["prisma-studio<br/>DB GUI (Port 5555, dev profile)"]
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
