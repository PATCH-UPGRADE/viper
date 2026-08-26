# Inngest functions

Durable background work. Each file exports one or more `inngest.createFunction()` handlers; the
client is `src/inngest/client.ts` (app id `viper`).

## Integration syncs: do not edit `sync-integrations.ts` to add a platform

`sync-integrations.ts` is **platform-agnostic on purpose.** It reaches every platform through the
registry — `requirePlatform`, then the platform's own `configSchema`, `credentialSchema`, and
`sync` — and never branches on which platform it is holding.

Adding or changing a platform means editing `src/features/integrations/platforms/<platform>/`,
plus two lines elsewhere (`PlatformEnum` in `prisma/schema.prisma` and the entry in
`core/registry.ts`). **Nothing in this directory.** If you are about to add a
`if (platform === ...)` or a `switch` here, the design has been misunderstood — read
`src/features/integrations/CLAUDE.md` first.

The same goes for how a platform syncs. Pull vs. push is the platform's business, expressed
through its `SyncOutcome`: a puller returns the cursor it reached, a pusher returns
`pending: true` and stays `Pending` until its callback lands. Do not special-case either shape
here.

## Registering a function

A new function must be added to the `functions` array passed to `serve()` in
`src/app/api/inngest/route.ts`, or it will never run. This is the single most common omission.

Run `npm run inngest:dev` (or `npm run dev:all`) for the local dev server.

## Conventions

- **Steps are the retry boundary.** Each `step.run()` is memoized independently, so keep them
  small and idempotent. Only JSON-safe values cross a step boundary — dates come back as strings,
  and secrets should not cross at all
- **Throwing vs. returning.** Throwing lets Inngest retry; `NonRetriableError` stops it. To
  schedule your own retry instead, catch the error and return a result — that is why
  `run-sync-strategy` returns `{ ok: false }` rather than throwing.
