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
├── sync.ts        # the SyncStrategy — only for a platform with no resource modules
├── on-create.ts   # optional: one-time setup after the row is created
├── session.ts     # optional: this platform's auth helpers
└── urls.ts        # optional: hosts / URL builders
```

**A platform whose protocol we speak has no root `sync.ts`.** Each resource gets a directory
that owns its own sync, and the root holds only what every resource shares:

```
platforms/teamplay-fleet/
├── index.ts                    # the ConnectorModule — no `sync`, just `assets`
├── config.ts
├── session.ts                  # shared: every resource logs in the same way
├── on-create.ts
├── urls.ts
└── assets/
    ├── index.ts                # the ResourceModule
    ├── sync.ts                 # how assets sync, end to end
```

`index.ts` and `sync.ts` name each other, so nothing they *share* can live in either: put the
schemas, canonical types and pull helpers in a third leaf module and have both import from it.

Anything only one resource needs belongs in that resource's directory, not the root. Adding
work orders should mean adding `work-orders/`, not editing anything under `assets/`.

Do not scatter platform code into `core/`, into other features, or into a sibling directory.
`core/` is platform-agnostic machinery; a platform is a leaf.

## The ConnectorModule contract

Defined in `core/types.ts`:

```ts
export interface ConnectorModule<TConfig = unknown, TCreds = unknown> {
  definition: ConnectorDefinition<TConfig, TCreds>;  // platform, displayName, configSchema, credentialSchema
  sync?: SyncStrategy<TConfig, TCreds>;
  onCreate?(): Promise<void>;
  workOrders?: ResourceModule<unknown, unknown, TConfig, TCreds>;
  assets?: ResourceModule<unknown, unknown, TConfig, TCreds>;
  notifications?: ResourceModule<unknown, unknown, TConfig, TCreds>;
}
```

**A platform must supply either `sync` or at least one resource module.** Those are the two
ways to sync, and which one you pick follows from whose protocol is being spoken.

Core dispatches per attempt: the resource module that owns this resource, else the platform's
`sync`, else the attempt is recorded as `Error` — a platform with neither is a registration bug,
and saying so beats a resource that looks perpetually up to date. **Nothing branches on which
platform it is**, only on what the module declares.

A platform-level `sync` owns one `(integration, resource)` attempt end to end and receives a
`SyncCtx`. A resource module's `sync` gets the same thing minus `resource` — it already knows
which one it is:

```ts
interface ResourceSyncCtx<TConfig, TCreds> {
  integrationId: string;
  config: TConfig;                    // parsed by your configSchema
  creds: TCreds;                      // decrypted, parsed by your credentialSchema
  cursor: Cursor | null;              // whatever you returned last time
  lastSuccessfulSync: Date | null;    // watermark, if you'd rather use one
  callback(): Promise<CallbackConfig>; // mint a one-time upload URL + JSON Schema
}

interface SyncCtx<TConfig, TCreds> extends ResourceSyncCtx<TConfig, TCreds> {
  resource: ResourceType;
}
```

Either returns `{ cursor, pending? }`. **Whether you pull or hand off is your business:** a
puller loops and returns the cursor it reached; a pusher fires one request and returns
`pending: true` so the row stays `Pending` until the callback lands.

`onCreate?()` runs once, after the row is created (`server/routers.ts`).

## Resource modules

A **resource module** is the per-resource half of a platform whose protocol *we* speak — where we
call their API directly rather than asking them to push to us. One module per resource, each in
its own directory, each syncing itself.

```ts
export interface ResourceModule<TCanonical, TRaw, TConfig, TCreds>
  extends UrlBuilders<TConfig> {
  sync(ctx: ResourceSyncCtx<TConfig, TCreds>): Promise<SyncOutcome>;

  // we pull from their platform
  listChanged?(session: Session, cursor: Cursor | null): AsyncIterable<Page<TRaw>>;
  get?(session: Session, externalId: string): Promise<TRaw>;
  toCanonical?(raw: TRaw, config: TConfig): TCanonical;

  // we push to their platform
  create?(session: Session, draft: TCanonical): Promise<{ externalId: string; raw: TRaw }>;
  update?(session: Session, externalId: string, patch: Partial<TCanonical>): Promise<...>;

  defaultSyncEvery: number | null;
}
```

**`sync` is the contract; everything else is optional.** Declaring a resource module means that
module knows how to sync itself — the pull and push helpers are the pieces a `sync` is usually
built out of, not obligations. A resource we only ever write to needs none of them.


## Registering a new platform

Inside `platforms/<name>/` — write these three:

1. **`config.ts`** — export `configSchema` and `credentialSchema` plus their inferred types. For a
   generic platform, build on `genericConfigSchema` so `resource` is present. Reuse
   `authCredentialSchema` if basic/bearer/header auth is enough.
2. **The sync**, in whichever of the two shapes fits:
   - *They push to us* → `sync.ts` at the root, a `SyncStrategy<TConfig, TCreds>`, and no
     resource modules.
   - *We call their API* → a directory per resource, each with an `index.ts` exporting its
     `ResourceModule` and a `sync.ts` exporting that module's sync. No root `sync.ts`.
3. **`index.ts`** — the `ConnectorModule`, with `definition.platform` set to your enum member,
   and either `sync` or your resource modules wired in.

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
