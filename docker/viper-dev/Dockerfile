FROM node:trixie
WORKDIR /srv
RUN apt-get update && apt-get install -y openssl
COPY package.json package-lock.json ./
# skip postinstall (prisma generate) at build time
RUN npm ci --ignore-scripts 

COPY . .
EXPOSE 3000

CMD mkdir -p /srv/stamps && \
    npx prisma generate && \
    if [ ! -f /srv/stamps/.setup_done ]; then \
        echo "Initializing database" && \
        npx prisma migrate deploy && \
        npm run db:seed && \
        touch /srv/stamps/.setup_done; \
    else \
        echo "Database already initialized; skipping seed."; \
    fi && \
    npm run dev