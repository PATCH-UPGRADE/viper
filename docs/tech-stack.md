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

---

## Data Model

Model relationships from the Prisma schema (`prisma/schema.prisma`), grouped by domain. Field details are omitted; see the schema file for column definitions.

```mermaid
erDiagram
    %% ── Auth ──
    User ||--o{ Session : "has"
    User ||--o{ Account : "has"
    User ||--o{ Apikey : "has"

    %% ── Workflows ──
    User ||--o{ Workflow : "owns"
    Workflow ||--o{ Node : "contains"
    Workflow ||--o{ Connection : "contains"
    NodeTemplate |o--o{ Node : "templates"
    Node ||--o{ Connection : "from"
    Node ||--o{ Connection : "to"

    %% ── Hospital Assets (DeviceGroup hierarchy) ──
    User ||--o{ Asset : "owns"
    DeviceGroup ||--o{ Asset : "groups"
    DeviceGroup ||--o{ DeviceGroupHistory : "tracks"
    Asset ||--o{ DeviceGroupHistory : "tracks"
    DeviceGroup ||--o{ DeviceArtifact : "has"
    User ||--o{ DeviceArtifact : "owns"

    %% ── Vulnerability Management ──
    User ||--o{ Vulnerability : "owns"
    DeviceGroup }o--o{ Vulnerability : "affected by"
    DeviceArtifact |o--o{ Vulnerability : "source of"
    Vulnerability ||--o{ Issue : "raises"
    Asset ||--o{ Issue : "has"
    Issue ||--o{ IssueRemediation : "resolved via"
    Remediation ||--o{ IssueRemediation : "applied to"
    Vulnerability |o--o{ Remediation : "fixed by"
    DeviceGroup }o--o{ Remediation : "targets"
    User ||--o{ Remediation : "owns"

    %% ── Artifacts (ArtifactWrapper / Artifact hierarchy) ──
    DeviceArtifact |o--o{ ArtifactWrapper : "has"
    Remediation |o--o{ ArtifactWrapper : "has"
    User ||--o{ ArtifactWrapper : "owns"
    ArtifactWrapper ||--o{ Artifact : "versions"
    ArtifactWrapper |o--o| Artifact : "latest"
    Artifact |o--o| Artifact : "version chain"
    User ||--o{ Artifact : "owns"

    %% ── Integrations ──
    User ||--o{ Integration : "configures"
    Apikey |o--o| Integration : "authenticates"
    Integration ||--o{ SyncStatus : "logs"
    User ||--o{ Webhook : "configures"

    %% ── External Mappings ──
    Asset ||--o{ ExternalAssetMapping : "mapped by"
    Integration ||--o{ ExternalAssetMapping : "maps"
    DeviceArtifact ||--o{ ExternalDeviceArtifactMapping : "mapped by"
    Integration ||--o{ ExternalDeviceArtifactMapping : "maps"
    Remediation ||--o{ ExternalRemediationMapping : "mapped by"
    Integration ||--o{ ExternalRemediationMapping : "maps"
    Vulnerability ||--o{ ExternalVulnerabilityMapping : "mapped by"
    Integration ||--o{ ExternalVulnerabilityMapping : "maps"
```

### Domain Legend

| Domain | Models | Purpose |
|---|---|---|
| **Auth** | User, Session, Account, Verification, Apikey | Better Auth identity, sessions, OAuth accounts, and API key access |
| **Workflows** | Workflow, Node, NodeTemplate, Connection | Clinical and security workflow definitions in the node-based editor |
| **Hospital Assets** | Asset, DeviceGroup, DeviceGroupHistory | Medical device inventory grouped by CPE; tracks group membership over time |
| **Vuln Management** | Vulnerability, Issue, Remediation, IssueRemediation | CVE tracking with CVSS/EPSS/KEV scoring; Issues link a vulnerability to a specific asset; remediations can resolve multiple issues |
| **Artifacts** | DeviceArtifact, ArtifactWrapper, Artifact | Versioned file uploads (firmware, emulators, docs) linked to device groups or remediations; version chain via self-referencing FK |
| **Integrations** | Integration, SyncStatus, Webhook | External data provider sync configuration with schedule, auth, and status history; webhooks for outbound event push |
| **External Mappings** | External*Mapping (x4) | Bidirectional ID mapping between Viper entities and external systems; one per resource type for type safety |
