import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function GET() {
  try {
    const { grabSessionCookie, FLEET_LOGIN_CONFIG } = await import(
      "@/lib/vendor-session-capture"
    );
    const { default: prisma } = await import("@/lib/db");

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

    const res = await fetch(
      "https://fleet.siemens-healthineers.com/rest/v1/security-advisories/active",
      {
        headers: { [session.header]: session.value },
      },
    );
    const data = await res.json();

    const notification = await prisma.notification.create({
      data: {
        type: "Advisory",
        title: "Fleet Security Advisories (test2)",
        summary: JSON.stringify(data, null, 2),
        sources: {
          create: {
            channel: "PolledApi",
            externalId: `fleet-test-${Date.now()}`,
            raw: data,
            markdown: JSON.stringify(data, null, 2),
          },
        },
      },
    });

    return NextResponse.json({ ok: true, notificationId: notification.id });
  } catch (err) {
    console.error("[test-playwright] FAILED:", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : String(err),
      },
      { status: 500 },
    );
  }
}
