# API Specification Document — Section 15

## AI Powered Enterprise Citizen Service & Grievance Management Platform

> **Continuation note**: This file continues the API Specification from the end of the approved Section 14 (API Security, `docs/14-API-Security.md`). Sections 1–14 are not reproduced, summarized, or modified here. This file contains **only** Section 15 (API Versioning) and formalizes, with complete detail, the versioning strategy already fixed at a summary level in `docs/API_SPECIFICATION.md` §15. No SQL, no Express routes, no controllers, no services, no implementation code, no OpenAPI YAML.

---

## 15. API Versioning

Fully compatible with, and introducing no change to, the versioning strategy already approved in `API_SPECIFICATION.md` §1.6, §15. This section formalizes that strategy to full enterprise detail for a Government Enterprise SaaS Platform intended to remain stable for external state-ULB/CPGRAMS integrators over a multi-year horizon (SRS §3.9).

### 15.1 Versioning Philosophy

- **Stability is a feature, not an afterthought.** A citizen-service government platform's consumers include the platform's own Citizen/Officer/Admin Portals *and*, per SRS §3.9's explicit future-readiness requirement, eventual external integrators (state ULB PGR systems, CPGRAMS, TNeGA services) who cannot redeploy on short notice. Every versioning decision below optimizes for **never breaking an existing consumer without an explicit, long-notice migration path**, even at the cost of carrying forward some contract imperfections rather than "fixing" them mid-version.
- **Additive by default, breaking only by exception.** A new major version is the exception, reserved for genuine breaking changes (Section 15.8) — not the default response to "we'd like to improve this."
- **One version scheme, applied uniformly.** Every endpoint across Sections 2–14 is `/api/v1`; there is no endpoint-by-endpoint version drift.

### 15.2 URI Versioning

**Adopted, primary mechanism**, unchanged from `API_SPECIFICATION.md` §1.1/§15.1: the major version is embedded in the URL path — `/api/v1/complaints`, `/api/v1/notifications/sms`, etc.

**Rationale for selection over the alternatives (Sections 15.3–15.4)**:
- Immediately visible in logs, browser network tabs, API Gateway routing rules, and error messages — no need to inspect headers to know which contract version produced a given response.
- Trivially routable at the Gateway/load-balancer layer (`ARCHITECTURE.md` §3.1) — a future `/api/v2` can be routed to an entirely different backing service group without any header-inspection routing logic.
- The dominant convention for government and enterprise REST APIs consumed by a wide range of client sophistication levels (including external integrators who may script against the API with simple tools, SRS §3.9) — header-based versioning assumes a level of client tooling sophistication this platform's broadest consumer base cannot be assumed to have.

**Example**: `GET https://tambaram.grievance.tn.gov.in/api/v1/complaints/cmp_001`

### 15.3 Header Versioning

**Considered, not adopted** as the primary mechanism — documented here so the decision is explicit and auditable, not simply absent from the record.

- **What it would look like**: `Accept: application/vnd.grievance.v1+json` or a custom `X-API-Version: 1` request header, with the same URL serving multiple versions differentiated only by header.
- **Why rejected as primary**: it hides the version from anything that only inspects the URL (browser address bar, most logging/monitoring tooling by default, a support engineer pasting a URL into a ticket) — for a government platform where non-specialist staff frequently need to reason about "which version of the API produced this," that invisibility is a real cost.
- **Where it is still used, non-conflictingly**: `Accept-Language` (`API_SPECIFICATION.md` §1.13) is a header-based *content* negotiation, not API *version* negotiation — the two are orthogonal and both are used, at their respective correct layers.

### 15.4 Query Parameter Versioning

**Considered, not adopted.**

- **What it would look like**: `GET /api/complaints?version=1`.
- **Why rejected**: query-parameter versioning is trivially droppable by an intermediate cache/proxy that doesn't treat the parameter as cache-key-significant, risking a v2 client silently receiving a cached v1 response (or vice versa) with no error at all — a failure mode that is silent and hard to diagnose, unlike a `404` on a mistyped URI path. URI versioning (Section 15.2) does not share this risk, since the version is part of the resource path itself, which every cache layer already treats as cache-key-significant.

### 15.5 Semantic Versioning

The **externally-exposed** API version is major-only (`v1`, `v2`, ... — Section 15.2). Internally, the platform's OpenAPI document (`16-API-Documentation-Standards.md` §16.2) carries a full semantic version (`info.version: 1.3.2`) to track documentation/contract-detail changes that are additive within the same major URI version:

