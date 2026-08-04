// Opaque per-request entity refs shown to the model instead of database ids,
// so real ids can never appear in agent-written prose (PR #200 review).

export type EntityRefs = {
  vulnerabilityRefs: string[];
  remediationRefs: string[];
  deviceGroupMatchingRefs: string[];
  /** ref -> database id */
  idByRef: Record<string, string>;
  /** database id -> ref */
  refById: Record<string, string>;
};

export function buildEntityRefs(ids: {
  vulnerabilityIds: string[];
  remediationIds: string[];
  deviceGroupMatchingIds: string[];
}): EntityRefs {
  const idByRef: Record<string, string> = {};
  const refById: Record<string, string> = {};
  const assign = (list: string[], prefix: string) =>
    list.map((id, i) => {
      const ref = `${prefix}-${i + 1}`;
      idByRef[ref] = id;
      refById[id] = ref;
      return ref;
    });
  return {
    vulnerabilityRefs: assign(ids.vulnerabilityIds, "vuln"),
    remediationRefs: assign(ids.remediationIds, "rem"),
    deviceGroupMatchingRefs: assign(ids.deviceGroupMatchingIds, "group"),
    idByRef,
    refById,
  };
}

export function swapIdsForRefs(markdown: string, refs: EntityRefs): string {
  let out = markdown;
  for (const [id, ref] of Object.entries(refs.refById)) {
    out = out.replaceAll(id, ref);
  }
  return out;
}
