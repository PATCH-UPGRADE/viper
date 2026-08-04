// Opaque per-request entity refs shown to the model instead of database ids,
// so real ids can never appear in agent-written prose.

export type EntityRefs = {
  vulnerabilityRefs: string[];
  remediationRefs: string[];
  deviceGroupMatchingRefs: string[];
  /** Assets are never linkable by the agent; they are here only so their ids get swapped out too. */
  assetRefs: string[];
  /** ref -> database id */
  idByRef: Record<string, string>;
  /** database id -> ref */
  refById: Record<string, string>;
};

export function buildEntityRefs(ids: {
  vulnerabilityIds: string[];
  remediationIds: string[];
  deviceGroupMatchingIds: string[];
  assetIds?: string[];
  /** Vulnerability ids that appear in the context (e.g. a remediation's target) but are not offered for linking. */
  swapOnlyVulnerabilityIds?: string[];
}): EntityRefs {
  const idByRef: Record<string, string> = {};
  const refById: Record<string, string> = {};
  const counters: Record<string, number> = {};
  const assign = (list: string[], prefix: string) =>
    list.flatMap((id) => {
      if (refById[id]) return [];
      counters[prefix] = (counters[prefix] ?? 0) + 1;
      const ref = `${prefix}-${counters[prefix]}`;
      idByRef[ref] = id;
      refById[id] = ref;
      return [ref];
    });
  const refs = {
    vulnerabilityRefs: assign(ids.vulnerabilityIds, "vuln"),
    remediationRefs: assign(ids.remediationIds, "rem"),
    deviceGroupMatchingRefs: assign(ids.deviceGroupMatchingIds, "group"),
    assetRefs: assign(ids.assetIds ?? [], "asset"),
    idByRef,
    refById,
  };
  assign(ids.swapOnlyVulnerabilityIds ?? [], "vuln");
  return refs;
}

export function swapIdsForRefs(markdown: string, refs: EntityRefs): string {
  let out = markdown;
  for (const [id, ref] of Object.entries(refs.refById)) {
    out = out.replaceAll(id, ref);
  }
  return out;
}
