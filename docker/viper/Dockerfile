FROM docker.io/node:trixie as builder
WORKDIR /srv
RUN apt-get update && apt-get install -y openssl
COPY . .
RUN npm ci
RUN npx prisma generate
# Set to 1 to build even when the app doesn't type check (see next.config.ts).
# Defaults to off, so the published-image build keeps type checking.
ARG VIPER_IGNORE_BUILD_ERRORS=0
RUN VIPER_IGNORE_BUILD_ERRORS=$VIPER_IGNORE_BUILD_ERRORS npm run build


FROM docker.io/node:trixie-slim
WORKDIR /srv
RUN apt-get update && apt-get install -y openssl && mkdir -p /srv/stamps && chown -R node:node /srv 
COPY --from=builder --chown=node:node /srv/ .
USER node

EXPOSE 3000

# Prevent re-seeding if the container is restarted
CMD if [ ! -f /srv/stamps/.setup_done ]; then \
        echo "Initializing database" && \
        npx prisma migrate deploy && \
        npm run db:seed && \
        touch /srv/stamps/.setup_done; \
    else \
        echo "Database already initialized; skipping seed."; \
    fi && \
    npm start