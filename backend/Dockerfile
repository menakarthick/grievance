# Build context is the repository root (see docker-compose.yml), not
# backend/, because docs/openapi.yaml + its component/module files must be
# copied into the image alongside backend/ for Swagger UI (src/config/swagger.js
# resolves docs/ as ../../../docs relative to itself, mirroring the repo's
# own layout inside the image).
#
#   docker build -f backend/Dockerfile -t grievance-backend .   (from repo root)

FROM node:22-slim AS deps
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-slim AS runtime
ENV NODE_ENV=production
RUN npm install -g pm2@5 --no-fund --no-audit \
    && groupadd --system app && useradd --system --gid app --home /app app

WORKDIR /app/backend
COPY --from=deps /app/backend/node_modules ./node_modules
COPY backend/ ./
COPY docs/ /app/docs/

RUN mkdir -p logs uploads/tmp \
    && chown -R app:app /app

USER app
EXPOSE 3000

CMD ["pm2-runtime", "start", "ecosystem.config.js", "--env", "production"]
