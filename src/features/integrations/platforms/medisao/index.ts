import "server-only";
import type { ConnectorModule } from "@/features/integrations/core/types";
import { PlatformEnum } from "@/generated/prisma";
import {
  configSchema,
  credentialSchema,
  type MedIsaoConfig,
  type MedIsaoCreds,
} from "./config";
import { remediations } from "./remediations";

/**
 * A channel is one manufacturer and product pair. Advisories arrive on the same
 * channels and are not wired up yet.
 */
export const medisao: ConnectorModule<MedIsaoConfig, MedIsaoCreds> = {
  definition: {
    platform: PlatformEnum.MEDISAO,
    displayName: "MedISAO",
    description:
      "Manufacturer advisories and remediations from the MedISAO channel API.",
    categories: ["Vulnerability Management Platforms"],
    configSchema,
    credentialSchema,
  },
  remediations,
};
