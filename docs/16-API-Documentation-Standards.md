# API Specification Document — Section 16

## AI Powered Enterprise Citizen Service & Grievance Management Platform

> **Continuation note**: This file continues the API Specification from the end of the approved Section 15 (API Versioning, `docs/15-API-Versioning.md`). Sections 1–15 are not reproduced, summarized, or modified here. This file contains **only** Section 16 (API Documentation Standards) and formalizes, with complete detail, the documentation standards already fixed at a summary level in `docs/API_SPECIFICATION.md` §16. No SQL, no Express routes, no controllers, no services, no implementation code, no OpenAPI YAML, no Postman collection — this document specifies *standards for* those artifacts, it does not itself generate them.

---

## 16. API Documentation Standards

Fully compatible with, and introducing no change to, the documentation standards already approved in `API_SPECIFICATION.md` §16, and directly applicable to the physical `docs/openapi.yaml` artifact already begun under that section's authority. Written to Government Enterprise SaaS Platform standard — every rule below exists so that a future developer, auditor, or external integrator (SRS §3.9) can work from the documentation alone, without needing to read source code.

### 16.1 Documentation Philosophy

- **The documentation is a contract, not a description.** Every shape documented in Sections 2–15 is binding — a service that behaves differently from its documented contract has a bug in the service, not an outdated document. This is the same posture `DATABASE_DESIGN.md`/`ARCHITECTURE.md` already take toward their own content, applied to the API layer.
- **Write for the reader who has none of this conversation's context.** A future maintainer, a government auditor, or an external state-ULB integrator (SRS §3.9) must be able to understand any single endpoint from its own documentation entry, without needing to have read every other section first.
- **One source of truth, many renderings.** The Markdown specification (Sections 1–16, this document family) and the physical OpenAPI 3.1 artifact (`docs/openapi.yaml`) describe the *same* contract; Swagger UI (Section 16.3) and ReDoc (Section 16.4) are two different renderings of that one artifact, never two independently-maintained descriptions that could drift apart.

### 16.2 OpenAPI 3.1 Standards

- The physical contract artifact is authored as a single `openapi.yaml` per major version (`15-API-Versioning.md` §15.2), conforming to **OpenAPI 3.1.x** — chosen over 3.0 specifically because 3.1 is JSON Schema 2020-12 compatible, allowing modern schema features (`oneOf`, nullable-via-type-arrays, `const`) without 3.0-era workarounds.
- Every endpoint documented in Sections 2–12 maps 1:1 to an OpenAPI `path` + `operation` object — no endpoint exists in the Markdown specification without a corresponding OpenAPI operation, and vice versa; CI validates this bidirectional completeness as part of the documentation build (Section 16.23).
- `info.version` follows the semantic-versioning discipline fixed in `15-API-Versioning.md` §15.5, kept in lockstep with the URI major version (§15.13).
- The document validates cleanly against the official OpenAPI 3.1 JSON Schema before merge — an invalid OpenAPI document is a build failure, never a "fix it later" note.

### 16.3 Swagger UI

