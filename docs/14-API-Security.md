# API Specification Document — Section 14

## AI Powered Enterprise Citizen Service & Grievance Management Platform

> **Continuation note**: This file continues the API Specification from the end of the approved Section 13 (HTTP Status Codes, `docs/13-HTTP-Status-Codes.md`). Sections 1–13 are not reproduced, summarized, or modified here. This file contains **only** Section 14 (API Security) and formalizes, with complete enterprise-level detail, the security model already fixed at a summary level in `docs/API_SPECIFICATION.md` §14. No SQL, no Express routes, no controllers, no services, no implementation code, no OpenAPI YAML.

---

## 14. API Security

A complete enterprise API Security Specification for a Government Enterprise SaaS Platform, fully compatible with — and introducing no architectural change to — the BRD, `SRS.md`, `ARCHITECTURE.md`, `INFRASTRUCTURE_DEVOPS.md`, `DATABASE_DESIGN.md` v1.1, the AI Agent architecture, and API Specification Sections 1–13. Every control below is either a direct restatement of an already-approved architectural decision (`ARCHITECTURE.md` §11 Security Architecture, §16 Redis Architecture) applied at the API-contract layer, or an explicitly-marked future-readiness item that requires no redesign to adopt later.

### 14.1 Security Overview

The API layer inherits, and is the outermost enforcement point for, the seven-layer defense-in-depth model already fixed in `ARCHITECTURE.md` §11.1: Network → Transport (TLS) → Edge (NGINX/rate limiting) → Identity (JWT/MFA) → Application (RBAC/validation) → Data (encryption/masking) → Observability (audit/monitoring). Every endpoint documented in Sections 2–12 sits at the Identity and Application layers; this section is the definitive, API-contract-level specification of how those two layers behave, so that every microservice (`ARCHITECTURE.md` §3.1) implements them identically rather than each service inventing its own interpretation. The platform's security posture is designed to be directly citable against CERT-In guidelines, GIGW, OWASP (both the general Top 10, `API_SPECIFICATION.md` §14.6, and the API-specific Top 10, Section 14.17), and the DPDP Act (SRS §9) — this is a Government Enterprise SaaS Platform, and every control here is written assuming an external security audit will read it.

### 14.2 Authentication

Three authentication factor-sets, fixed in `API_SPECIFICATION.md` §2 and `ARCHITECTURE.md` §7, restated here as the security baseline every other control in this section builds on:

| Actor | Factor(s) | Section Reference |
|---|---|---|
| Citizen | Mobile OTP only (no password exists for this role) | `API_SPECIFICATION.md` §2.1–§2.2 |
| Officer / Department Admin | Username + Argon2id-hashed password + OTP | `API_SPECIFICATION.md` §2.3–§2.4 |
| Corporation Admin / Super Admin | Username + Argon2id-hashed password + mandatory TOTP MFA | `API_SPECIFICATION.md` §2.5–§2.6 |

No endpoint in this platform ever accepts a credential over an unauthenticated, unencrypted channel — TLS 1.2+ is mandatory end-to-end (Section 14.21), and every authentication endpoint is exempt from the default `bearerAuth` security requirement specifically *because* it is the mechanism that produces a bearer token, not because it is any less protected in transit.

### 14.3 JWT Security

| Property | Value | Rationale |
|---|---|---|
| Signing algorithm | RS256 (asymmetric) | The API Gateway verifies signatures using only the public key — private signing keys never need to be distributed to every service instance, reducing key-exposure blast radius (`ARCHITECTURE.md` §4.1) |
| Access token expiry | 15 minutes (default), tenant-configurable within a system-enforced ceiling | SRS §8.1 |
| Claims | `userId`, `userType`, `tenantId`, `roles`, `scope` | Exactly the claim set `ARCHITECTURE.md` §11.2's RBAC model defines — no endpoint invents its own claim shape (`API_SPECIFICATION.md` §14.1) |
| Key rotation | Signing key pairs are rotated on a scheduled cadence; the Gateway accepts both the current and immediately-prior public key during a rotation overlap window, so no in-flight token is invalidated mid-rotation | Standard JWKS-style rotation practice, applied without requiring a JWKS endpoint in Phase-1 (a single, Admin-Portal-configured key pair is sufficient at Tier-1/2 scale, `ARCHITECTURE.md` §13.2) |
| Token binding | None in Phase-1 (a bearer token is usable by whoever holds it) — see Section 14.25 Device Binding for the documented future-readiness path |

