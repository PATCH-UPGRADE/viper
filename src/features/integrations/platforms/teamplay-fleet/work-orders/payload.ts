// Client-safe: the approval card and the agent tool both read this shape, so
// nothing server-only may be added.

import { z } from "zod";
import {
  FLEET_OPERATIONAL_STATUSES,
  FLEET_PATIENT_DANGERS,
  FLEET_SUPPORT_TYPES,
} from "./constants";

/**
 * The Fleet-specific half of a work order — the choices only Siemens asks for.
 * VIPER already knows the summary, the description, the category and the
 * window, so none of those appear here.
 *
 * The descriptions are not decoration. This schema is handed to the model as
 * JSON Schema, so they are the only guidance it gets on these fields.
 */
export const fleetWorkOrderPayloadSchema = z.object({
  supportType: z
    .enum(FLEET_SUPPORT_TYPES)
    .default("technical")
    .describe(
      "Which Siemens support queue: 'technical' for device, hardware or firmware service (the usual case), 'application' for the imaging application layer.",
    ),
  operationalStatus: z
    .enum(FLEET_OPERATIONAL_STATUSES)
    .default("partially_operational")
    .describe(
      "The device's CURRENT operational status, sent to Siemens as the ticket severity. Fleet has only two: 'partially_operational' for a device that is working or degraded but still in use (the usual case for a preventive or security update), 'not_operational' only when the device is actually down.",
    ),
  dangerForPatient: z
    .enum(FLEET_PATIENT_DANGERS)
    .default("unknown")
    .describe(
      "Patient-safety risk of the underlying issue: 'yes' if the device could malfunction during care, 'no' when there is clearly no direct risk, 'unknown' when you cannot determine it. NOTE: Siemens does not accept a 'yes' online and requires a phone call, so such a proposal is refused.",
    ),
  overtimeAuthorized: z
    .boolean()
    .default(false)
    .describe(
      "True if the hospital authorizes after-hours service at additional cost. Default false; set true only when the urgency justifies it.",
    ),
});

export type FleetWorkOrderPayload = z.infer<typeof fleetWorkOrderPayloadSchema>;

/**
 * Siemens calls whoever approved the order, so the contact is the accepting
 * user. The user record holds no phone number, so the integration's configured
 * `contactPhone` is the hospital's callback number for VIPER-raised orders.
 */
export function fleetContactFor(
  actor: { name: string; email: string },
  contactPhone: string | undefined,
) {
  const [firstName, ...rest] = actor.name.trim().split(/\s+/);
  return {
    email: actor.email,
    firstName: firstName || "VIPER",
    lastName: rest.join(" ") || "User",
    phone: contactPhone ?? "",
  };
}
