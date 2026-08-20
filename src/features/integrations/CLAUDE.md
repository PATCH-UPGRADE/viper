# Integrations

How VIPER connects to outside systems. Read this before adding or changing a platform.

## The one rule

**Adding a platform means adding a directory under `platforms/` and two lines elsewhere.**
Nothing in `core/`, `src/inngest/functions/sync-integrations.ts`, or `server/routers.ts` should
ever branch on which platform it is holding. They reach platforms only through the registry. If
you find yourself writing `if (platform === ...)` outside `platforms/`, the design has been
misunderstood.

## Platform vs Integration

- A **Platform** is *code*: a `ConnectorModule` that handles everything about one kind of
  connection — auth, what it syncs, where its records land. Platforms live in `platforms/<name>/`
  and are named by `PlatformEnum`
- An **Integration** is a *database row* — one instance of a platform, holding that instance's
  settings. `Integration.platform` names the platform module; everything the platform *does*
  lives in the module, not the row.

## Where platform code goes

Everything a platform needs lives in `src/features/integrations/platforms/<platform>/`, as
contained as possible:

```
platforms/<platform>/
├── index.ts       # the ConnectorModule — the only file core imports
├── config.ts      # configSchema + credentialSchema (+ inferred types)
├── sync.ts        # the SyncStrategy
├── on-create.ts   # optional: one-time setup after the row is created
├── session.ts     # optional: this platform's auth helpers
└── urls.ts        # optional: hosts / URL builders
```

Do not scatter platform code into `core/`, into other features, or into a sibling directory.
`core/` is platform-agnostic machinery; a platform is a leaf.

## The ConnectorModule contract

Defined in `core/types.ts`:

```ts
export interface ConnectorModule<TConfig = unknown, TCreds = unknown> {
  definition: ConnectorDefinition<TConfig, TCreds>;  // platform, displayName, configSchema, credentialSchema
  sync: SyncStrategy<TConfig, TCreds>;
  onCreate?(): Promise<void>;
  workOrders?: ResourceModule<unknown, unknown, TConfig>;
  assets?: ResourceModule<unknown, unknown, TConfig>;
  notifications?: ResourceModule<unknown, unknown, TConfig>;
}
```

`sync` owns one `(integration, resource)` attempt end to end and receives a `SyncCtx`:

```ts
interface SyncCtx<TConfig, TCreds> {
  config: TConfig;                    // parsed by your configSchema
  creds: TCreds;                      // decrypted, parsed by your credentialSchema
  resource: ResourceType;
  cursor: Cursor | null;              // whatever you returned last time
  lastSuccessfulSync: Date | null;    // watermark, if you'd rather use one
  callback(): Promise<CallbackConfig>; // mint a one-time upload URL + JSON Schema
}
```

It returns `{ cursor, pending? }`. **Whether you pull or hand off is your business:** a puller
loops and returns the cursor it reached; a pusher fires one request and returns `pending: true`
so the row stays `Pending` until the callback lands.

`onCreate?()` runs once, after the row is created (`server/routers.ts`).

## Resource modules

A **resource module** is the per-resource half of a platform whose protocol *we* speak — where we
call their API directly rather than asking them to push to us.

So for example, to get Work Orders from the teamplay Fleet platform, we write a resource module to
handle this log.


## Registering a new platform

Inside `platforms/<name>/` — write these three:

1. **`config.ts`** — export `configSchema` and `credentialSchema` plus their inferred types. For a
   generic platform, build on `genericConfigSchema` so `resource` is present. Reuse
   `authCredentialSchema` if basic/bearer/header auth is enough.
2. **`sync.ts`** — a `SyncStrategy<TConfig, TCreds>`.
3. **`index.ts`** — the `ConnectorModule`, with `definition.platform` set to your enum member.

`platforms/partner/` is the minimal worked example: a 16-line config and a 49-line sync.

Outside the directory — **two edits**:

1. `prisma/schema.prisma` — add the member to `enum PlatformEnum`, then migrate.
2. `core/registry.ts` — add the import and the `registry` entry.

**Do not touch** for a new platform: the Inngest sync functions, `core/callback.ts`,
`core/sync/cadence.ts`, `server/routers.ts`, or the UI. They are already generic.

Only if you are also introducing a brand-new `ResourceType` do you additionally touch
`integrationsMapping` (`../types.ts`), `MODULE_FIELDS` (`core/sync/resources.ts`), and
`ENVELOPE_SCHEMAS` (`core/callback.ts`) — plus add the matching `integrationUpload` procedure.

## Authentication

**Each platform owns its own auth helpers**, built to be reused by that platform's resource
modules. `core/` deliberately provides only generic storage, not a per-platform auth scheme.

**Storage** (`core/credentials.ts`): AES-256-GCM, laid out as `iv (12) || auth tag (16) ||
ciphertext`, keyed by `CREDENTIAL_ENCRYPTION_KEY` (base64, must decode to exactly 32 bytes —
`openssl rand -base64 32`). `encryptCredentials` / `decryptCredentials` know nothing about
`AuthType` and will encrypt any JSON-serializable blob, so a platform with a credential shape of
its own reuses them unchanged. GCM authenticates, so a bad key is a decryption failure rather than
garbage plaintext.

`credentialSchema` is what a user provides about authentication (i.e, an API key header, username/password)
