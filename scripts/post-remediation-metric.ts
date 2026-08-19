// used for https://github.com/PATCH-UPGRADE/viper-deploy/tree/main/assets/ivv_metrics/remediation_deployment_time
// Pair it with scripts/seed-remediation-metric.ts, which creates the vulnerability this
// remediation resolves.
//
// Env:
//   VIPER_URL             base URL of the Viper app (default http://localhost:3000).
//   VIPER_API_KEY         required — see `just create-viper-api-key`.
//   RDT_VULNERABILITY_ID  required — the id printed by `just seed`.
//
// Talks HTTP only; it never touches Postgres, so it needs no local-database guard.

import type { z } from "zod";
import type { remediationInputSchema } from "@/features/remediations/types";
import { ArtifactType } from "@/generated/prisma";

const VIPER_URL = process.env.VIPER_URL ?? "http://localhost:3000";
const VIPER_API_KEY = process.env.VIPER_API_KEY ?? "";
const VULNERABILITY_ID = process.env.RDT_VULNERABILITY_ID ?? "";

// Typed against the router's own input schema so a schema change breaks this script at
// build time rather than silently at metric time.
type RemediationInput = z.input<typeof remediationInputSchema>;

// The advisory's fix for MAGNETOM NUMARIS X is a vendor-delivered update; VA31A-UD01
// follows the update-package naming SSA-220609 uses for its other products (VJ30C-UD01,
// VB22A-UD03). Distinct from the port-restriction workaround, which is a compensating
// control on an individual scanner rather than a fix.
const REMEDIATION: Omit<RemediationInput, "vulnerabilityId"> = {
  description:
    "MAGNETOM NUMARIS X VA31A-UD01 firmware update — remediates CVE-2022-29875 (SSA-220609)",
  narrative:
    "Siemens Healthineers update package VA31A-UD01 replaces the syngo platform's " +
    "deserialization handler with a type-restricted implementation, closing the " +
    "unauthenticated remote code execution path on ports 32912/tcp and 32914/tcp. " +
    "Installed on site; the scanner is out of clinical service for the duration of " +
    "the update, and a coil and phantom QA run is required before the first patient " +
    "scan. Until the update is installed, restrict inbound access to ports 32912/tcp " +
    "and 32914/tcp to trusted service clients only.",
  artifacts: [
    {
      name: "NUMARIS X VA31A-UD01 firmware update package",
      artifactType: ArtifactType.Firmware,
      downloadUrl:
        "https://www.siemens-healthineers.com/support-documentation/software-updates/numaris-x-va31a-ud01",
    },
  ],
};

function requireEnv(value: string, name: string, remedy: string): string {
  if (!value) {
    console.error(`ERROR: ${name} is not set — ${remedy}`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const apiKey = requireEnv(
    VIPER_API_KEY,
    "VIPER_API_KEY",
    "run 'just create-viper-api-key' first",
  );
  const vulnerabilityId = requireEnv(
    VULNERABILITY_ID,
    "RDT_VULNERABILITY_ID",
    "run 'just seed' first",
  );

  const body: RemediationInput = { ...REMEDIATION, vulnerabilityId };

  // Stamped immediately before the request so container-exec and tsx startup stay out
  // of the submit-to-complete wall clock evaluate.sh reports.
  const submittedAt = Math.floor(Date.now() / 1000);

  let res: Response;
  try {
    res = await fetch(`${VIPER_URL}/api/v1/remediations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error(
      `ERROR: could not reach Viper at ${VIPER_URL} — is the app running?`,
    );
    console.error(err);
    process.exit(1);
  }

  const text = await res.text();
  if (!res.ok) {
    console.error(`ERROR: remediation POST failed (HTTP ${res.status})`);
    console.error(text);
    process.exit(1);
  }

  let remediationId: string | undefined;
  try {
    remediationId = JSON.parse(text)?.remediation?.id;
  } catch {
    console.error("ERROR: remediation POST returned a non-JSON body:");
    console.error(text);
    process.exit(1);
  }

  if (!remediationId) {
    console.error("ERROR: response had no remediation.id:");
    console.error(text);
    process.exit(1);
  }

  console.log(`SUBMITTED_AT=${submittedAt}`);
  console.log(`REMEDIATION_ID=${remediationId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
