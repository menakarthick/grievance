# Grievance Platform — Backend

Production-ready backend **foundation** for the AI Powered Enterprise Citizen Service & Grievance Management Platform, implementing the contract in [`docs/openapi.yaml`](../docs/openapi.yaml). This is infrastructure scaffolding only — no business logic. Controllers, services, repositories, validators, models, and the AI/notifications/workflow/reports/audit/file engines are present as empty, documented extension points for the implementation phase.

## Stack

Node.js 22 · Express · Sequelize (MySQL 8) · Redis · BullMQ · Winston · JWT (RS256) · Helmet · CORS · express-validator · Multer · PM2 · Docker.

## Layout

```
backend/
├── src/
│   ├── config/        env, logger, database (Sequelize), redis, swagger, sequelize-cli config
│   ├── routes/        /health + versioned /api/v1 routers (one per module, currently empty)
│   ├── controllers/    HTTP-layer handlers, one file per module
│   ├── services/       business logic, one file per module
│   ├── repositories/   Sequelize data access, one file per module
│   ├── middleware/      requestContext, auth (JWT), validate, errorHandler, notFound, requestLogger
│   ├── validators/     express-validator chains, one file per module
│   ├── models/         Sequelize models (auto-loaded index.js; none defined yet)
│   ├── migrations/      Sequelize migrations (sequelize-cli)
│   ├── seeders/         Sequelize seeders (sequelize-cli)
│   ├── jobs/            BullMQ workers (none defined yet)
│   ├── queues/          BullMQ queue registry + connection
│   ├── utils/            apiResponse, apiError, asyncHandler
│   ├── ai/                Claude API client wrapper (Section 5)
│   ├── notifications/     per-channel provider adapters (Section 8)
│   ├── workflow/           complaint lifecycle state machine (Section 4)
│   ├── reports/             report aggregation engine (Section 9)
│   ├── audit/                cross-cutting audit log writer (Section 10)
│   ├── file/                  storage adapter, signed URLs, virus scan (Section 11)
│   └── app.js                Express app: middleware, routes, error handling
├── server.js                 process entrypoint, dependency connections, graceful shutdown
├── ecosystem.config.js       PM2 process definition
├── docker-compose.yml        app + MySQL 8 + Redis, for local/integration use
├── Dockerfile                multi-stage build, runs under pm2-runtime
└── .env.example
```

The ten route/controller/service/repository/validator modules mirror `docs/`'s own module split: `auth`, `citizen`, `complaint`, `ai`, `admin`, `geo`, `notification`, `report`, `audit`, `file`. When wiring up real endpoints, follow [`docs/ROUTE-REGISTRATION-ORDER.md`](../docs/ROUTE-REGISTRATION-ORDER.md) for routes within a module that have structurally-ambiguous siblings.

## Getting started

```bash
cd backend
npm install
cp .env.example .env               # then edit .env

# RS256 JWT keypair (dev only — see docs/components/securitySchemes.yaml)
openssl genrsa -out src/config/keys/jwt-private.pem 2048
openssl rsa -in src/config/keys/jwt-private.pem -pubout -out src/config/keys/jwt-public.pem

npm run db:migrate                 # once migrations exist
npm start                          # or: npm run dev  (auto-restart)
```

The server binds on `PORT` (default `3000`) even if MySQL/Redis are unreachable — `GET /health` is a pure liveness probe. `GET /health/ready` reports actual MySQL/Redis connectivity and is what a load balancer/orchestrator should gate traffic on.

- `GET /health` — liveness
- `GET /health/ready` — readiness (MySQL + Redis)
- `GET /api/v1` — version info
- `GET /api-docs` — Swagger UI over `docs/openapi.yaml` (toggle via `SWAGGER_ENABLED`)

## Scripts

| Script                                   | Purpose                                     |
| ---------------------------------------- | ------------------------------------------- |
| `npm start`                              | Run the server                              |
| `npm run dev`                            | Run with `node --watch` for local iteration |
| `npm run lint` / `lint:fix`              | ESLint                                      |
| `npm run format` / `format:check`        | Prettier                                    |
| `npm run db:migrate` / `db:migrate:undo` | Sequelize migrations                        |
| `npm run db:seed` / `db:seed:undo`       | Sequelize seeders                           |
| `npm test`                               | Unit + integration tests (Jest); runs migrations against `<DB_NAME>_test` first |
| `npm run test:unit` / `test:integration` | Just one half of the suite                  |

## Testing

Integration tests run against a real MySQL database named `<DB_NAME>_test` (create it once — same user/grants as the main database) and an in-memory Redis (`ioredis-mock`, wired up in `tests/setup.js`, so no real Redis server is required to run the suite). `NODE_ENV=test` is set automatically by the `test*` scripts, which is what routes both the app's live Sequelize connection (`src/config/env.js`) and sequelize-cli at the `_test` database.

## Docker

`docker-compose.yml` builds from the **repository root** as context (not `backend/`), because the image needs `docs/` alongside `backend/` for Swagger UI:

```bash
cd backend
docker compose up --build
```

This starts `app` (PM2-managed, via `pm2-runtime`), `mysql` (MySQL 8), and `redis`, wired together on a private network with healthchecks gating `app`'s startup.

## Response contract

Every response follows `docs/12-Standard-Response-Formats.md`: `{ success, data, meta }` on success (`src/utils/apiResponse.js#sendSuccess`) or `{ success: false, error, meta }` on failure (`sendError`, wired through `src/middleware/errorHandler.js`). Every response carries `X-Request-Id` and `X-Correlation-Id` (`src/middleware/requestContext.js`), per `docs/components/headers.yaml`.
