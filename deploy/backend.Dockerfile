# syntax=docker/dockerfile:1.7
# Image du serveur : API, module d'IA, e-mails et tâches de fond.
# Contexte de build : la RACINE du dépôt.
#   docker build -f deploy/backend.Dockerfile -t techzone/recruitment-backend .

ARG NODE_VERSION=22

# --- 1) Dépendances. L'image complète contient les outils de compilation :
#        ils servent si better-sqlite3 doit être compilé au lieu d'être téléchargé.
FROM node:${NODE_VERSION}-bookworm AS deps
WORKDIR /app/packages/backend
COPY packages/backend/package.json packages/backend/package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# --- 2) Image d'exécution, légère et sans outils de compilation.
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app/packages/backend
COPY --from=deps --chown=node:node /app/packages/backend/node_modules ./node_modules
COPY --chown=node:node packages/backend/ ./

# Le serveur place la base SQLite et les CV chiffrés sous <racine du dépôt>/demo, soit /app/demo ici.
# Ce dossier est un volume : les données survivent aux mises à jour de l'image.
RUN mkdir -p /app/demo/data /app/demo/storage/recruitment && chown -R node:node /app/demo
USER node
VOLUME ["/app/demo"]
EXPOSE 3111

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3111)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# demo-server.js : session RH factice, réservée à la recette locale.
# En production, utiliser « node server.js » avec l'adaptateur de session du portail (RECRUITMENT_HOST_ADAPTER).
CMD ["node", "demo-server.js"]
