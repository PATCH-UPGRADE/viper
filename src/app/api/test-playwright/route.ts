import { NextResponse } from "next/server";
import {
  FLEET_LOGIN_CONFIG,
  grabSessionCookie,
} from "@/lib/vendor-session-capture";

export const maxDuration = 60;

export async function GET() {
  const envCheck = {
    userName: !!process.env.FLEET_ADVISORY_USERNAME,
    password: !!process.env.FLEET_ADVISORY_PASSWORD,
    userNameLength: process.env.FLEET_ADVISORY_USERNAME?.length ?? 0,
    matchingKeys: Object.keys(process.env).filter((k) =>
      k.toUpperCase().includes("FLEET"),
    ),
  };
  console.log("TEST PLAYWRIGHT ", envCheck);
  if (
    !process.env.FLEET_ADVISORY_USERNAME ||
    !process.env.FLEET_ADVISORY_PASSWORD
  ) {
    return NextResponse.json(
      { ok: false, error: "env vars not set" },
      { status: 500 },
    );
  }
  try {
    const session = await grabSessionCookie(
      FLEET_LOGIN_CONFIG,
      process.env.FLEET_ADVISORY_USERNAME,
      process.env.FLEET_ADVISORY_PASSWORD,
    );

    return NextResponse.json({
      ok: true,
      cookieLength: session.value.length,
      session: session,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
