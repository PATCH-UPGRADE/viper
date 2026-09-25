import type { AnyConnectorModule, Session, SessionInput } from "./types";

/**
 * The one place core gets a platform session. Modules receive it and never
 * sign in by themselves.
 */
export const openSession = (
  connector: AnyConnectorModule,
  input: SessionInput,
): Session => {
  if (!connector.createSession) {
    throw new Error(
      `${connector.definition.platform} has resource modules but no createSession.`,
    );
  }
  return connector.createSession(input);
};
