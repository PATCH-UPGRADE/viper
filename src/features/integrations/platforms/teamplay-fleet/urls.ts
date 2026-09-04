export const FLEET_HOST = "fleet.siemens-healthineers.com";
export const EQUIPMENTS_URL = `https://${FLEET_HOST}/rest/v1/equipments`;
export const CONTRACTS_URL = `https://${FLEET_HOST}/rest/v1/contracts`;

/**
 * Where a work order is filed. Separate from the activities collection, which
 * only reads.
 */
export const WORK_ORDER_CREATE_URL = `https://${FLEET_HOST}/rest/v1/tickets/create`;

/**
 * Fleet renders its datetimes as naive local values in the offset asked for by
 * the `tz` query parameter.
 */
export const FLEET_TZ_OFFSET = "-05:00";
/**
 * `statusFilter=3` is every status, open and closed.
 */
export const ACTIVITIES_URL = `https://${FLEET_HOST}/rest/v1/activities?tz=${FLEET_TZ_OFFSET}&statusFilter=3`;

/**
 * Fleet exposes each work order as an "activity", keyed by the external id on
 * the ExternalWorkOrderMapping. Fleet sends no link in its payload, so the URL
 * is built from the host and that id.
 */
export const workOrderWebUrl = (externalId: string): string =>
  `https://${FLEET_HOST}/activities/${encodeURIComponent(externalId)}/overview`;

// Security Advisories

export const ADVISORIES_URL = `https://${FLEET_HOST}/rest/v1/security-advisories/active`;

// Fleet's advisory PDFs are served in one language at a time
export const ADVISORIES_LANGUAGE = "en";

// Attachment Metadata - name, type, size, languageCode
export const advisoryAttachmentsUrl = (externalId: string): string =>
  `https://${FLEET_HOST}/rest/v1/security-advisories/attachments?id=${encodeURIComponent(externalId)}&languageCode=${ADVISORIES_LANGUAGE}`;

// Download advisories pdf attachment
export const advisoryAttachmentsDownloadUrl = (
  externalId: string,
  fileType: string,
): string =>
  `https://${FLEET_HOST}/rest/v1/security-advisories/download-url?id=${encodeURIComponent(externalId)}&fileType=${encodeURIComponent(fileType)}&languageCode=${ADVISORIES_LANGUAGE}`;

export const advisoryWebUrl = (externalId: string): string =>
  `https://${FLEET_HOST}/advisories/${encodeURIComponent(externalId)}/overview`;
