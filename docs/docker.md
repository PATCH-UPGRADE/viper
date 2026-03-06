# Deploying Viper with Docker Compose
- Fill out and rename docker/env files appropriately

- To spin up the core stack (Viper, DB, Inngest):
    - `docker compose up -d`

- To include a containerized copy of Prisma Studio for dev work (note that you could also just point a local copy at it, but this feels convenient):
    - `docker compose --profile dev up -d`

- To bring it down
    - `docker compose down`

- To also clean up volumes (so that the DB will re-seed)
    - `docker compose down -v`

- This may inspire MD PnP's deployment, and might also serve as a basis for a new prod deployment on AWS when we move away from Vercel.