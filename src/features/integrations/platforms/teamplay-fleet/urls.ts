export const FLEET_HOST = "fleet.siemens-healthineers.com";
export const EQUIPMENTS_URL = `https://${FLEET_HOST}/rest/v1/equipments`;
export const CONTRACTS_URL = `https://${FLEET_HOST}/rest/v1/contracts`;

/**
 * Where a work order is filed. Separate from the activities collection, which
 * only reads.
 */
export const WORK_ORDER_CREATE_URL = `https://${FLEET_HOST}/rest/v1/tickets/create`;
