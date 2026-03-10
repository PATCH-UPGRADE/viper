export const UNKNOWN_ASSET_ROLE_STRING = "Unknown Asset";

export function getAssetRoleLabel(asset: { role: string | null }): string {
  return asset.role ?? UNKNOWN_ASSET_ROLE_STRING;
}
