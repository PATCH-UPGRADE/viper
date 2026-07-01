# Integration test fixtures

## `blueflow-assets.json` (not committed — fetched at runtime)

This is Blueflow's own seed data, pulled live from their `develop` branch so the
integration test always runs against their current fixture:

    https://raw.githubusercontent.com/virtalabs/blueflow/develop/data/assets.json

- **CI** fetches it automatically (see the "Fetch Blueflow asset fixture" step in
  [`.github/workflows/blueflow-integration.yml`](../../../.github/workflows/blueflow-integration.yml)).
- **Locally**, fetch it before running `npm run test:integration`:

  ```bash
  curl -fsSL https://raw.githubusercontent.com/virtalabs/blueflow/develop/data/assets.json \
    -o tests/integration/fixtures/blueflow-assets.json
  ```

It is `.gitignore`d on purpose — the source of truth lives in the Blueflow repo,
not here. The test derives its expected asset count and hostname sample from
whatever this file contains, so no test changes are needed when it updates.