| Semver Component | Meaning in this platform's context | Client-Visible? |
|---|---|---|
| Major (`1.x.x` → `2.x.x`) | A breaking change (Section 15.8) — always paired with a new URI major version (`/api/v2`) | Yes — the URI itself changes |
| Minor (`1.2.x` → `1.3.x`) | A backward-compatible addition (new endpoint, new optional field, new enum-like reference value) | No — same `/api/v1` URI, discoverable only via the OpenAPI document's own version field and changelog (`16-API-Documentation-Standards.md` §16.22) |
| Patch (`1.3.1` → `1.3.2`) | A documentation correction, example fix, or clarification with zero contract-behavior change | No |

### 15.6 Deprecation Policy

Restated in full from `API_SPECIFICATION.md` §15.4:

- A deprecated endpoint/field is marked with a `Deprecation: true` response header and surfaced in the OpenAPI spec via `deprecated: true` on the affected operation (`16-API-Documentation-Standards.md` §16.2).
- Deprecation is announced in this document family's own version history mechanism (mirroring the "Version History" pattern already used in `DATABASE_DESIGN.md`) and in the Changelog (`16-API-Documentation-Standards.md` §16.22).
- A **minimum 6-month** window between first marking an operation deprecated and its eventual removal in a subsequent major version — no exceptions, regardless of how small the affected consumer base is believed to be.

### 15.7 Sunset Policy

Restated in full from `API_SPECIFICATION.md` §15.4, with the header mechanics made explicit:

- The `Sunset` response header (RFC 8594, an HTTP-date) is set the moment an operation is marked deprecated, always at least 6 months in the future (Section 15.6).
- After the `Sunset` date passes, the operation returns `404 Not Found` with `error.code = OPERATION_REMOVED` (`12-Standard-Response-Formats.md` §12.15) — never a silent behavior change or a `410 Gone` masquerading as availability; a clearly absent operation is easier for a consumer's own monitoring to detect than a subtly-altered one.
- `Sunset` is never retroactively moved earlier once published — a consumer who planned migration around a published date must be able to trust that date as a floor, not a moving target.

### 15.8 Breaking Changes

A change is breaking, and therefore requires a new major version (`/api/v2`) rather than an in-place modification of `/api/v1`, if it does **any** of the following:

- Removes or renames a response field.
- Changes a field's data type or semantic meaning (e.g. a `status` field changing from a string label to a numeric code).
- Removes an endpoint or changes its URL.
- Tightens a previously-optional request field to required.
- Changes the meaning of an existing `error.code` value.
- Changes a default value in a way that alters behavior for callers who relied on the prior default.

**Scoped, not wholesale**: a breaking change to *one* resource (e.g. the `Complaint` schema) introduces `/api/v2/complaints` for that resource specifically — it does not require standing up a parallel `/api/v2` for every other resource that has not changed. `/api/v1/departments`, `/api/v1/notifications/*`, etc. continue to exist unmodified alongside `/api/v2/complaints`, exactly as `API_SPECIFICATION.md` §15.2 already establishes ("v2 does not mean 'redo the whole API'").

### 15.9 Backward Compatibility

Restated in full from `API_SPECIFICATION.md` §15.3 — within a major version, only these are permitted:

- Adding a new optional request field.
- Adding a new field to a response body.
- Adding a new endpoint.
- Adding a new enum-like value to a field backed by a `reference_value`/`*_definition` config table (`DATABASE_DESIGN.md` §29, Principle 2) — a new value is data, not schema, and inherently non-breaking as long as clients handle unrecognized values gracefully (Section 15.10).

### 15.10 Forward Compatibility

The complement to Section 15.9 — the **consumer contract obligation** every client (internal portal or external integrator) must honor for additive changes to remain truly non-breaking in practice:

