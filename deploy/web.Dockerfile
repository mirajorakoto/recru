# syntax=docker/dockerfile:1.7
# Image web : console RH + site public (+ espace candidat), servis par nginx.
# Contexte de build : la RACINE du dépôt.
#   docker build -f deploy/web.Dockerfile -t techzone/recruitment-web .

ARG NODE_VERSION=22

# --- 1) Construction de l'application web (Vite)
FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app/deploy/web
COPY deploy/web/package.json deploy/web/package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    if [ -f package-lock.json ]; then npm ci; else npm install; fi
# Sources des deux interfaces, lues directement par Vite (voir deploy/web/vite.config.js)
COPY packages/admin-ui/src /app/packages/admin-ui/src
COPY packages/public-ui/src /app/packages/public-ui/src
COPY deploy/web/ ./
ARG VITE_TURNSTILE_SITE_KEY=""
ENV VITE_TURNSTILE_SITE_KEY=${VITE_TURNSTILE_SITE_KEY}
RUN npm run build

# --- 2) nginx sans privilèges (écoute sur le port 8080)
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
# Sécurité : correctifs Alpine, puis retour à l'utilisateur sans privilèges.
USER root
RUN apk upgrade --no-cache
USER 101
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/deploy/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
