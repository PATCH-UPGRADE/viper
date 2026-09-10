import "server-only";

/** Used when a deployment has not named itself. See `hospitalIdentifier`. */
const DEFAULT_HOSPITAL_IDENTIFIER = "example-hospital";

/**
 * What this deployment calls itself when an outside platform needs a name for
 * the hospital rather than for one member of its staff.
 *
 * VIPER has no HDO record: one deployment is one hospital. So this is a
 * deployment-level fact, and it is the same for every user here on purpose —
 * a partner that receives a per-user value would read three colleagues
 * reporting one problem as three separate organisations.
 *
 * Treat it as permanent once a platform has seen it. Partners derive stable
 * handles from it, so a new value reads as a different hospital and detaches
 * everything sent under the old one.
 */
export const hospitalIdentifier = (): string =>
  process.env.HOSPITAL_IDENTIFIER?.trim() || DEFAULT_HOSPITAL_IDENTIFIER;
