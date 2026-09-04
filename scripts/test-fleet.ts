import {
  createFleetSession,
  FLEET_LOGIN_CONFIG,
  grabSessionCookie,
} from "@/features/integrations/platforms/teamplay-fleet/session";
import { PlatformEnum } from "@/generated/prisma";
import prisma from "../src/lib/db";

const ADVISORIES_URL =
  "https://fleet.siemens-healthineers.com/rest/v1/security-advisories/active";

const username = process.env.FLEET_USERNAME ?? "";
const password = process.env.FLEET_PASSWORD ?? "";

async function main() {
  const integration = await prisma.integration.findFirstOrThrow({
    where: { platform: PlatformEnum.FLEET },
  });

  console.log("--- grabSessionCookie ---");
  console.time("login");
  const captured = await grabSessionCookie(
    FLEET_LOGIN_CONFIG,
    username,
    password,
  );
  console.timeEnd("login");

  console.log("header: ", captured.header);
  console.log("expires: ", captured.expiresAt?.toISOString() ?? "");

  // testing after login, first hitting userprofile endpoing, ensure session established
  const profile = await fetch(FLEET_LOGIN_CONFIG.authUrl, {
    headers: { [captured.header]: captured.value },
  });
  console.log(
    "user profile: ",
    profile.status,
    profile.ok ? "authenticated" : "",
  );

  console.log("--- creteFleetSession ---");
  console.log("integration:", integration.id);
  const session = await createFleetSession({ username, password });
  console.time("first advisory request");
  const advisoryFirst = await session.request(ADVISORIES_URL);
  console.timeEnd("first advisory request");
  console.log("first advisory request ", advisoryFirst.status);

  console.time("second advisory request, reuse cookie");
  const advisorySecond = await session.request(ADVISORIES_URL);
  console.timeEnd("second advisory request, reuse cookie");
  console.log("second advisory request, reuse cookie ", advisorySecond.status);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