- A client must **tolerate unknown response fields** — never fail parsing, never strip/reject a response solely because it contains a field the client's own code doesn't recognize.
- A client must **tolerate unrecognized enum-like values** on fields backed by tenant-configurable reference data (Section 15.9's last bullet) — e.g. a new `priority` value or a new `NOTIFICATION_STATUS` value (`08-Notification-APIs.md` §8.1.7) should render as-is (or a generic fallback label) rather than crash a strict enum parser.
- This obligation is documented explicitly (not merely assumed) precisely because a Government Enterprise SaaS Platform's external consumers (SRS §3.9) cannot be assumed to have read informal engineering conventions — it is part of the *contract*, stated here in Section 15 and reiterated in developer-facing documentation (`16-API-Documentation-Standards.md` §16.1).

### 15.11 Client Migration Strategy

For a breaking change (Section 15.8), the recommended migration sequence for any consumer:

1. **Discover** the deprecation via the `Deprecation`/`Sunset` headers (Sections 15.6–15.7), the Changelog (`16-API-Documentation-Standards.md` §16.22), or the version-info response (`12-Standard-Response-Formats.md` §12.15).
2. **Dual-run**: `/api/v1` and `/api/v2` (for the specific changed resource) are live simultaneously for the full deprecation window (minimum 6 months) — a consumer migrates on their own schedule within that window, not on a forced cutover date.
3. **Cut over** endpoint-by-endpoint, not all-at-once — since v2 is scoped per-resource (Section 15.8), a consumer using ten different resources can migrate the one changed resource independently of the other nine.
4. **Verify** against the OpenAPI 3.1 contract and its published examples (`16-API-Documentation-Standards.md` §16.13–§16.14) before the `Sunset` date.

### 15.12 Long-Term Support (LTS)

- `/api/v1` is the platform's LTS version for the Phase-1 pilot's full operational horizon — there is no planned obsolescence date for v1 independent of an actual breaking-change need arising.
- Should `/api/v2` ever be introduced (Section 15.8), `/api/v1`'s unaffected resources continue indefinitely; only the specifically-superseded resource enters its deprecation window (Section 15.6).
- LTS status is a commitment about **support duration**, not a commitment that v1 is permanently frozen from *additive* enhancement — Sections 15.9's backward-compatible additions continue to land in `/api/v1` throughout its LTS life.

### 15.13 OpenAPI Version Synchronization

- The physical `openapi.yaml`'s `info.version` (semver, Section 15.5) is bumped on every merge that changes the contract in any way — patch for docs-only, minor for additive, major for breaking (which also bumps the URI path itself).
- The OpenAPI document's major version component is kept in lockstep with the URI major version (`info.version: 2.0.0` is only ever published alongside a live `/api/v2`) — there is never a published OpenAPI document describing a version of the API that doesn't actually exist at that URI yet.
- CI validates this synchronization automatically as part of the documentation build (`16-API-Documentation-Standards.md` §16.2) — a version-mismatch is a build failure, not a manual-review catch.

### 15.14 Version Lifecycle

| State | Meaning | Consumer-Visible Signal |
|---|---|---|
| **Draft** | A new version under active internal development, not yet released to any environment | Not externally visible |
| **Active** | The current, fully-supported version — new features land here | The default; no special header |
| **Deprecated** | Still fully functional, but superseded; within its Sunset window | `Deprecation: true`, `Sunset: <date>` headers (Sections 15.6–15.7) |
| **Sunset** | Past its Sunset date; no longer available | `404 Not Found`, `error.code = OPERATION_REMOVED` |
| **Retired** | Fully removed from the OpenAPI document and all documentation surfaces (Section 16) | Absent from `data.supportedVersions` (`12-Standard-Response-Formats.md` §12.15) |

An operation moves through these states strictly left-to-right — there is no path back from `Deprecated` to `Active` (a "un-deprecation" would itself be a confusing signal to consumers who have already begun migrating).

### 15.15 Versioning Best Practices

1. Default to an additive change within `/api/v1` (Section 15.9) — treat a new major version as a last resort, not a routine tool.
2. Scope any necessary breaking change to the specific affected resource (Section 15.8), never a platform-wide `/api/v2` cutover.
3. Never publish a `Sunset` date less than 6 months out, and never move one earlier once published (Section 15.7).
4. Always keep the OpenAPI document's semver in lockstep with the URI major version (Section 15.13), enforced by CI, not manual review.
5. Document every deprecation in the Changelog the same day the `Deprecation` header is first served (`16-API-Documentation-Standards.md` §16.22) — the header and the changelog entry must never be out of sync.
6. Design every new endpoint's clients (internal or documented for external integrators) to tolerate unknown fields/enum values from day one (Section 15.10) — forward compatibility is cheapest to build in up front, not retrofitted after the first additive change breaks a brittle client.

---

*(End of Section 15.)*
