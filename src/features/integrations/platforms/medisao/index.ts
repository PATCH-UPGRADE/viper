import "server-only";
import type { ConnectorModule } from "@/features/integrations/core/types";
import { PlatformEnum } from "@/generated/prisma";
import { advisories } from "./advisories";
import {
  configSchema,
  credentialSchema,
  type MedIsaoConfig,
  type MedIsaoCreds,
} from "./config";
import { remediations } from "./remediations";

/**
 * A channel is one manufacturer and product pair, and both resources are polled
 * per channel. That pairing is why an advisory needs no agent to guess which
 * device it concerns.
 */
export const medisao: ConnectorModule<MedIsaoConfig, MedIsaoCreds> = {
  definition: {
    platform: PlatformEnum.MEDISAO,
    displayName: "MedISAO",
    description:
      "Manufacturer advisories and remediations from the MedISAO channel API.",
    categories: ["Vulnerability Management Platforms", "Notifications"],
    configSchema,
    credentialSchema,
  },
  remediations,
  notifications: advisories,
};