- Served from a documentation-only path (e.g. `/api/v1/docs`), gated behind authentication for non-production environments (staging/UAT) and available read-only in production for the developer/integrator audience described in SRS §3.9.
- The "Try it out" execute capability is **never** pre-populated with shared/test credentials embedded in the spec — a caller must supply their own valid bearer token (Swagger UI's built-in authorization entry) before any live call can be made against real data, consistent with `API_SPECIFICATION.md` §16.2's original constraint.
- Swagger UI renders directly from the same `openapi.yaml` as every other consumer of the contract (Section 16.1) — it is a rendering, not a hand-maintained parallel description.

### 16.4 ReDoc

- Offered as an **alternative, read-only rendering** of the same `openapi.yaml`, optimized for a long-form, printable/PDF-exportable reading experience — suited to a government-audit or external-integrator onboarding context where a single scrollable reference document (rather than Swagger UI's interactive, per-operation panel layout) is the more useful artifact.
- ReDoc's three-panel layout (navigation, description, request/response samples) is particularly well suited to surfacing the `x-`-prefixed extension fields (e.g. a future `x-tenant-scoping` note, mirroring the pattern already used in the physical `openapi.yaml`'s `info` block) that Swagger UI renders less prominently.
- Like Swagger UI, ReDoc is served read-only in production and never embeds live credentials.

### 16.5 API Components

Every reusable OpenAPI element is organized under `components/` — `schemas`, `responses`, `parameters`, `securitySchemes` — exactly as already begun in the physical `docs/openapi.yaml`. No inline, non-reusable schema is used for any shape that repeats across more than one operation (e.g. the pagination `meta` block, the error envelope, `12-Standard-Response-Formats.md`'s 15 formats) — every repeating shape is a named `components` entry referenced via `$ref`, never copy-pasted inline at each point of use.

### 16.6 Reusable Schemas

- One schema per resource concept, with **detail-view and list-view shapes kept deliberately separate** (e.g. `Complaint` vs. `ComplaintListItem`) rather than one schema with a sprawling set of optional fields — an endpoint's actual response shape must be unambiguous from its schema reference alone, not inferable only after cross-checking which fields happen to be populated in a given call.
- Common envelope schemas (`SuccessEnvelope`, `ErrorEnvelope`, `PaginationCursorMeta`, `PaginationOffsetMeta` — `12-Standard-Response-Formats.md` §12.1–§12.3) are defined exactly once and referenced by every operation that uses them.
- Input schemas (`*Input` suffix, e.g. `ComplaintRegisterInput`) are kept separate from their corresponding output schemas — a request body and a response body for the "same" resource are never forced into one shared schema merely because they overlap in most fields.

### 16.7 Reusable Responses

Every HTTP status code documented in `13-HTTP-Status-Codes.md` has a corresponding `components/responses` entry (`BadRequest`, `Unauthorized`, `Forbidden`, `NotFound`, `Conflict`, `Gone`, `PayloadTooLarge`, `UnsupportedMediaType`, `Locked`, `TooManyRequests`, `InternalServerError`, `NotImplemented`, `ServiceUnavailable`, etc.) — referenced via `$ref` by every operation whose error surface matches that generic shape, exactly as already established in the physical `docs/openapi.yaml`. Endpoint-specific error variants (a particular `error.code` value) are documented via a distinct `description` string on the referencing operation's own response entry, never by duplicating the entire response schema per endpoint.

### 16.8 Reusable Parameters

Every cross-cutting query/header parameter defined in `API_SPECIFICATION.md` §1.8–§1.15 has a corresponding `components/parameters` entry (`CursorParam`, `LimitParam`, `PageParam`, `SizeParam`, `SortParam`, `FieldsParam`, `QParam`, `IdempotencyKeyHeader`, `CorrelationIdHeader`), referenced by every operation that accepts it — never re-declared inline with slightly different constraints on different endpoints, which would silently fragment the platform-wide pagination/filtering/sorting contract that Sections 1 and 13 establish as uniform.

### 16.9 Security Schemes

- `bearerAuth` (`type: http`, `scheme: bearer`, `bearerFormat: JWT`) is the platform's sole `components/securitySchemes` entry in Phase-1, applied globally (`security: [{ bearerAuth: [] }]`) with `security: []` overrides on the specific public endpoints (login, OTP request/verify, refresh, forgot/reset password) — exactly as already fixed in the physical `docs/openapi.yaml`.
- Should API Keys (`14-API-Security.md` §14.6) or OAuth 2.0 (`14-API-Security.md` §14.5) ever be adopted, each would be added as an **additional**, named `securitySchemes` entry — never a replacement of `bearerAuth`, since citizen/officer/admin authentication continues unchanged regardless of any future B2B mechanism added alongside it.

### 16.10 Tags

One tag per API Specification section (`Authentication`, `Citizen`, `Complaint`, `AI`, `Administration`, `Geographic`, `Notification`, `Reports`, `Audit`, `File`), matching the physical `docs/openapi.yaml`'s existing `tags` list — every operation carries exactly the tag(s) corresponding to its owning section, and an operation that logically spans two domains (e.g. `07-Geographic-APIs.md`'s Nearby Complaints, tagged both `Complaint` and `Geographic`) carries both tags rather than being forced into an artificial single-tag choice.

### 16.11 Operation IDs

Every operation has a unique, camelCase `operationId` following the `<domain><Verb><Resource>` convention already established in the physical `docs/openapi.yaml` (e.g. `authCitizenOtpRequest`, `complaintRegister`, `adminCreateDepartment`) — stable across non-breaking contract changes (`15-API-Versioning.md` §15.9), since `operationId` is frequently used as the stable hook for generated SDK method names (Section 16.20) and must not churn on every additive change.

---
### 16.12 Naming Standards

Restated in full from `API_SPECIFICATION.md` §1.2, applied specifically to documentation artifacts:

| Element | Convention | Example |
|---|---|---|
| Path segments | `kebab-case`, plural nouns | `/notification-templates`, `/complaint-categories` |
| Path parameters | `camelCase`, `{resource}Id` | `{complaintId}`, `{departmentId}` |
| JSON field names | `camelCase` | `trackingId`, `slaDueAt` |
| Query parameter names | `camelCase` | `?departmentId=`, `?periodStart=` |
| `operationId` | `camelCase`, `<domain><Verb><Resource>` | `complaintRegister` (Section 16.11) |
| Schema names | `PascalCase` | `ComplaintListItem`, `ErrorEnvelope` |
| Enum values | `snake_case` (matches stored reference-value codes, `DATABASE_DESIGN.md` §29) | `push_mobile`, `dead_letter` |

No exceptions are documented anywhere in Sections 2–15 to any row above — a naming inconsistency discovered in a future audit is a defect to fix, not a precedent to follow.

### 16.13 Request Examples

Every operation includes at least one populated `example` (or an `examples` map where meaningfully different request shapes exist for the same operation, e.g. `06-Administration-APIs.md` §6.3.2's Create User for `officer` vs. `department_admin`) — never a bare schema reference with no illustrative value filled in. An example must use realistic, plausible values (a well-formed tracking ID, a real-shaped mobile number pattern) rather than placeholder strings like `"string"` — the whole point of an example is to let an integrator copy-paste-adapt rather than reverse-engineer the shape from field types alone.

### 16.14 Response Examples

Every documented success status code (`13-HTTP-Status-Codes.md` §13.2–§13.3) carries a matching example response body, including the `meta.pagination` block where applicable (`12-Standard-Response-Formats.md` §12.3). A list endpoint's example must show a **realistic multi-item** `data` array, not a single-item placeholder — pagination behavior (whether `nextCursor` is present, whether `hasMore` is `true`) must be self-evident from the example alone, without requiring the reader to mentally extrapolate from a one-item sample.

### 16.15 Pagination Standards

Documentation restatement of `API_SPECIFICATION.md` §1.8: every list endpoint's documentation explicitly states which pagination style it uses (keyset/cursor vs. offset) and its specific `limit`/`size` ceiling — never leaves the reader to infer the style from the response shape alone. The OpenAPI document expresses this via the endpoint's referenced pagination parameter set (Section 16.8) and its documented response `meta.pagination` schema variant (`12-Standard-Response-Formats.md` §12.3) — the two must always agree (a keyset-paginated endpoint never references the offset `PaginationOffsetMeta` schema, and vice versa).

### 16.16 Filtering Standards

Documentation restatement of `API_SPECIFICATION.md` §1.10: every filterable field on every endpoint is individually enumerated in that endpoint's parameter list (Sections 2–12) — an endpoint's documentation never states "supports filtering" without naming every specific filterable field and its accepted operators (`filter[field][gte]`, `filter[field][in]`, etc.), since an undocumented filter field is itself a security/inventory-management gap (`14-API-Security.md` §14.17's API9).

### 16.17 Sorting Standards

Documentation restatement of `API_SPECIFICATION.md` §1.9: every sortable endpoint's documentation enumerates its specific sortable-field allow-list — never a generic "supports sorting" statement. The `SortParam` reusable parameter (Section 16.8) documents the general `?sort=field1,-field2` syntax once; each endpoint's own parameter list states which field names are valid for `field1`/`field2` on that specific endpoint.

### 16.18 Error Documentation

Every `error.code` value referenced against an endpoint anywhere in Sections 2–12 has a corresponding example in that operation's OpenAPI `responses` object, using the shared `ErrorEnvelope` schema (Section 16.6) — an integrator building error-handling logic should never need to trigger a real failure condition against a live environment just to discover the shape of, say, `COMPLAINT_ALREADY_CLOSED`. The master cross-reference for which codes pair with which HTTP status is `13-HTTP-Status-Codes.md` §13.12.

---
### 16.19 SDK Generation

- Not built in Phase-1, but the OpenAPI 3.1 document (Section 16.2) is written to be **directly consumable** by standard SDK generators (e.g. OpenAPI Generator, Kiota) without manual pre-processing — a direct consequence of Section 16.5's discipline (every reusable shape is a named `components` entry) and Section 16.11's discipline (every operation has a stable `operationId`, which generators use as the method name).
- A future generated SDK (TypeScript, Java, Python, or .NET client, as needed by future external integrators per SRS §3.9) would regenerate automatically on every OpenAPI document change — never hand-maintained in parallel with the spec, which would risk exactly the kind of drift Section 16.1 exists to prevent.

### 16.20 Client Code Generation

- Distinct from full SDK generation (Section 16.19) — this covers lighter-weight generation such as TypeScript type definitions for the Citizen/Officer/Admin Portal frontends (`ARCHITECTURE.md` §3.1's own internal consumers) directly from `components/schemas`.
- Because request/response schemas are kept strictly separate per Section 16.6 (`Input` vs. output shapes), generated client types are unambiguous — a portal's form-binding code and its list-rendering code use two distinctly-generated types rather than one overloaded, all-optional-fields type that would silently permit sending fields that should never appear in a request.

### 16.21 Documentation Versioning

- The Markdown specification (this document family, Sections 1–16) and the physical `openapi.yaml` are versioned together, in lockstep with the API's own version lifecycle (`15-API-Versioning.md` §15.13–§15.14) — there is never a published Markdown section describing a contract version that the OpenAPI document does not also describe, or vice versa.
- Each section-file (`02-Authentication-APIs.md` equivalent through `16-API-Documentation-Standards.md`) carries an implicit version identical to the overall API Specification's version, since every section was approved sequentially as part of one continuous specification effort — a future *breaking* change to any single section's content would itself follow the same major-version discipline as an API breaking change (Section 15.8), including its own deprecation/sunset signaling for the *document*, not just the API.

### 16.22 Changelog Management

- Every additive change (Section 15.9), deprecation (Section 15.6), and breaking change (Section 15.8) is recorded in a single, chronologically-ordered Changelog — the documentation-layer counterpart to `DATABASE_DESIGN.md`'s own "Version History" table pattern, applied here to the API contract.
- A Changelog entry always states: the date, the affected operation(s)/schema(s), the nature of the change (additive/deprecation/breaking), and — for a deprecation — the `Sunset` date (Section 15.7).
- The Changelog is updated **in the same change** that modifies the OpenAPI document or Markdown specification — never as a separate, later "catch-up" task, which is precisely how changelogs drift out of sync with reality in practice.

### 16.23 Documentation Review Process

Mirrors the Database Governance review process already fixed in `DATABASE_DESIGN.md` §33, applied to the API contract:

1. Every new/changed endpoint is checked against this document family's own standards — naming (Section 16.12), reusable-component discipline (Sections 16.5–16.8), example completeness (Sections 16.13–16.14), and error documentation completeness (Section 16.18) — before merge.
2. CI validates the OpenAPI document against its JSON Schema (Section 16.2) and against the bidirectional-completeness check (every Markdown-documented endpoint has an OpenAPI operation, and vice versa, Section 16.2) as a build gate, not a manual-only review step.
3. A breaking change (Section 15.8) requires explicit sign-off distinguishing it from an additive one — the same discipline `DATABASE_DESIGN.md` §33 already requires for schema changes, applied here to contract changes.
4. This API Specification document itself — Sections 1 through 16 — is the artifact of record; an endpoint implemented but not reflected here is out of process, exactly as `DATABASE_DESIGN.md` §33 states for its own schema.

### 16.24 Documentation Best Practices

1. Treat the documentation as the contract (Section 16.1) — a discrepancy between documented and actual behavior is always a service defect, never a "the docs are just stale" shrug.
2. Never let a reusable shape (schema, response, parameter) drift into an inline, per-endpoint duplicate (Sections 16.5–16.8) — refactor into `components/` the moment a shape repeats a second time.
3. Every example must be realistic and internally consistent (Sections 16.13–16.14) — a `trackingId` in an example must match the documented format (`TMBM-ENG-202607-000123`, `API_SPECIFICATION.md` §4.1), not a placeholder that would fail the endpoint's own validation rules if actually submitted.
4. Every filter/sort field and every `error.code` must be individually enumerated (Sections 16.16–16.18) — "supports filtering/sorting/errors" is never sufficient documentation on its own.
5. Update the Changelog in the same change as the contract modification (Section 16.22) — never as a follow-up task.
6. Prefer generating client-facing artifacts (SDKs, TypeScript types, Section 16.19–16.20) from the OpenAPI document over hand-writing them — hand-written client code is exactly where documentation and reality first drift apart.

---

*(End of Section 16. Stop after Section 16, per instruction.)*


