import { PlatformEnum } from "@/generated/prisma";
import prisma from "@/lib/db";
import { SIEMENS_HEALTHINEERS } from "@/lib/manufacturer-catalog";
import { plural } from "@/lib/utils";
import type { SuggestCtx, Suggestion } from "../../core/types";

export async function suggest(ctx: SuggestCtx): Promise<Suggestion | null> {
  if (ctx.integrations.some((i) => i.platform === PlatformEnum.FLEET)) {
    return null;
  }

  // Once the curated row exists, resolveManufacturer maps every alias to it. A row created under an alias before that is not counted.
  const count = await prisma.asset.count({
    where: {
      deviceGroup: {
        is: {
          manufacturer: {
            is: { canonicalName: SIEMENS_HEALTHINEERS.canonicalName },
          },
        },
      },
    },
  });
  if (count === 0) return null;

  const { canonicalDisplayName } = SIEMENS_HEALTHINEERS;
  return {
    reason: `We found ${count} ${canonicalDisplayName} ${plural("asset", count)} on your network, which are handled in teamplay Fleet.`,
  };
}
