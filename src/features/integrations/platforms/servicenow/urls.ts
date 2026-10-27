/** Relative to the instance: the session resolves it against `instanceUrl`. */
export const tableApiPath = (table: string): string =>
  `/api/now/table/${table}`;

export const recordApiUrl = (
  instanceUrl: string,
  table: string,
  sysId: string,
): string =>
  new URL(
    `${tableApiPath(table)}/${encodeURIComponent(sysId)}`,
    instanceUrl,
  ).toString();

export const recordWebUrl = (
  instanceUrl: string,
  table: string,
  sysId: string,
): string =>
  new URL(
    `/${table}.do?sys_id=${encodeURIComponent(sysId)}`,
    instanceUrl,
  ).toString();
