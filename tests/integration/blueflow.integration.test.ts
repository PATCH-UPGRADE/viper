/**
 * Cross-service integration test: VIPER <-> Blueflow.
 *
 * The workflow loads assets into Blueflow (create_assets) and mints a VIPER
 * integration token BEFORE this suite runs; this suite registers the Blueflow
 * webhook and asserts the assets arrive in VIPER.
 *
 * The fixture (tests/integration/fixtures/blueflow-assets.json) is Blueflow's
 * own data/assets.json, fetched at runtime (see the fixtures README), so this
 * test runs against their real seed data. Expected asset count + a hostname
 * sample are derived from the fixture, so updating it needs no test changes.
 *
 * Env (all set by the CI workflow; sensible localhost defaults for manual runs):
 *   VIPER_API_URL       default http://localhost:3000/api/v1
 *   VIPER_API_KEY       24h key from scripts/create-test-api-key.ts (required)
 *   BLUEFLOW_URL        default http://localhost:8000
 *   VIPER_CALLBACK_URL  in-network URL Blueflow POSTs assets to, e.g.
 *                       http://viper:3000/api/v1/assets/integrationUpload/<token>
 *                       (required for the round-trip; token from
 *                       scripts/create-blueflow-integration.ts)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const VIPER_API_URL =
  process.env.VIPER_API_URL ?? "http://localhost:3000/api/v1";
const VIPER_API_KEY = process.env.VIPER_API_KEY ?? "";
const BLUEFLOW_URL = process.env.BLUEFLOW_URL ?? "http://localhost:8000";
const VIPER_CALLBACK_URL = process.env.VIPER_CALLBACK_URL ?? "";

const authHeaders = { Authorization: `Bearer ${VIPER_API_KEY}` };

// Derive expectations from the Blueflow fixture itself, so updating the file
// needs no test edits. The fixture is not committed -- it's fetched from
// Blueflow's develop branch at runtime (see tests/integration/fixtures/README.md).
// If it's absent, the round-trip skips.
type Fixture = Array<{ fields?: { hostname?: string } }>;
let fixture: Fixture | null = null;
try {
  fixture = JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL("./fixtures/blueflow-assets.json", import.meta.url),
      ),
      "utf8",
    ),
  ) as Fixture;
} catch {
  fixture = null;
}
const EXPECTED_ASSET_COUNT = fixture?.length ?? 0;
const SAMPLE_HOSTNAMES = fixture
  ? ([...new Set(fixture.map((r) => r.fields?.hostname).filter(Boolean))].slice(
      0,
      5,
    ) as string[])
  : [];
const canRoundTrip = Boolean(VIPER_CALLBACK_URL && fixture);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getAssetsPage(page: number, pageSize: number) {
  const res = await fetch(
    `${VIPER_API_URL}/assets?page=${page}&pageSize=${pageSize}`,
    { headers: authHeaders },
  );
  expect(res.status).toBe(200);
  return (await res.json()) as {
    items: Array<{ hostname?: string }>;
    totalCount: number;
    totalPages: number;
  };
}

async function getAssetCount(): Promise<number> {
  return (await getAssetsPage(1, 1)).totalCount;
}

async function collectAllHostnames(): Promise<Set<string>> {
  const first = await getAssetsPage(1, 100);
  const hostnames = new Set<string>();
  const add = (items: Array<{ hostname?: string }>) => {
    for (const a of items) if (a.hostname) hostnames.add(a.hostname);
  };
  add(first.items);
  for (let page = 2; page <= first.totalPages; page++) {
    add((await getAssetsPage(page, 100)).items);
  }
  return hostnames;
}

beforeAll(() => {
  if (!VIPER_API_KEY) {
    throw new Error(
      "VIPER_API_KEY is required. Mint one with `npm run db:create-test-api-key`.",
    );
  }
});

// --- Direction 1: the other service -> VIPER --------------------------------
describe("Blueflow -> VIPER API auth", () => {
  it("rejects unauthenticated requests (401)", async () => {
    const res = await fetch(`${VIPER_API_URL}/assets`);
    expect(res.status).toBe(401);
  });

  it("accepts authenticated requests with a valid API key", async () => {
    const res = await fetch(`${VIPER_API_URL}/assets?page=1&pageSize=5`, {
      headers: authHeaders,
    });
    expect(res.status).toBe(200);
  });
});

// --- Direction 2: VIPER -> the other service --------------------------------
describe("VIPER -> Blueflow API", () => {
  it("can reach Blueflow's webhook endpoint over the network", async () => {
    // The webhook endpoint is POST-only; a GET proves routing/serving is up.
    const res = await fetch(`${BLUEFLOW_URL}/api/viper/webhook/`);
    expect(res.status).toBe(405);
  });
});

// --- Full round trip: register webhook -> assets land in VIPER --------------
describe("round trip: Blueflow webhook push -> VIPER ingest", () => {
  it.runIf(canRoundTrip)(
    "registers the webhook and VIPER receives the pushed assets",
    async () => {
      const before = await getAssetCount();

      // Single page (page_size >= asset count): the integration token is
      // one-time and Blueflow POSTs once per page.
      const register = await fetch(`${BLUEFLOW_URL}/api/viper/webhook/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callback: VIPER_CALLBACK_URL,
          since: "1800-01-01T00:00:00Z",
          max_pages: 5,
          page_size: EXPECTED_ASSET_COUNT + 100,
        }),
      });
      expect(register.status).toBe(202);
      const { request_id } = (await register.json()) as { request_id: string };
      expect(request_id).toBeTruthy();

      // With CELERY_TASK_ALWAYS_EAGER the push fires inline, but poll to be safe.
      let received = 0;
      for (let attempt = 0; attempt < 30; attempt++) {
        received = (await getAssetCount()) - before;
        if (received >= EXPECTED_ASSET_COUNT) break;
        await sleep(1000);
      }
      expect(received).toBeGreaterThanOrEqual(EXPECTED_ASSET_COUNT);

      // Spot-check specific assets made it across (not just the count).
      const hostnames = await collectAllHostnames();
      for (const hostname of SAMPLE_HOSTNAMES) {
        expect(hostnames, `VIPER missing asset ${hostname}`).toContain(
          hostname,
        );
      }
    },
  );

  it.skipIf(canRoundTrip)(
    "round trip skipped: needs VIPER_CALLBACK_URL (integration token) and the fetched Blueflow fixture",
    () => {},
  );
});
