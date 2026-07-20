# Grievance — AI Powered Enterprise Citizen Service & Grievance Management Platform

Design and API specification for a multi-tenant citizen grievance/complaint management platform (pilot: Tambaram City Municipal Corporation), covering citizen complaint registration and tracking, officer/admin workflow, AI-assisted classification and voice intake, notifications, reporting, audit, and file management.

This repository currently holds the **approved specification and OpenAPI 3.1 contract** — no implementation code.

## Repository layout

```
docs/
├── BRD / SRS / ARCHITECTURE.md / INFRASTRUCTURE_DEVOPS.md / DATABASE_DESIGN.md
├── API_SPECIFICATION.md              # Sections 1–16, the API design source of truth
├── Enterprise-API-Endpoint-Catalog.md # Full 295-endpoint catalog
├── 06–16-*.md                        # Individual API Specification sections
│                                      # (Administration, Geographic, Notification,
│                                      #  Reports, Audit, File Management, Response
│                                      #  Formats, HTTP Status Codes, Security,
│                                      #  Versioning, Documentation Standards)
│
├── openapi.yaml                      # Master OpenAPI 3.1 document — $refs only,
│                                      # no inline endpoint definitions
├── authentication.yaml               # Module path files, one per domain
├── citizen.yaml
├── complaint.yaml
├── ai.yaml
├── administration.yaml
├── geographic.yaml
├── notification.yaml
├── reports.yaml
├── audit.yaml
├── file-management.yaml
│
├── components/                       # Shared, reusable OpenAPI components
│   ├── schemas.yaml
│   ├── responses.yaml
│   ├── requestBodies.yaml
│   ├── parameters.yaml
│   ├── headers.yaml
│   └── securitySchemes.yaml
│
└── ROUTE-REGISTRATION-ORDER.md       # Router setup guidance for structurally-
                                       # ambiguous path pairs (no contract impact)
```

## API surface

- **295 endpoints** across 10 modules: Authentication, Citizen, Complaint, AI, Administration, Geographic, Notification, Reports, Audit, File Management.
- **OpenAPI 3.1**, split across `openapi.yaml` + module path files + shared `components/`, assembled entirely by `$ref` (no inlining).
- **Auth**: Bearer JWT (`securitySchemes.yaml`), applied globally with `security: []` overrides on the handful of pre-authentication endpoints (OTP request/verify, login, refresh, password reset).

## Validating the spec

```bash
npx @redocly/cli lint openapi.yaml
```

Bundles and lints the full multi-file document. As of the last full pass: **0 errors**, a handful of `no-ambiguous-paths` warnings that are resolved procedurally — see [`docs/ROUTE-REGISTRATION-ORDER.md`](docs/ROUTE-REGISTRATION-ORDER.md).

## Status

Specification, endpoint catalog, and OpenAPI contract are complete and validated. No backend implementation exists yet in this repository.
