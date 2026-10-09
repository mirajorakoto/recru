# Étape 1 : Build des dépendances et du code
FROM node:22-bookworm-slim AS builder

WORKDIR /app
# Dépendances système pour compiler better-sqlite3
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY packages ./packages
COPY demo ./demo
COPY scripts ./scripts

RUN npm ci
RUN npm run build

# Keep only runtime dependencies after all build steps have completed. This
# prevents test runners and frontend tooling from reaching the production image.
FROM builder AS production-dependencies
RUN npm prune --omit=dev

# Étape 2 : Image de production légère
FROM node:22-bookworm-slim AS runner

WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends sqlite3 \
  && rm -rf /var/lib/apt/lists/*

# Copier uniquement les dépendances et le module serveur nécessaires à l'exécution.
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/backend ./packages/backend
COPY --from=builder /app/demo/dist ./demo/dist

# Répertoire de stockage des fichiers (candidatures, etc.)
RUN mkdir -p /var/lib/techzone/recruitment && chmod 700 /var/lib/techzone/recruitment

ENV NODE_ENV=production
ENV RECRUITMENT_STORAGE_DIR=/var/lib/techzone/recruitment
# Docker needs the container interface, while the Compose publication itself is
# pinned to the host loopback address.
ENV LISTEN_HOST=0.0.0.0

WORKDIR /app/packages/backend
EXPOSE 3111

CMD ["node", "server.js"]
