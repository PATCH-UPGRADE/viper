/** Every MedISAO channel endpoint hangs off this prefix. */
const API_PATH = "/api/public/v1";

// The stored apiUrl is operator-supplied, so a trailing slash is likely and
// would produce a double slash that the server 404s on.
const root = (apiUrl: string) => `${apiUrl.replace(/\/+$/, "")}${API_PATH}`;

export const channelsUrl = (apiUrl: string) => `${root(apiUrl)}/channels`;

export const channelRemediationsUrl = (apiUrl: string, channelId: string) =>
  `${channelsUrl(apiUrl)}/${encodeURIComponent(channelId)}/remediations`;

export const channelAdvisoriesUrl = (apiUrl: string, channelId: string) =>
  `${channelsUrl(apiUrl)}/${encodeURIComponent(channelId)}/advisories`;

export const remediationCommentsUrl = (apiUrl: string, externalId: string) =>
  `${root(apiUrl)}/remediations/${encodeURIComponent(externalId)}/comments`;

export const remediationInquiriesUrl = (apiUrl: string, externalId: string) =>
  `${root(apiUrl)}/remediations/${encodeURIComponent(externalId)}/inquiries`;
