# Contributing

This repository is proprietary (see [`LICENSE`](LICENSE)) and is maintained in connection with the Tambaram City Municipal Corporation pilot engagement. It is not open to public contributions — changes are limited to authorized project members. This document describes the conventions those changes must follow.

## Scope of this repo

This repository currently contains **specification only**: the approved BRD/SRS/Architecture/Database Design documents, the API Specification (Sections 1–16), the Enterprise API Endpoint Catalog, and the OpenAPI 3.1 contract built from them. There is no backend implementation here yet. Any change must trace back to something already approved in `docs/API_SPECIFICATION.md` or `docs/Enterprise-API-Endpoint-Catalog.md` — this is not the place to invent a new endpoint, field, or business rule. If a change requires one, it goes through the source specification documents first, and the OpenAPI files follow.

## OpenAPI conventions

The OpenAPI document is deliberately split and non-inlining:

- `docs/openapi.yaml` is the master document. It contains **no inline endpoint definitions** — every path is a `$ref` into a module file, every reusable piece is a `$ref` into `docs/components/`. Do not add inline schemas or paths directly to it.
- One path file per module (`authentication.yaml`, `citizen.yaml`, `complaint.yaml`, `ai.yaml`, `administration.yaml`, `geographic.yaml`, `notification.yaml`, `reports.yaml`, `audit.yaml`, `file-management.yaml`), each a flat map of `path: { method: { ... } }`.
- Shared, cross-module concepts (envelopes, common reference objects, standard responses, standard parameters, headers, the bearer auth scheme) live in `docs/components/*.yaml` and are consumed via `$ref: './components/<file>.yaml#/<Name>'`. **Do not redefine something that already exists there.**
- A resource shape used by only one module's own operations (e.g. `Department`, `AuditLogListItem`) belongs in that module file's own `components:` block, referenced locally via `$ref: '#/components/schemas/<Name>'` — not in the shared `components/` directory.
- A header object (`components/headers.yaml`) is **not** a parameter object — it has no `name`/`in`. Never `$ref` a header directly inside a `parameters:` array; wrap it in a local named parameter (see `IdempotencyKeyHeader`/`IfMatchHeader`/`CorrelationIdHeader` in the existing path files for the pattern).
- `operationId` is `camelCase`, prefixed by module abbreviation: `auth*`, `citizen*`, `complaint*`, `ai*`, `admin*`, `geo*`, `notification*`, `report*`, `audit*`, `file*`. Must be globally unique across the whole spec.
- `tags` match the tag list already declared in `openapi.yaml`'s `tags:` block — don't introduce a new one without adding it there too.
- Security is inherited globally (`bearerAuth`) from `openapi.yaml`; only override with `security: []` on genuinely pre-authentication endpoints (OTP request/verify, login, refresh, password reset), matching `authentication.yaml`'s existing pattern.
- Every operation with inherited security needs a `401` response; state-changing operations need the standard `400`/`403`/`404` set as applicable, using `$ref` into `components/responses.yaml` rather than re-describing them inline.

## Before submitting a change

Run the linter against the full bundle — it resolves every `$ref` across all files, so it will catch a broken reference or a structurally invalid parameter/response that a single-file review would miss:

```bash
npx @redocly/cli lint docs/openapi.yaml
```

The bundle should lint with **zero errors**. Warnings about ambiguous paths are expected and already tracked in [`docs/ROUTE-REGISTRATION-ORDER.md`](docs/ROUTE-REGISTRATION-ORDER.md) — if your change introduces a *new* ambiguous pair, add it to that document rather than trying to rename an approved endpoint to avoid the warning.

## Commit style

Commit messages should explain *why*, not restate the diff. Keep unrelated changes in separate commits.