Every request's JWT is verified once, at the API Gateway (`ARCHITECTURE.md` §4.1), before the request reaches any downstream service — no service re-validates the signature independently, avoiding both redundant cryptographic work and the risk of two services disagreeing on validity.

### 14.4 Refresh Tokens

Restated in full from `API_SPECIFICATION.md` §2.7/§14.2, with the security rationale made explicit:

- **7-day expiry**, single-use, rotated on every use — a stolen-but-unused refresh token has a bounded window of value.
- **Reuse detection**: presenting an already-rotated (already-consumed) refresh token revokes the **entire token family** (every token descended from the original login), not just the reused token. This is the standard refresh-token-theft detection pattern — legitimate clients never replay a consumed token, so reuse is a strong signal of token exfiltration.
- **Storage**: server-side record in Redis (`ARCHITECTURE.md` §16), AOF-persisted for durability — enabling revocation (Section 14.26) and reuse-family tracking that a purely stateless (JWT-only) refresh mechanism could not provide.
- **Client-side storage guidance**: httpOnly, `Secure`, `SameSite=Strict` cookie for web clients; platform secure keystore (Android Keystore / iOS Keychain) for mobile clients — never `localStorage`/`sessionStorage`, which is readable by any script running in the page (XSS exposure).

### 14.5 OAuth 2.0 Readiness

**Not implemented in Phase-1.** The platform's own JWT/refresh-token model (Sections 14.3–14.4) fully serves Citizen/Officer/Admin authentication today. OAuth 2.0 / OpenID Connect readiness is documented here as a **forward-compatible extension point**, per SRS §3.9's explicit instruction that the API layer be "designed as versioned, documented REST APIs from the outset, so that future integration can be added without breaking existing consumers":

- A future external integrator (a state ULB PGR system, CPGRAMS, or a future citizen-facing single-sign-on requirement) would be onboarded via a **new, additive** `grant_type` on the existing `/api/v1/auth/token/refresh`-adjacent surface, or a dedicated `/api/v2/auth/oauth/*` path if the shape genuinely diverges — never by retrofitting OAuth semantics onto the existing citizen/officer login endpoints.
- The platform's JWT claim shape (Section 14.3) is already structurally compatible with an OIDC `id_token` if that migration is ever undertaken — `userId`/`tenantId`/`roles` map directly to `sub`/a custom claim/a custom claim, requiring no redesign of the claims model itself.
- No architectural change is introduced by this future-readiness note — it is a documented option, not a commitment or a partially-built feature.

### 14.6 API Keys

