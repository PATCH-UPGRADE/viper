/**
 * MedISAO sends one string for both an exact version and a range, so a caller
 * cannot tell which column it belongs in. `DeviceGroupMatching` keeps them
 * apart: `versionId` is an exact version, `versionRange` is a VERS expression.
 */
export const splitVersion = (
  value: string | null | undefined,
): { version: string | null; versionRange: string | null } => {
  const trimmed = value?.trim();
  if (!trimmed) return { version: null, versionRange: null };
  if (trimmed.startsWith("vers:") || trimmed === "*") {
    return { version: null, versionRange: trimmed };
  }
  return { version: trimmed, versionRange: null };
};
