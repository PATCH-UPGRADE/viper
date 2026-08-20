# Legacy — this directory is being removed

This directory predates the platform-module architecture. It is being ported into
`src/features/integrations/platforms/teamplay-fleet/`, and should be **deleted once the port is
complete**.

**Do not add code here, and do not treat it as an example.** See
`src/features/integrations/CLAUDE.md` for how platforms are actually structured — everything a
platform needs belongs in `platforms/<platform>/`.

## State of the port

Still imported from outside, so these cannot simply be deleted yet:

| File | Imported by |
|---|---|
| `constants.ts` | `features/chat/types.ts`, `features/agents/tools/registry.ts`, `features/tracking/server/routers.ts` |
| `tracking.ts` | `features/agents/tools/registry.ts`, `features/tracking/server/routers.ts` (+ its test) |
| `urls.ts` | `features/tracking/components/ticket-detail/overview-card.tsx` |

Already dead, and safe to remove now:

- `config.ts` — self-declares `// TODO this file should be deleted.` and imports `./capture`,
  which was removed in fb81e09. This is a live `tsc` error.
- `activities.ts` — no importers outside this directory.

Known duplication to resolve while porting: `FLEET_LOGIN_CONFIG` exists verbatim in both
`config.ts` here and `platforms/teamplay-fleet/session.ts`. The one in `platforms/` is the live
copy.

Also note `tracking.ts`'s `createFleetWorkOrder` claims in a comment that auth "is handled by the
shared FLEET session client", but the code is a bare `fetch` with no credentials. Port it onto
`createFleetSession` rather than carrying the comment across.
