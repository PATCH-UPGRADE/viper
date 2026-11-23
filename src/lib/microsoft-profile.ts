import type { MicrosoftEntraIDProfile } from "better-auth/social-providers";

// The fixed tenant that Microsoft puts in the `tid` claim of every personal
// account token. Better Auth uses the same value but does not export it.
const MICROSOFT_CONSUMER_TENANT_ID = "9188040d-6c67-4c5b-b112-36a304b66dad";

// Entra omits the email claim for a work account without a mail attribute.
// The user principal name stands in for it, but it is mutable and Microsoft
// says not to use it for authorization, so it is never marked verified. An
// unverified email cannot link to an existing user, and a new user gets the
// verification email. Consumer accounts get no fallback.
export const mapMicrosoftProfileToUser = (
  profile: Partial<
    Pick<MicrosoftEntraIDProfile, "email" | "tid" | "preferred_username">
  >,
) => {
  if (profile.email || profile.tid === MICROSOFT_CONSUMER_TENANT_ID) return {};
  const upn = profile.preferred_username;
  if (!upn?.includes("@")) return {};
  return { email: upn };
};