**Not used for Citizen/Officer/Admin authentication** (JWT is the sole internal mechanism, Section 14.3). API Keys are reserved as a **future, additive mechanism for server-to-server / external B2B integration** (SRS §3.9's future state-ULB/CPGRAMS integration scenario), distinct in purpose from a user's bearer token:

| Property | Design (future) |
|---|---|
| Format | A long, high-entropy, prefixed opaque token (e.g. `sk_live_...`), never a JWT — API keys identify a *system*, not a *user session*, and have no natural expiry the way a short-lived JWT does |
| Storage | Hashed at rest (never reversible), identical posture to a password — the raw key is shown to the integrator exactly once at issuance |
| Scope | Bound to a specific tenant and a specific, minimal permission set (`resource`/`action` pairs from the existing `permission` catalog, `06-Administration-APIs.md` §6.5) — never a blanket "full access" credential |
| Rotation | Supports multiple concurrently-valid keys per integration so a consumer can rotate without a hard cutover |

This mechanism is **not built in Phase-1** — it is documented so that when the first external B2B integration is approved, the API contract has an obvious, pre-considered home for it rather than requiring an ad hoc bolt-on.

### 14.7 Role-Based Access Control (RBAC)

Restated in full from `ARCHITECTURE.md` §11.2 — the model every Authorization field in Sections 2–13 is expressed against:

- **Role** (Citizen / Officer\[hierarchy level\] / Department Admin / Corporation Admin / Super Admin / configurable future read-only roles) is always evaluated **within a tenant context** — cross-tenant data access is structurally impossible except the documented Super Admin exception.
- **Permission** = a (`resource`, `action`) pair (e.g. `complaint:read:own`, `complaint:assign`, `config:department:write`, `report:sla:read` — the last per `09-Reports-APIs.md` §9.14). Permission sets are tenant-configurable (SRS §7), resolved from the Tenant & Admin Config Service and cached in Redis with short TTL and explicit invalidation on write (`ARCHITECTURE.md` §16).
- **Scope** narrows a permission to a data subset: an Officer's scope is their assigned ward/department; a Department Admin's scope is one department; a Corporation Admin's scope is the whole tenant; a Super Admin's scope spans tenants.
- Every endpoint's **Authorization** field throughout Sections 2–13 is a direct statement of this Role + Permission + Scope evaluation — there is exactly one RBAC engine in the platform, never a per-service reimplementation.

### 14.8 Attribute-Based Access Control (ABAC) — Future

**Not implemented in Phase-1.** RBAC (Section 14.7) is sufficient for the pilot's role/scope granularity. ABAC is documented as a **future, additive refinement layer** on top of RBAC, not a replacement:

- **Illustrative future attributes**: time-of-day (e.g. restrict Super Admin provider-configuration changes to business hours), device-trust-level (Section 14.25), request-origin network (Section 14.28), or a complaint's own sensitivity classification (e.g. a future "restricted" category requiring an additional attribute check beyond ordinary department scope).
- **Design compatibility**: ABAC attributes would be evaluated as an *additional* gate after the existing RBAC check passes, never as a replacement for it — a request must still clear Role + Permission + Scope (Section 14.7) before any ABAC attribute is even considered. This ordering is deliberate: it means adopting ABAC later requires adding a new evaluation stage, not re-architecting the existing RBAC enforcement point (`ARCHITECTURE.md` §4.1's `MW4 RBAC Guard`).
- No ABAC attribute, rule engine, or policy table is introduced by this document — this subsection exists purely to record that the RBAC design does not foreclose ABAC as a future layer.

---
### 14.9 Multi-Tenant Security

Restated from `API_SPECIFICATION.md` §1.1: **tenant scoping is never a URL path segment.** It is derived exclusively from the authenticated JWT's `tenantId` claim (Section 14.3) and enforced at the Data Access Layer boundary already defined in `DATABASE_DESIGN.md` §3. This single design decision eliminates an entire class of tenant-enumeration/IDOR vulnerability (OWASP API3/API1, Section 14.17) at the contract level — there is no `/tenants/{tenantId}/...` path for an attacker to manipulate. The sole exception is a Super Admin's documented `?tenantId=` query parameter on specific cross-tenant endpoints, itself gated by the highest RBAC tier (Section 14.7) and logged with elevated audit priority (Section 14.24).

### 14.10 Data Isolation

Every tenant-scoped database table carries `tenant_id` as, per `DATABASE_DESIGN.md` §3, "the first column in composite indexes" and the mandatory first filter in every query the Data Access Layer constructs. At the API layer, this manifests as: **no endpoint accepts a client-supplied `tenant_id`/`tenantId` value that overrides the JWT's own claim** — any such field, if present in a request body, is silently ignored server-side (never trusted, never merged into the query), and the JWT claim is the sole source of truth. This is stricter than mere row-level security enforcement — it is enforced identically at the API-contract validation layer *and* the database layer, so a bug in one layer does not create a cross-tenant exposure on its own.

### 14.11 API Gateway Security

The API Gateway (`ARCHITECTURE.md` §3.1 #1) is the platform's single ingress point and performs, for every request, before it reaches any business logic:

1. TLS termination (Section 14.21).
2. Security headers injection (Section 14.20).
3. Rate limiting (Section 14.12).
4. JWT signature verification (Section 14.3).
5. Correlation ID / Request ID assignment (`API_SPECIFICATION.md` §1.14–§1.15).
6. Structured request/response logging (Section 14.24).

No individual microservice (`ARCHITECTURE.md` §3.2) re-implements TLS termination or JWT verification independently — this is a deliberate single-point-of-enforcement design, consistent with `ARCHITECTURE.md` §4.1's component diagram (`MW1`–`MW4` middleware chain executing once, ahead of every controller).

### 14.12 Rate Limiting

Enforced at the Gateway via a Redis token-bucket/sliding-window counter (`ARCHITECTURE.md` §16), keyed by IP + user + tenant simultaneously — a single compromised or misbehaving account cannot exhaust the platform's capacity for its whole tenant, and a single tenant cannot exhaust capacity for the platform as a whole. The full tiered throttle catalog is documented in `13-HTTP-Status-Codes.md` §13.7; this subsection is the security rationale: rate limiting is this platform's primary control against both brute-force credential attacks (OTP/password/MFA endpoints) and resource-exhaustion denial-of-service (OWASP API4, Section 14.17).

### 14.13 Request Validation

Every request body and query parameter is schema-validated **before** reaching any service's business logic (`ARCHITECTURE.md` §4.1's `MW5 Input Validation & Sanitization` middleware) — matching the OpenAPI 3.1 schema documented per-endpoint throughout Sections 2–12 (`16-API-Documentation-Standards.md` §16.2). Validation failures never reach a database query or an external provider call; they are rejected at the Gateway/application-boundary layer with `400 VALIDATION_ERROR` (`13-HTTP-Status-Codes.md` §13.4.1) before any state-changing code executes. Documented filter/sort/field-selection allow-lists (`API_SPECIFICATION.md` §1.9–§1.12) are themselves a request-validation control — an undocumented query field is rejected, never silently ignored or passed through to a query builder (OWASP API8 Security Misconfiguration, Section 14.17).

### 14.14 Response Validation

The platform validates its own outbound responses against the same schema it publishes (`16-API-Documentation-Standards.md` §16.2) as a defense-in-depth measure against **over-fetching/over-exposure** bugs — a service-layer bug that accidentally attaches an extra internal field (e.g. a password hash, an internal foreign key never meant for the contract) to a response object is caught by response-shape validation in staging/CI before it ever reaches production, rather than relying solely on developer discipline. This directly mitigates OWASP API3 (Broken Object Property Level Authorization, Section 14.17) — the risk of a response silently including more than its documented shape promises.

### 14.15 Input Sanitization

Every free-text field accepted anywhere in Sections 2–12 (complaint descriptions, notification template bodies, report-schedule names, file tags) is sanitized against injection **before** persistence — stripping or escaping executable script content, consistent with the mandatory sanitization already fixed for complaint registration (`API_SPECIFICATION.md` §4.1's `description` field) and notification template creation (`08-Notification-APIs.md` §8.7.2's `bodyTemplate`/`htmlBodyTemplate`). Sanitization happens **twice** for any field that is later rendered (once at input, once at render/output time, Section 14.16) — defense in depth against a sanitizer bypass at either single point (OWASP API8, Section 14.17; general OWASP A03 Injection, `API_SPECIFICATION.md` §14.6).

### 14.16 Output Encoding

Every value interpolated into a rendered output — an HTML email body (`08-Notification-APIs.md` §8.3.1), a rendered notification-template preview (`08-Notification-APIs.md` §8.7.7), an OCR-extracted text value later displayed in a portal (`11-File-Management-APIs.md` §11.10.1) — is context-appropriately encoded at render time (HTML-entity encoding for HTML contexts, JSON-string escaping for JSON payloads) **regardless of** whether the same value was already sanitized at input time (Section 14.15). This double-layered discipline (sanitize on the way in, encode on the way out) is the platform's standard defense against stored-XSS (OWASP A03) — a sanitizer that later proves imperfect at input time is still contained by correct output encoding, and vice versa.

---
### 14.17 OWASP API Security Top 10 Compliance

Distinct from — and a finer-grained refinement of — the general OWASP Top 10 mapping already fixed in `API_SPECIFICATION.md` §14.6. This is the API-specific OWASP API Security Top 10 (2023 edition), mapped to this platform's controls:

| Risk | Platform Mitigation |
|---|---|
| API1: Broken Object Level Authorization | Every resource-scoped endpoint checks ownership/scope server-side from the JWT before returning data (`API_SPECIFICATION.md` §4.5, §4.9 and equivalents platform-wide) — an id in the URL is never sufficient authorization on its own |
| API2: Broken Authentication | Section 14.2–14.4 (OTP/password+OTP/password+MFA, JWT, refresh-token rotation with reuse detection) |
| API3: Broken Object Property Level Authorization | Section 14.14 (response validation against the documented schema); field-level exclusions (e.g. audit responses never include raw PII, `10-Audit-APIs.md` §10.1.3) |
| API4: Unrestricted Resource Consumption | Section 14.12 Rate Limiting; file size/count ceilings (SRS §8.2); bulk/broadcast recipient caps (`08-Notification-APIs.md` §8.11.2, §8.13.1, §8.14.1) |
| API5: Broken Function Level Authorization | Section 14.7 RBAC — every endpoint's Authorization field is a function-level check, not merely an object-level one (e.g. Super-Admin-only Provider Configuration, `06-Administration-APIs.md` §6.11.2) |
| API6: Unrestricted Access to Sensitive Business Flows | Rate limiting + audit logging on high-blast-radius flows specifically (Emergency Override `08-Notification-APIs.md` §8.8.4, Broadcast §8.13, bulk retry §8.11.2) — these flows carry stricter throttles and mandatory audit trails than routine reads |
| API7: Server-Side Request Forgery (SSRF) | Every outbound integration (Claude, Maps, WhatsApp/SMS/Email/FCM) is a named, allow-listed `provider_config` entry (`06-Administration-APIs.md` §6.12) — no endpoint accepts an arbitrary client-supplied outbound URL (`API_SPECIFICATION.md` §14.6 A10) |
| API8: Security Misconfiguration | Documented filter/sort allow-lists (Section 14.13); standard error envelope never leaks stack traces (`13-HTTP-Status-Codes.md` §13.5.1); CORS/CSP/security headers fixed platform-wide (Sections 14.18–14.20) |
| API9: Improper Inventory Management | The OpenAPI 3.1 document (`16-API-Documentation-Standards.md` §16.2) is the single, versioned inventory of every endpoint; deprecated operations are explicitly flagged (`API_SPECIFICATION.md` §15.4), never silently left undocumented |
| API10: Unsafe Consumption of APIs | Every upstream provider response (Claude, Whisper, SMS/WhatsApp/Email/Maps) is schema-validated before being trusted, consistent with Section 14.14's response-validation discipline applied symmetrically to inbound provider responses |

### 14.18 CORS Policy

- **Allow-listed origins only**: the Citizen/Officer/Admin Portal origins are explicitly configured per tenant/environment — no `Access-Control-Allow-Origin: *` on any authenticated endpoint.
- **Credentials**: `Access-Control-Allow-Credentials: true` only for the explicitly allow-listed origins above, never combined with a wildcard origin (a combination browsers themselves reject, but one this platform never attempts regardless).
- **Methods/headers**: `Access-Control-Allow-Methods` and `Access-Control-Allow-Headers` are scoped to exactly the methods/headers the platform actually uses (Sections 1.4, 1.14–1.15) — never a blanket `*`.
- **Public, unauthenticated endpoints** (none currently exist at full anonymity — even the closest candidate, a share-link download with `requiresAuthentication: false`, `11-File-Management-APIs.md` §11.6.1, is category-gated) would use a narrower, purpose-specific CORS policy scoped only to that resource type.

### 14.19 CSP Headers

Applied at the portal (browser-rendered client) layer, not the JSON API responses themselves (a JSON API response has no executable content to constrain) — documented here because the API Gateway is responsible for injecting the header on any HTML-serving path it fronts (e.g. Swagger UI, `16-API-Documentation-Standards.md` §16.3):

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'
```

- `frame-ancestors 'none'` prevents the Admin/Officer Portal or Swagger UI from being framed by an external origin (clickjacking mitigation, complementing `X-Frame-Options` in Section 14.20).
- `object-src 'none'` and a restrictive `script-src` reduce the impact of any stored-XSS that might slip past Sections 14.15–14.16's sanitization/encoding discipline — a defense-in-depth control, not a substitute for it.

### 14.20 Security Headers

Applied by the API Gateway to every response (`ARCHITECTURE.md` §11.1 Edge Layer):

| Header | Value | Purpose |
|---|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Enforces TLS for a full year once a client has connected once (SRS §11.5) |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME-type sniffing from reinterpreting a JSON response as executable content |
| `X-Frame-Options` | `DENY` | Clickjacking mitigation, redundant with and complementary to Section 14.19's `frame-ancestors` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Prevents leaking full request URLs (which may contain sensitive query parameters) to third-party referrer targets |
| `Permissions-Policy` | `geolocation=(self), camera=(), microphone=(self)` | Restricts browser feature access to only what the Citizen Portal's own location-capture (`API_SPECIFICATION.md` §7.4) and voice-complaint (`API_SPECIFICATION.md` §4.2) flows require |
| `Cache-Control` | `no-store` (default; overridden to `private, max-age=<n>` only on the specific cacheable report endpoints, `09-Reports-APIs.md` §9.1.6) | Prevents sensitive API responses from being cached by shared/intermediate caches by default |

### 14.21 Encryption

- **In transit**: TLS 1.2+ everywhere, including internal service-to-service calls crossing the VM-1/VM-2 boundary (Gateway/app tier → MySQL, `ARCHITECTURE.md` §11.4).
- **At rest**: MySQL data-at-rest encryption; encrypted file storage for uploaded images/voice/documents; encrypted backups (SRS §11.4, `ARCHITECTURE.md` §11.4).
- **PII in AI egress**: masked before leaving infrastructure (`ARCHITECTURE.md` §8.2) — a privacy control layered on top of, never a substitute for, transport encryption.
- **API-layer specific**: every bearer token, refresh token, and OTP is transmitted exclusively over TLS; none of the three is ever logged in plaintext (Section 14.24) or included in a URL query string (which would risk exposure via server access logs, browser history, or Referer headers) — always in the request body or an `Authorization` header.

### 14.22 Secrets Management

Restated from `06-Administration-APIs.md` §6.11.2 and `INFRASTRUCTURE_DEVOPS.md` §7: every provider credential (SMS gateway, WhatsApp Business Platform, SMTP, Claude API key, Maps API key) is stored exclusively as a **secrets-manager reference** in `provider_config.secretReference` — never a raw credential value in any database row, request body, or response body, anywhere in the platform. Any request body field that "looks like" a raw secret rather than a reference is rejected outright by pattern-check validation (`06-Administration-APIs.md` §6.11.2's Validation Rules) — an Admin cannot accidentally paste a live API key into the API and have it persisted in the clear. Secrets rotation is an `INFRASTRUCTURE_DEVOPS.md`-governed operational process, out of this API specification's scope beyond the reference-only storage contract stated above.

### 14.23 Secure File Access

Restated from `API_SPECIFICATION.md` §11 / `11-File-Management-APIs.md` §11.2: file content is **never** served from a direct, guessable static path. Every download/preview goes through a signed, time-boxed URL generation step, gated by: (1) virus-scan status must be `clean`; (2) lifecycle state must not be `quarantine`; (3) the requester's ownership/scope/explicit-grant check (Sections 11.6–11.7). Randomized, non-guessable storage filenames (SRS §8.2) mean even a leaked storage-layer listing (which itself should never be externally reachable) would not map trivially back to a specific complaint or citizen.

### 14.24 API Audit Logging

Every state-changing endpoint across Sections 2–12 emits an audit event, consumed asynchronously and written immutably (`ARCHITECTURE.md` §4.1's `SVC -.audit event.-> AUDITQ`, `DATABASE_DESIGN.md` §10, §21) — this is a platform-wide middleware concern, never an opt-in per endpoint. The full audit API surface (search, export, compliance reporting) is specified in `10-Audit-APIs.md`; this subsection is the security-control statement: **audit logging is not bypassable by any client-facing API call** — there is no endpoint that performs a state change while suppressing its own audit trail, including Admin-tier actions, Emergency Overrides (`08-Notification-APIs.md` §8.8.4), and Super Admin cross-tenant operations.

---
### 14.25 Device Binding

**Not implemented in Phase-1** — a bearer JWT/refresh token is valid regardless of originating device, consistent with a straightforward mobile/web citizen-service platform where requiring device-bound credentials would add friction disproportionate to the pilot's risk profile. Documented as a **future-readiness item** for the higher-trust Admin tiers specifically:

- A future enhancement could bind a Corporation Admin/Super Admin's refresh token to a device fingerprint (already captured as `activity_log.deviceFingerprint`, `10-Audit-APIs.md` §10.1.3) — a refresh attempt from an unrecognized fingerprint would require a fresh MFA challenge rather than a silent rotation.
- This would be implemented as an **additional check** alongside the existing refresh-token rotation/reuse-detection logic (Section 14.4), not a replacement for it — fully additive, no redesign required to adopt.

### 14.26 Session Security

| Role | Idle Timeout | Concurrent Session Handling |
|---|---|---|
| Citizen | 30 minutes | Multiple concurrent sessions permitted (e.g. mobile app + web) |
| Officer | 30 minutes | Multiple concurrent sessions permitted |
| Corporation Admin / Super Admin | 15 minutes | Tenant-configurable concurrent-session limit; "force logout of all sessions" available on password change or security incident (`API_SPECIFICATION.md` §2.8's `allDevices: true`) |

Session bookkeeping for concurrent-session limits and forced logout lives in Redis (`ARCHITECTURE.md` §16 "Sessions" usage) — the platform's authentication remains fundamentally stateless JWT (no server-rendered session), with Redis providing exactly the bookkeeping needed for these two specific Admin-security features, not a parallel session-management system.

### 14.27 Replay Protection

- **Access tokens**: inherently replay-*bounded* by their own 15-minute expiry (Section 14.3) — a captured access token has a small window of usefulness, further reduced by TLS-only transmission (Section 14.21) making capture itself difficult.
- **Refresh tokens**: explicit replay protection via single-use rotation and reuse-family revocation (Section 14.4) — this is the platform's primary anti-replay mechanism for its longest-lived credential.
- **OTP/MFA codes**: single-use by design (`API_SPECIFICATION.md` §2.2's `otp` validation — "single-use, 5-minute TTL"), with a bounded max-attempt count before the challenge itself is invalidated.
- **Idempotency-Key** (`API_SPECIFICATION.md` §1.5): while primarily a duplicate-submission control rather than a security replay-defense, it has the side benefit of making an accidentally-replayed `POST` (e.g. a network-layer retry) safe rather than double-executing a state change.
- **Not implemented in Phase-1**: request-level HMAC signing with nonce + timestamp (the pattern used by some webhook/B2B integrations) is reserved for the future API Key mechanism (Section 14.6) if/when external B2B integration is built — citizen/officer/admin JWT-based calls do not require this additional layer given the controls already in place above.

### 14.28 IP Restrictions

- **Not enforced by default** for Citizen/Officer access — citizens and field officers require access from arbitrary mobile network origins, and IP allow-listing would be operationally incompatible with that usage pattern.
- **Optional, tenant-configurable** for the highest-trust surfaces: Super Admin Provider Configuration (`06-Administration-APIs.md` §6.11.2) and cross-tenant operations may be restricted to a tenant-configured IP allow-list (e.g. a government office's known egress IP range) as an additional, optional control layered on top of — never instead of — the existing RBAC/MFA requirements for those endpoints.
- Enforcement, where enabled, happens at the API Gateway (Section 14.11), before the request reaches JWT verification — an out-of-range IP is rejected with `403 FORBIDDEN` before any credential is even evaluated.

### 14.29 API Monitoring

Restated from `ARCHITECTURE.md` §15 Observability Architecture, applied specifically to the API-security surface:

- **Metrics**: per-endpoint request rate/error rate/latency (RED method), authentication failure rate, rate-limit trigger frequency, `5xx` frequency by upstream dependency (`13-HTTP-Status-Codes.md` §13.5) — all exported Prometheus-style and visualized per `ARCHITECTURE.md` §15.
- **Alerting**: threshold-based alerts on SLA-breach-adjacent metrics already fixed in `ARCHITECTURE.md` §15, extended here to explicitly include: failed-login-rate spike (possible credential-stuffing attempt), `403`-rate spike on a specific endpoint (possible authorization-probing), and `502`/`503`/`504` frequency spike on a specific upstream provider (Section 13.5).
- **Correlation**: every metric and every alert is traceable back to individual requests via `X-Correlation-Id`/`X-Request-Id` (`API_SPECIFICATION.md` §1.14–§1.15), so a security-incident investigation can move from "the alert fired" to "these specific requests, from this specific actor" without a separate correlation exercise.

### 14.30 Security Best Practices

A consolidated checklist, cross-referencing every subsection above, for use in a pre-release security review of any *future* endpoint added to this API:

1. Does the endpoint derive `tenantId` exclusively from the JWT (Section 14.9–14.10), never from client input?
2. Is the Authorization requirement expressed as Role + Permission + Scope (Section 14.7), not an ad hoc check?
3. Is every input field schema-validated (Section 14.13) and, if free-text, sanitized (Section 14.15)?
4. Is every output value that will be rendered in a client UI correctly encoded for its context (Section 14.16)?
5. Does the endpoint's error response use the standard envelope (`API_SPECIFICATION.md` §12.2) without leaking internal detail (`13-HTTP-Status-Codes.md` §13.5.1)?
6. Is the endpoint rate-limited appropriately for its risk profile (Section 14.12, `13-HTTP-Status-Codes.md` §13.7)?
7. Does every state-changing call emit an audit event (Section 14.24)?
8. If the endpoint touches a file, does it go through the signed-URL/virus-scan pipeline (Section 14.23) rather than a direct path?
9. If the endpoint calls an external provider, is that provider a named, allow-listed `provider_config` entry (Section 14.17's API7 SSRF mitigation), never an arbitrary client-supplied URL?
10. Is the endpoint documented in the OpenAPI 3.1 contract (`16-API-Documentation-Standards.md` §16.2) before it ships, keeping the API inventory (Section 14.17's API9) accurate?

---

*(End of Section 14.)*



