import { grabSessionCookie } from "../src/features/integrations/teamplay-fleet/capture";
import {
  FLEET,
  FLEET_LOGIN_CONFIG,
} from "../src/features/integrations/teamplay-fleet/config";
import prisma from "../src/lib/db";

const url =
  "https://fleet.siemens-healthineers.com/rest/v1/security-advisories/active";
const host = new URL(url).hostname;

async function main() {
  const userName = process.env.FLEET_ADVISORY_USERNAME;
  const password = process.env.FLEET_ADVISORY_PASSWORD;

  if (!userName || !password) {
    throw new Error(
      "Set FLEET_ADVISORY_USERNAME and FLEET_ADVISORY_PASSWORD -- run with --env-file=.env",
    );
  }

  const session = await grabSessionCookie(
    FLEET_LOGIN_CONFIG,
    userName,
    password,
  );
  const cookiePairs = Object.fromEntries(
    session.value.split("; ").map((pair) => {
      const equal = pair.indexOf("=");
      return [pair.slice(0, equal), pair.slice(equal + 1)];
    }),
  );

  console.log("parsed cookies ", cookiePairs);

  const results = await fetch(
    "https://fleet.siemens-healthineers.com/rest/v1/security-advisories/active",
    {
      headers: { [session.header]: session.value },
    },
  );
  const data = await results.json();
  console.log("data ", data);

  const before = await prisma.integrationSession.findUnique({
    where: { host },
  });
  console.log("before: ", before);
  const res = await FLEET.fetchWithSession(url);
  console.log("status: ", res.status);
  const after = await prisma.integrationSession.findUnique({
    where: { host },
  });
  console.log("after: ", after);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
