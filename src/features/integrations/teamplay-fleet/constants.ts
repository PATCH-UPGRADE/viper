// Client-safe Fleet constants (no server-only imports) — shared by the outbound
// work-order client, the agent tool schema, and the chat proposal card.

/**
 * The device's current operational status, which Fleet uses as the ticket
 * severity (problemSeverityID) — LOWER is worse. Fleet only offers two: "1" =
 * System Not Operational, "2" = System Partially Operational (there is no
 * "fully operational" — you only open a Fleet ticket for an impaired system).
 * So a working device that merely needs a preventive/security update is filed as
 * "partially_operational", the least-severe fileable state.
 */
export const FLEET_OPERATIONAL_STATUSES = [
  "partially_operational",
  "not_operational",
] as const;
export type FleetOperationalStatus =
  (typeof FLEET_OPERATIONAL_STATUSES)[number];

/**
 * Fleet support-ticket type (typeID). Confirmed legend: "11" = Technical Support
 * (device/hardware service), "12" = Application Support (software layer).
 */
export const FLEET_SUPPORT_TYPES = ["technical", "application"] as const;
export type FleetSupportType = (typeof FLEET_SUPPORT_TYPES)[number];

/**
 * Patient-danger assessment. Fleet's dangerForPatient is three-state — real
 * payloads show "N" and "U", so it is NOT a boolean — mapped yes→Y, no→N,
 * unknown→U. "unknown" is the honest default when the agent can't determine the
 * risk. NOTE: Fleet does not accept an ONLINE ticket when this is "yes" — it
 * requires the customer to phone Siemens — so the accept flow blocks submission
 * and tells the user to call instead.
 */
export const FLEET_PATIENT_DANGERS = ["yes", "no", "unknown"] as const;
export type FleetPatientDanger = (typeof FLEET_PATIENT_DANGERS)[number];
