FROM node:trixie as builder
WORKDIR /srv
RUN apt-get update && apt-get install -y openssl git
RUN git clone --branch main https://github.com/PATCH-UPGRADE/viper.git .
RUN npm ci
RUN npx prisma generate
RUN npm run build


FROM node:trixie-slim
WORKDIR /srv
RUN apt-get update && apt-get install -y openssl
COPY --from=builder /srv/ .

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