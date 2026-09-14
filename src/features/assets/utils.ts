export const UNKNOWN_ASSET_ROLE_STRING = "Unknown Asset";

export function getAssetRoleLabel(asset: { role: string | null }): string {
  return asset.role ?? UNKNOWN_ASSET_ROLE_STRING;
}

export const assetNameSelect = {
  id: true,
  hostname: true,
  ip: true,
  serialNumber: true,
  role: true,
} as const;

export type AssetNameSource = {
  id: string;
  hostname?: string | null;
  ip?: string | null;
  serialNumber?: string | null;
  role?: string | null;
};

export function getAssetDisplayName(asset: AssetNameSource): string {
  const candidateNames = [
    asset.hostname,
    asset.ip,
    asset.serialNumber,
    asset.role,
  ];
  const firstPresentName = candidateNames.find((name) => name?.trim());
  return firstPresentName ?? asset.id;
}
