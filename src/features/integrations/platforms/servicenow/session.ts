import type { Session, SessionInput } from "../../core/types";
import type { ServiceNowConfig, ServiceNowCreds } from "./config";

const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Basic auth needs no login exchange, so this adds the header and a timeout.
 *
 * A request takes a path, resolved against the instance URL. A URL on any other
 * origin is refused, so the credentials only ever go to the instance.
 */
export const createServiceNowSession = ({
  config,
  creds,
}: SessionInput<ServiceNowConfig, ServiceNowCreds>): Session => {
  const instanceOrigin = new URL(config.instanceUrl).origin;
  const authorization = `Basic ${Buffer.from(
    `${creds.username}:${creds.password}`,
  ).toString("base64")}`;

  return {
    async request(path: string, init?: RequestInit): Promise<Response> {
      const url = new URL(path, config.instanceUrl);
      if (url.origin !== instanceOrigin) {
        throw new Error(
          `Refusing to send ServiceNow credentials to ${url.origin}, which is not the instance ${instanceOrigin}`,
        );
      }
      return fetch(url, {
        ...init,
        headers: {
          Accept: "application/json",
          Authorization: authorization,
          ...init?.headers,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    },
  };
};
