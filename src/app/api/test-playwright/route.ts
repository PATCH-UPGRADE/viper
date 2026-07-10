import { NextResponse } from "next/server";
import {
  FLEET_LOGIN_CONFIG,
  grabSessionCookie,
} from "@/lib/vendor-session-capture";

export const maxDuration = 60;

export async function GET() {
  try {
    const userName = process.env.FLEET_ADVISORY_USERNAME;
    const password = process.env.FLEET_ADVISORY_PASSWORD;

    if (!userName || !password) {
      return NextResponse.json(
        { ok: false, error: "env vars not set" },
        { status: 500 },
      );
    }
    const session = await grabSessionCookie(
      FLEET_LOGIN_CONFIG,
      userName,
      password,
    );
    console.log("session ", session);
    return NextResponse.json({ ok: true, cookieLength: session.value.length });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
