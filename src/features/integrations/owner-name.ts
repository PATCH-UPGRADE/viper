/** The name shown for a row whose integration was deleted, along with its mapping. */
const DELETED_INTEGRATION_NAME = "Deleted integration";

/** Who a row came from: the user who owns it, or else the integration that created it. */
export function ownerName(
  owner: { name: string } | null,
  mappings: readonly { integration: { name: string } }[],
): string {
  return (
    owner?.name ?? mappings[0]?.integration.name ?? DELETED_INTEGRATION_NAME
  );
}
