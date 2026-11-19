# F11 demo image: production web build served by nginx with SPA deep-link
# fallback and a same-origin proxy to the API. Build context is frontend/.
#   docker compose -f frontend/docker-compose.demo.yml up -d --build --wait

FROM node:24-alpine AS build
WORKDIR /app
# Workspace manifests first so the dependency layer is cached. npm needs every
# workspace manifest to validate the lockfile, but only web/shared are installed.
COPY package.json package-lock.json ./
COPY web/package.json web/
COPY shared/package.json shared/
COPY mobile/package.json mobile/
RUN npm ci --workspace @biletflow/web --include-workspace-root --no-audit --no-fund
COPY shared shared
COPY web web
# Production build: mocks are compiled out and the API is same-origin.
ENV VITE_ENABLE_MOCKS=false \
    VITE_API_ORIGIN=
RUN npm run build --workspace @biletflow/web \
 && rm -f web/dist/mockServiceWorker.js

FROM nginx:1.29-alpine
COPY web/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/web/dist /usr/share/nginx/html
ENV API_UPSTREAM=http://api:8000
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --retries=6 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
