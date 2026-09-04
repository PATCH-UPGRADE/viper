import { z } from "zod";
import type { Session } from "../../core/types";
import { walkPages, withSince } from "./paginate";
import { channelsUrl } from "./urls";

/**
 * A channel is one manufacturer + product pair MedISAO publishes for. A null
 * `product` means the whole manufacturer, which is also how a
 * `DeviceGroupMatching` spells its wildcard.
 */
export const channelSchema = z.object({
  id: z.string(),
  vendor: z.string(),
  product: z.string().nullish(),
  updated_at: z.string(),
});
export type MedIsaoChannel = z.infer<typeof channelSchema>;

/**
 * Every channel this API key can see.
 *
 * Not filtered by `since`: the caller needs the whole list to know which
 * channels to poll, and a channel omitted for being unchanged would go unpolled
 * even though its advisories moved.
 */
export const listChannels = async (
  session: Session,
  apiUrl: string,
): Promise<MedIsaoChannel[]> => {
  const channels: MedIsaoChannel[] = [];
  for await (const page of walkPages(
    session,
    channelsUrl(apiUrl),
    channelSchema,
  )) {
    channels.push(...page);
  }
  return channels;
};

/** Exported for the channel-rename case, where the id holds and the name moves. */
export const channelsChangedSince = async (
  session: Session,
  apiUrl: string,
  since: Date | null,
): Promise<MedIsaoChannel[]> => {
  const channels: MedIsaoChannel[] = [];
  for await (const page of walkPages(
    session,
    withSince(channelsUrl(apiUrl), since),
    channelSchema,
  )) {
    channels.push(...page);
  }
  return channels;
};
