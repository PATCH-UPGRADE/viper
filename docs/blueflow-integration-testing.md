# Cross-Service Integration Testing: VIPER ↔ Blueflow

Automated CI/CD pipeline that builds VIPER, pulls Blueflow's published image,
runs both together, and verifies they communicate over each other's APIs — the
real signal being that assets loaded into Blueflow arrive in VIPER via Blueflow's
webhook push.

## The flow

```text
 blueflow-db ← Blueflow (virtalabsinc/blueflow:latest, Docker Hub, :8000)
                 1. entrypoint auto-runs `manage.py migrate`
                 2. create_assets → assets inserted into Blueflow's DB
                 3. test POSTs /api/viper/webhook/ {callback, since, page_size} → 202
                 4. Celery (EAGER) POSTs asset page(s) to `callback`
                          │  {items:[{ip,upstreamApi,vendorId,hostname,...}], page,...}
                          ▼
 viper-db    ← VIPER  POST /api/v1/assets/integrationUpload/<token>
                 5. upserts assets; test GET /api/v1/assets confirms they landed
```

The Blueflow webhook envelope maps **1:1** onto VIPER's `integrationUpload`
input, so no VIPER code changes are required.

## Pieces

| File | Role |
| --- | --- |
| [`.github/workflows/blueflow-integration.yml`](../.github/workflows/blueflow-integration.yml) | Pipeline: build VIPER → pull Blueflow → up → create_assets → mint tokens → test → teardown |
| [`docker/ci/compose.blueflow.yml`](../docker/ci/compose.blueflow.yml) | `postgres` + `viper` + `inngest` + `blueflow-db` + `blueflow` on one network |
| [`.env.ci`](../.env.ci) | CI-safe, non-secret env for the VIPER container |
| [`tests/integration/fixtures/README.md`](../tests/integration/fixtures/README.md) | Blueflow's `data/assets.json` — **fetched from their `develop` branch at runtime**, not committed |
| [`scripts/create-blueflow-integration.ts`](../scripts/create-blueflow-integration.ts) | Mints a VIPER PARTNER/Asset integration token (`npm run db:create-blueflow-integration`) |
| [`tests/integration/blueflow.integration.test.ts`](../tests/integration/blueflow.integration.test.ts) | Registers the webhook and asserts the round-trip (`npm run test:integration`) |

## Gotchas baked into the design

- **Blueflow is on Docker Hub, public** (`virtalabsinc/blueflow:latest`) — no
  registry auth needed.
- **The fixture is Blueflow's own `data/assets.json`, fetched live from their
  `develop` branch each run** (not committed — see
  [`tests/integration/fixtures/README.md`](../tests/integration/fixtures/README.md)).
  Override the source with the `blueflow_fixture_url` workflow input or
  `vars.BLUEFLOW_FIXTURE_URL` (e.g. to pin a commit).
- **We seed with Blueflow's own `create_assets` command**, feeding it the
  fetched `data/assets.json`. Both come from the same Blueflow repo, so a load
  failure indicates a Blueflow-side incompatibility between the command and the
  fixture (input format or `Asset` model schema). The load step is advisory (see
  below), so such a failure never blocks a merge.
- **Advisory check on every PR.** The workflow runs on all pull requests but is
  non-blocking: the job is `continue-on-error`, and the fragile steps (load,
  tests) are too, so a red result never blocks a merge. The real per-step outcome
  still shows in the run and in the PR step summary. (For a fully clean setup,
  don't add this job to branch protection's required checks.)
- **The integration token is one-time.** `processIntegrationToken` consumes
  (deletes) it on first use, and Blueflow POSTs **once per page** — so the test
  registers a **single page** (`page_size` ≥ asset count). Multiple pages would
  fail after page 1.
- **`CELERY_TASK_ALWAYS_EAGER=true`** makes Blueflow's webhook push fire inline
  during the registration request — no Redis/worker needed. The test still polls
  VIPER briefly to be safe.
- **`since` filter is on `modified`.** The fixture sets `modified` in 2026 and
  the test registers with `since=1800-01-01` so all assets are included.

## Run locally

```bash
export VIPER_IMAGE=viper:ci   # or an existing image, e.g. ghcr.io/patch-upgrade/viper:latest
CF=(--env-file .env.ci -f docker/ci/compose.blueflow.yml)

docker compose "${CF[@]}" up -d --build        # bring up both stacks
npx wait-on -t 180000 http://localhost:3000/api/inngest tcp:localhost:8000

# fetch Blueflow's fixture from develop (not committed)
curl -fsSL https://raw.githubusercontent.com/virtalabs/blueflow/develop/data/assets.json \
  -o tests/integration/fixtures/blueflow-assets.json

# seed Blueflow via its own create_assets command (see "Gotchas" for the
# create_assets/data-format relationship)
docker compose "${CF[@]}" cp tests/integration/fixtures/blueflow-assets.json blueflow:/tmp/assets.json
docker compose "${CF[@]}" exec -T blueflow /app/.venv/bin/python project/manage.py create_assets --filepath /tmp/assets.json

# mint VIPER credentials
KEY="$(docker compose "${CF[@]}" exec -T viper npm run db:create-test-api-key --silent | grep '^API_KEY=' | cut -d= -f2-)"
TOKEN="$(docker compose "${CF[@]}" exec -T viper npm run db:create-blueflow-integration --silent | grep '^INTEGRATION_TOKEN=' | cut -d= -f2-)"

# run the round-trip
VIPER_API_URL=http://localhost:3000/api/v1 \
BLUEFLOW_URL=http://localhost:8000 \
VIPER_API_KEY="$KEY" \
VIPER_CALLBACK_URL="http://viper:3000/api/v1/assets/integrationUpload/$TOKEN" \
  npm run test:integration

docker compose "${CF[@]}" down -v
```

> Note: when running locally against a **prebuilt** VIPER image that predates
> `scripts/create-blueflow-integration.ts`, copy it in first:
> `docker compose "${CF[@]}" cp scripts/create-blueflow-integration.ts viper:/srv/scripts/create-blueflow-integration.ts`.
> In CI this is never needed — VIPER is built fresh from the repo.

## Pinning the Blueflow image

Blueflow is public on Docker Hub, so no auth is needed. To pin a specific tag,
set the `blueflow_image` workflow input or the `vars.BLUEFLOW_IMAGE` repo
variable (defaults to `virtalabsinc/blueflow:latest`).
