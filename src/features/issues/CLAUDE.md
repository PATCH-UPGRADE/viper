# Issues — how they apply to assets

An `Issue` is a VEX verdict ("is this vulnerability a problem for this
target?") on exactly one vulnerability. It targets one of two things:

- `deviceGroupMatchingId` set, `assetId` null — a **matching-level** issue:
  the verdict for every asset whose device group the matching rule covers.
- `assetId` set, `deviceGroupMatchingId` null — an **asset-level** issue:
  overrides the matching-level issue for that vulnerability, for that asset
  only.

"Exactly one of the two is set — never both, never neither" is a code
convention, not a database constraint: both columns are nullable and nothing
in Postgres enforces the rule.

## Which issues affect an asset

An issue affects an asset when either:

1. it is asset-level and points at the asset, or
2. it is matching-level and its matching applies to the asset's device group
   (`matchingAppliesToDeviceGroup` — strict version matching: an
   unknown-version device group does NOT match version-constrained rules),
   and no asset-level issue for the same vulnerability exists on that asset.

When both exist for one (asset, vulnerability) pair, the asset-level issue
wins. Multiple matching-level issues for the same vulnerability collapse to
the most severe status (AFFECTED > UNDER_INVESTIGATION > NOT_AFFECTED >
FIXED).

The asset-to-matching hop is computed, never stored: there is no foreign key
between `DeviceGroup` and `DeviceGroupMatching`, and version-range (VERS)
checks only run in JavaScript. All reads of "issues affecting an asset" must
go through `resolveEffectiveIssuesByAsset`
(`src/features/issues/server/effective-issues.ts`) — it is the single seam
to replace if this ever needs a denormalized fast path.

## Where issue rows come from

- Matching-level issues are created only by the Prisma client extension on
  `vulnerability.create` (`src/lib/prisma-client-extensions.ts`) — one per
  matching linked in that create call. Linking a matching to an existing
  vulnerability later creates nothing.
- Asset-level issues are created only by the VEX agent
  (`src/features/inbox/agent/vex/process_output.ts`), as upserts on the
  `(assetId, vulnerabilityId)` unique.

Updating a status (UI dropdown, `issues.updateStatus`) edits the row it is
given: editing a matching-level issue changes the verdict for the whole
fleet, not one asset.
