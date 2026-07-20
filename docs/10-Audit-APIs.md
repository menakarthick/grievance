# API Specification Document — Section 10

## AI Powered Enterprise Citizen Service & Grievance Management Platform

> **Continuation note**: This file continues the API Specification from the end of the approved Section 9 (Reports APIs, `docs/09-Reports-APIs.md`). Sections 1–9 are not reproduced, summarized, or modified here. This file contains **only** Section 10 (Audit APIs) and is otherwise governed by the same design principles, error envelope, HTTP status code table, and security model already defined in `docs/API_SPECIFICATION.md` Sections 1, 12, 13, 14. No SQL, no Express routes, no controllers, no services, no database queries, no implementation code.

---

## 10. Audit APIs

Backed by the **Audit & Activity Logging Service** (`ARCHITECTURE.md` §3.1 #12). Every endpoint in this section is **read-only** (plus Section 10.12's export) — audit rows are written internally by every other service's state-changing action, never directly via a client-facing API, per the immutability principle already fixed in `DATABASE_DESIGN.md` §1 Principle 5 and §21. This section introduces **no new table** — it is a comprehensive API surface over the audit/security tables already approved in `DATABASE_DESIGN.md` §10 (`audit_log`, `activity_log`, `config_change_history`, `auth_event_log`) and §13 (`account_lockout_state`), plus the AI evidence tables in §9 (`ai_classification_result`, `ai_agent_invocation_log`, `pii_masking_log`), the workflow tables in §8 (`complaint_status_history`, `complaint_assignment`, `escalation_instance`, `approval_action`), the notification tables in §11, and the file tables in §12. Fully compatible with, and introducing no change to, the Business Requirements, `SRS.md`, `ARCHITECTURE.md`, `INFRASTRUCTURE_DEVOPS.md`, `DATABASE_DESIGN.md` v1.1, the AI Agent architecture, and API Specification Sections 1–9.

### 10.1 Audit Overview

#### 10.1.1 Design Note — One Audit Trail, Many Specialized Views

Sections 10.2–10.10 are **specialized, entity-scoped views** over the same underlying audit/history tables, mirroring exactly the design decision `DATABASE_DESIGN.md` §10 already makes for `config_change_history` ("a specialization of `audit_log`... powers an Admin Portal view directly, without scanning the generic audit log"). No section here introduces a parallel audit-writing mechanism — every write path is the one already fixed in `ARCHITECTURE.md` §11.5 and §4.1 (`SVC -.audit event.-> AUDITQ`).

#### 10.1.2 Immutability

Every record surfaced by this section is append-only: `audit_log`, `activity_log`, `config_change_history`, `auth_event_log`, `complaint_status_history` are never updated in place, only inserted (`DATABASE_DESIGN.md` §1 Principle 5, §21 exception list). No endpoint in Section 10 accepts a `PATCH`/`PUT`/`DELETE` against an audit record — the sole exception is the automated, logged retention-expiry purge (`DATABASE_DESIGN.md` §21), which is not a client-facing API at all.

#### 10.1.3 Captured Fields — What Every Audit Record Answers

| Concern | Field | Source |
|---|---|---|
| Who | `actorUserId` | `audit_log`, `activity_log`, `auth_event_log` |
| When | `createdAt` | every audit table |
| What | `action`, `entityType`, `entityId` | `audit_log` |
| Before | `changeSummary.before` (or `previousVersion` for config) | `audit_log`, `config_change_history` |
| After | `changeSummary.after` (or `newVersion` for config) | `audit_log`, `config_change_history` |
| IP Address | `ipAddress` | `activity_log`, `auth_event_log` |
| Device | `deviceFingerprint` | `activity_log` (conceptual attribute alongside the already-approved `ip_address`, consistent with `DATABASE_DESIGN.md` §10's "conceptual key attributes" notation) |
| Browser | `userAgent` | `activity_log` |
| Correlation ID | `correlationId` | every audit table (propagated from `API_SPECIFICATION.md` §1.14) |
| Request ID | `requestId` | every audit table (propagated from `API_SPECIFICATION.md` §1.15) |
| Session ID | `sessionId` | `auth_event_log`, `activity_log` |

#### 10.1.4 Specialized Trails Cross-Reference

| Trail | Subsection | Source Tables |
|---|---|---|
| AI Decision Trace | 10.7 | `ai_classification_result`, `ai_agent_invocation_log`, `pii_masking_log` |
| Workflow History | 10.6 | `complaint_status_history`, `complaint_assignment`, `escalation_instance`, `approval_action` |
| Login History | 10.4 | `auth_event_log`, `account_lockout_state` |
| Configuration Changes | 10.5 | `config_change_history` |

---

### 10.2 Audit Log APIs

The generic, immutable record of every state-changing action platform-wide (`DATABASE_DESIGN.md` §10 `audit_log`).

#### 10.2.1 List Audit Logs

| | |
|---|---|
| **Endpoint Name** | List Audit Logs |
| **Purpose** | Search the immutable, generic audit trail of every state-changing action platform-wide |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/audit-logs` |
| **Authentication** | Yes |
| **Authorization** | Department Admin (scoped to own department's entities) / Corporation Admin (tenant-wide) / Super Admin (cross-tenant) |
| **Request Headers** | `Authorization: Bearer <jwt>`; `X-Correlation-Id` (optional) |
| **Request Parameters** | `?entityType=`, `?entityId=`, `?actorUserId=`, `?action=`, `?filter[createdAt][gte]=`, `?filter[createdAt][lte]=`, `?sort=-createdAt` (default), `?cursor=`, `?limit=` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "id", "actorUserId", "action", "entityType", "entityId", "changeSummary", "correlationId", "createdAt" } ], "meta": { "pagination": { "nextCursor", "hasMore" } } }` |
| **Validation Rules** | `limit`: max 200; unrecognized query field → `400` |
| **Business Rules** | Results are always excluded of any raw citizen PII — `changeSummary` carries field-level before/after values only for non-PII fields, per the masking principle already fixed in `ARCHITECTURE.md` §8.2 |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` (scope) |
| **HTTP Status Codes** | `200`, `400`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable (`GET`) |
| **Related Database Entities** | `audit_log` |
| **Related Functional Module** | SRS §3.4 Admin Module — Audit Logs |
| **Related AI Agent** | None |
| **Audit Requirements** | Reading the audit log is itself a sensitive action; large/bulk reads (e.g. `limit=200` repeated across many pages) are themselves logged to `activity_log` as `activityType = 'audit_log_bulk_read'` |
| **Security Considerations** | Response never includes raw PII; tenant/scope isolation enforced server-side (OWASP A01) |

#### 10.2.2 Get Audit Log Detail

| | |
|---|---|
| **Endpoint Name** | Get Audit Log Detail |
| **Purpose** | Retrieve full detail for a single audit log entry |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/audit-logs/{auditLogId}` |
| **Authentication** | Yes |
| **Authorization** | Same scope rule as Section 10.2.1 |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `auditLogId` |
| **Request Body** | None |
| **Response Body** | `{ "id", "actorUserId", "actorName", "action", "entityType", "entityId", "changeSummary", "correlationId", "requestId", "createdAt" }` |
| **Validation Rules** | `auditLogId`: must exist and be within the caller's scope |
| **Business Rules** | Same PII-exclusion rule as Section 10.2.1 |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 AUDIT_LOG_NOT_FOUND` |
| **HTTP Status Codes** | `200`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `audit_log` |
| **Related Functional Module** | SRS §3.4 Admin Module — Audit Logs |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited beyond the bulk-read note in Section 10.2.1 |
| **Security Considerations** | Same PII exclusion and scope enforcement as Section 10.2.1 |

---

### 10.3 User Activity APIs

Broader activity/security monitoring, distinct from the business-data-change audit trail (`DATABASE_DESIGN.md` §10 `activity_log`).

#### 10.3.1 List User Activity

| | |
|---|---|
| **Endpoint Name** | List User Activity |
| **Purpose** | Search activity/security monitoring events — login attempts, session activity, bulk-read flags |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/activity-logs` |
| **Authentication** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | `?actorUserId=`, `?activityType=`, `?ipAddress=`, `?filter[createdAt][gte]=`, `?filter[createdAt][lte]=`, `?cursor=`, `?limit=` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "id", "actorUserId", "activityType", "ipAddress", "deviceFingerprint", "userAgent", "createdAt" } ], "meta": { "pagination" } }` |
| **Validation Rules** | `limit`: max 200 |
| **Business Rules** | None beyond scope |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `activity_log` |
| **Related Functional Module** | `ARCHITECTURE.md` §11.5 Audit Logging — Activity Monitoring |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | IP/device/browser fields are PII-adjacent — access restricted to Corporation Admin/Super Admin only, not delegated to Department Admin |

#### 10.3.2 Get User Activity Detail

| | |
|---|---|
| **Endpoint Name** | Get User Activity Detail |
| **Purpose** | Retrieve full detail for a single activity event |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/activity-logs/{activityLogId}` |
| **Authentication** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `activityLogId` |
| **Request Body** | None |
| **Response Body** | `{ "id", "actorUserId", "activityType", "ipAddress", "deviceFingerprint", "userAgent", "sessionId", "correlationId", "createdAt" }` |
| **Validation Rules** | `activityLogId`: must exist |
| **Business Rules** | None |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 ACTIVITY_LOG_NOT_FOUND` |
| **HTTP Status Codes** | `200`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `activity_log` |
| **Related Functional Module** | `ARCHITECTURE.md` §11.5 Audit Logging — Activity Monitoring |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | Same PII-adjacent access restriction as Section 10.3.1 |

#### 10.3.3 Get User Activity Timeline

| | |
|---|---|
| **Endpoint Name** | Get User Activity Timeline |
| **Purpose** | Retrieve a single user's full activity history in one aggregated, chronological view, for an investigation ("what did this account do over the last 30 days") |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/activity-logs/users/{userId}/timeline` |
| **Authentication** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `userId`; `?periodStart=` (required), `?periodEnd=` (required), `?cursor=`, `?limit=` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "activityType", "ipAddress", "createdAt" } ], "meta": { "pagination" } }` |
| **Validation Rules** | `periodStart`/`periodEnd`: required, max 12-month range per call |
| **Business Rules** | Merges `activity_log` and `auth_event_log` rows for this user into one chronological stream |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 USER_NOT_FOUND` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `activity_log`, `auth_event_log` |
| **Related Functional Module** | `ARCHITECTURE.md` §11.5 Audit Logging — Activity Monitoring |
| **Related AI Agent** | None |
| **Audit Requirements** | `audit_log` entry recording that an Admin pulled a full activity timeline for a specific user (an investigation-grade access, logged for accountability) |
| **Security Considerations** | Access to another individual's full activity timeline is itself a sensitive action, hence the audit requirement above |

---

### 10.4 Login Audit APIs

Login, logout, MFA, failed-attempt, and password-reset events (`DATABASE_DESIGN.md` §10 `auth_event_log`).

#### 10.4.1 List Login History

| | |
|---|---|
| **Endpoint Name** | List Login History |
| **Purpose** | View login/logout/MFA/failed-attempt/password-reset event history for a user |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/audit/login-history` |
| **Authentication** | Yes |
| **Authorization** | Any user (own history only) / Corporation Admin / Super Admin (any user via `?userId=`) |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | `?userId=` (Admin only), `?eventType=login\|logout\|mfa_challenge\|failed_attempt\|password_reset`, `?cursor=`, `?limit=` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "id", "eventType", "ipAddress", "success", "createdAt" } ], "meta": { "pagination" } }` |
| **Validation Rules** | Non-Admin callers are always scoped to their own `userId` regardless of any `userId` supplied |
| **Business Rules** | None beyond scope enforcement |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `auth_event_log` |
| **Related Functional Module** | SRS §8.1 Authentication & Session Security Policy |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited for self-view; `audit_log` entry when an Admin views another user's login history |
| **Security Considerations** | Self-scoping enforced server-side from the JWT |

#### 10.4.2 Get Login Audit Detail

| | |
|---|---|
| **Endpoint Name** | Get Login Audit Detail |
| **Purpose** | Retrieve full detail for a single login/auth event |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/audit/login-history/{authEventId}` |
| **Authentication** | Yes |
| **Authorization** | Owning user / Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `authEventId` |
| **Request Body** | None |
| **Response Body** | `{ "id", "eventType", "ipAddress", "deviceFingerprint", "userAgent", "success", "failureReason"?, "sessionId", "createdAt" }` |
| **Validation Rules** | `authEventId`: must exist and belong to the caller (or the caller must be Admin) |
| **Business Rules** | None |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 AUTH_EVENT_NOT_FOUND` |
| **HTTP Status Codes** | `200`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `auth_event_log` |
| **Related Functional Module** | SRS §8.1 Authentication & Session Security Policy |
| **Related AI Agent** | None |
| **Audit Requirements** | `audit_log` entry when an Admin views another user's event detail |
| **Security Considerations** | Ownership/scope check enforced server-side |

#### 10.4.3 Get Failed Login Attempts Report

| | |
|---|---|
| **Endpoint Name** | Get Failed Login Attempts Report |
| **Purpose** | Aggregate view of failed login attempts and lockouts across the tenant, for security monitoring |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/audit/login-history/failed-attempts` |
| **Authentication** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | `?periodStart=` (required), `?periodEnd=` (required), `?minAttempts=` (default 3) |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "userId", "username", "failedAttemptCount", "currentlyLocked": "boolean", "lastAttemptAt" } ] }` |
| **Validation Rules** | `periodStart`/`periodEnd`: required |
| **Business Rules** | Cross-references `account_lockout_state` for current lock status alongside the historical `auth_event_log` count |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `auth_event_log`, `account_lockout_state` |
| **Related Functional Module** | SRS §8.1 Authentication & Session Security Policy — Account Lockout |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited (a security-monitoring read) |
| **Security Considerations** | This report is itself a security-sensitive surface (reveals which accounts are under attack) — restricted to the two highest Admin tiers |

---
### 10.5 Configuration Audit APIs

Specialization of the Audit Log scoped to `*_config` table changes (`DATABASE_DESIGN.md` §10 `config_change_history`), already cross-referenced from `06-Administration-APIs.md` §6.6.4/§6.7.4/§6.8.4.

#### 10.5.1 List Configuration Changes

| | |
|---|---|
| **Endpoint Name** | List Configuration Changes |
| **Purpose** | View the version history of any tenant configuration table (SLA rules, escalation matrix, approval workflow, notification templates, tenant settings, feature flags, providers) |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/audit/configuration-changes` |
| **Authentication** | Yes |
| **Authorization** | Department Admin (within scope) / Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | `?configTableName=` (e.g. `sla_rule_config`), `?configRowId=`, `?changedBy=`, `?cursor=`, `?limit=` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "configTableName", "configRowId", "previousVersion", "newVersion", "changedBy": { "id", "name" }, "createdAt" } ], "meta": { "pagination" } }` |
| **Validation Rules** | `limit`: max 200 |
| **Business Rules** | None beyond scope |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `config_change_history` |
| **Related Functional Module** | SRS §3.4 Admin Module; `DATABASE_DESIGN.md` §22 Versioning Strategy |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited (read-only) |
| **Security Considerations** | None beyond standard RBAC |

#### 10.5.2 Get Configuration Change Detail

| | |
|---|---|
| **Endpoint Name** | Get Configuration Change Detail |
| **Purpose** | Retrieve the full before/after diff for a single configuration change |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/audit/configuration-changes/{configChangeId}` |
| **Authentication** | Yes |
| **Authorization** | Department Admin (within scope) / Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `configChangeId` |
| **Request Body** | None |
| **Response Body** | `{ "configTableName", "configRowId", "previousVersion": { "...full prior row..." }, "newVersion": { "...full new row..." }, "changedBy": { "id", "name" }, "createdAt" }` |
| **Validation Rules** | `configChangeId`: must exist and be within scope |
| **Business Rules** | This is the full "before/after" view referenced in Section 10.1.3 — the list endpoint (10.5.1) intentionally omits the full row bodies to keep list payloads light |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 CONFIG_CHANGE_NOT_FOUND` |
| **HTTP Status Codes** | `200`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `config_change_history` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §22 Versioning Strategy |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | None beyond standard RBAC |

---

### 10.6 Workflow Audit APIs

The complaint workflow trail — status transitions, assignments, escalations, and approvals (`DATABASE_DESIGN.md` §8 `complaint_status_history`, `complaint_assignment`, `escalation_instance`, `approval_action`) — distinct from `API_SPECIFICATION.md` §4.6's citizen-facing Complaint Timeline (a narrower, status-only view); this is the full, unredacted internal audit equivalent.

#### 10.6.1 List Workflow History

| | |
|---|---|
| **Endpoint Name** | List Workflow History |
| **Purpose** | Search the full workflow audit trail across complaints — every status change, (re)assignment, escalation, and approval action |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/audit/workflow-history` |
| **Authentication** | Yes |
| **Authorization** | Department Admin (within scope) / Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | `?complaintId=`, `?eventType=status_change\|assignment\|escalation\|approval`, `?actorUserId=`, `?filter[createdAt][gte]=`, `?filter[createdAt][lte]=`, `?cursor=`, `?limit=` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "complaintId", "eventType", "fromValue", "toValue", "actorUserId", "note"?, "createdAt" } ], "meta": { "pagination" } }` |
| **Validation Rules** | `limit`: max 200 |
| **Business Rules** | Merges four source tables into one chronological event stream per complaint |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `complaint_status_history`, `complaint_assignment`, `escalation_instance`, `approval_action` |
| **Related Functional Module** | SRS §3.3 Officer Module; §3.4 Admin Module — Escalation Matrix, Approval Workflow |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited (read-only over already-immutable tables) |
| **Security Considerations** | Scope enforced server-side — a Department Admin sees only their own department's complaints |

#### 10.6.2 Get Workflow Audit Detail for a Complaint

| | |
|---|---|
| **Endpoint Name** | Get Workflow Audit Detail for a Complaint |
| **Purpose** | Retrieve the complete, unredacted workflow trail for one specific complaint — the Admin/investigation-grade counterpart to `API_SPECIFICATION.md` §4.6 |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/audit/workflow-history/complaints/{complaintId}` |
| **Authentication** | Yes |
| **Authorization** | Department Admin (within scope) / Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `complaintId` |
| **Request Body** | None |
| **Response Body** | `{ "complaintId", "events": [ { "eventType", "fromValue", "toValue", "actorUserId", "actorName", "note"?, "createdAt" } ] }` |
| **Validation Rules** | `complaintId`: must exist and be within scope |
| **Business Rules** | Includes internal-only detail intentionally omitted from the citizen-facing Complaint Timeline (e.g. which specific Admin reassigned the complaint and why) |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 COMPLAINT_NOT_FOUND` |
| **HTTP Status Codes** | `200`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `complaint_status_history`, `complaint_assignment`, `escalation_instance`, `approval_action` |
| **Related Functional Module** | SRS §3.3 Officer Module |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | Scope enforced server-side |

---

### 10.7 AI Decision Audit APIs

The AI Decision Trace (`DATABASE_DESIGN.md` §9 `ai_classification_result`, `ai_agent_invocation_log`, `pii_masking_log`) — evidence of what the AI layer did, without ever exposing raw PII, exactly as that section's original design intent states.

#### 10.7.1 List AI Decision Trace

| | |
|---|---|
| **Endpoint Name** | List AI Decision Trace |
| **Purpose** | Search AI classification/invocation/masking evidence records, for AI-governance review |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/audit/ai-decisions` |
| **Authentication** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | `?complaintId=`, `?agentType=complaint\|officer_ai\|analytics\|voice`, `?filter[createdAt][gte]=`, `?filter[createdAt][lte]=`, `?cursor=`, `?limit=` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "id", "complaintId"?, "agentType", "providerName", "confidenceScore"?, "piiTypesDetected"?: ["string"], "createdAt" } ], "meta": { "pagination" } }` |
| **Validation Rules** | `limit`: max 200 |
| **Business Rules** | `piiTypesDetected` is always a list of type codes (e.g. `aadhaar`, `pan`, `mobile`) — never the underlying PII value, per the `pii_masking_log` design intent (`DATABASE_DESIGN.md` §9) |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `ai_classification_result`, `ai_agent_invocation_log`, `pii_masking_log` |
| **Related Functional Module** | SRS §3.5 AI Agent Layer; §10 AI Data Privacy Requirements |
| **Related AI Agent** | Complaint Agent / Officer AI Agent / Analytics Agent / Voice Agent (whichever produced the evidence row) |
| **Audit Requirements** | Access to this endpoint is itself compliance-relevant and logged to `audit_log` (evidence of who reviewed AI governance evidence) |
| **Security Considerations** | Never returns unmasked PII, prompt content, or raw model output — only the governance metadata already defined in `DATABASE_DESIGN.md` §9 |

#### 10.7.2 Get AI Decision Detail

| | |
|---|---|
| **Endpoint Name** | Get AI Decision Detail |
| **Purpose** | Retrieve full detail for a single AI decision/invocation event |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/audit/ai-decisions/{aiDecisionId}` |
| **Authentication** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `aiDecisionId` |
| **Request Body** | None |
| **Response Body** | `{ "id", "complaintId"?, "agentType", "providerName", "promptTokenCount", "responseTokenCount", "latencyMs", "status", "piiTypesDetected"?: ["string"], "createdAt" }` |
| **Validation Rules** | `aiDecisionId`: must exist |
| **Business Rules** | Same PII-exclusion rule as Section 10.7.1 |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 AI_DECISION_NOT_FOUND` |
| **HTTP Status Codes** | `200`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `ai_agent_invocation_log`, `ai_classification_result`, `pii_masking_log` |
| **Related Functional Module** | SRS §3.5 AI Agent Layer |
| **Related AI Agent** | Same as Section 10.7.1 |
| **Audit Requirements** | Logged to `audit_log` (same rationale as Section 10.7.1) |
| **Security Considerations** | Same PII-exclusion rule as Section 10.7.1 |

---

### 10.8 Notification Audit APIs

Cross-references `08-Notification-APIs.md` §8.10 (Notification History) rather than duplicating its contract — this subsection adds the Admin **audit-governance** framing (who dispatched what, including Emergency Overrides) on top of that already-approved recipient-facing history.

#### 10.8.1 List Notification Audit Trail

| | |
|---|---|
| **Endpoint Name** | List Notification Audit Trail |
| **Purpose** | Search notification dispatch decisions platform-wide, including which were Emergency Overrides (`08-Notification-APIs.md` §8.8.4) |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/audit/notifications` |
| **Authentication** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | `?channel=`, `?overrideOnly=boolean`, `?actorUserId=`, `?filter[createdAt][gte]=`, `?filter[createdAt][lte]=`, `?cursor=`, `?limit=` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "notificationDispatchId", "channel", "actorUserId"?, "wasEmergencyOverride": "boolean", "justification"?, "createdAt" } ], "meta": { "pagination" } }` |
| **Validation Rules** | `limit`: max 200 |
| **Business Rules** | `actorUserId`/`justification` populated only for Admin-initiated dispatches (manual sends, broadcasts, overrides); system/event-driven dispatches show `actorUserId = null` |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `notification_dispatch`, `notification_event`, `audit_log` |
| **Related Functional Module** | `ARCHITECTURE.md` §10 Notification Architecture |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited (this endpoint itself reads the audit trail) |
| **Security Considerations** | None beyond standard RBAC |

#### 10.8.2 Get Notification Audit Detail

| | |
|---|---|
| **Endpoint Name** | Get Notification Audit Detail |
| **Purpose** | Retrieve full audit detail for a single notification dispatch decision |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/audit/notifications/{notificationDispatchId}` |
| **Authentication** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `notificationDispatchId` |
| **Request Body** | None |
| **Response Body** | `{ "notificationDispatchId", "channel", "actorUserId"?, "actorName"?, "wasEmergencyOverride": "boolean", "justification"?, "recipientPreferenceAtSendTime", "createdAt" }` |
| **Validation Rules** | `notificationDispatchId`: must exist |
| **Business Rules** | `recipientPreferenceAtSendTime` shows the recipient's stored channel preference at the moment of dispatch, so an auditor can independently confirm whether an override was actually necessary |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOTIFICATION_NOT_FOUND` |
| **HTTP Status Codes** | `200`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `notification_dispatch`, `notification_preference`, `audit_log` |
| **Related Functional Module** | `ARCHITECTURE.md` §10 Notification Architecture |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | None beyond standard RBAC |

---

### 10.9 File Audit APIs

Cross-references `11-File-Management-APIs.md` §11.15 (File Audit APIs) for the file-scoped view; this subsection is the tenant-wide, cross-file search surface.

#### 10.9.1 List File Access Audit

| | |
|---|---|
| **Endpoint Name** | List File Access Audit |
| **Purpose** | Search file upload/download/delete/access events tenant-wide |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/audit/files` |
| **Authentication** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | `?fileAssetId=`, `?actorUserId=`, `?action=upload\|download\|delete\|preview`, `?filter[createdAt][gte]=`, `?filter[createdAt][lte]=`, `?cursor=`, `?limit=` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "fileAssetId", "action", "actorUserId", "ipAddress", "createdAt" } ], "meta": { "pagination" } }` |
| **Validation Rules** | `limit`: max 200 |
| **Business Rules** | None |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `audit_log`, `file_asset` |
| **Related Functional Module** | `ARCHITECTURE.md` §19 File Storage Architecture |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited (read-only over the audit trail) |
| **Security Considerations** | None beyond standard RBAC |

#### 10.9.2 Get File Audit Detail

| | |
|---|---|
| **Endpoint Name** | Get File Audit Detail |
| **Purpose** | Retrieve full audit detail for a single file access event |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/audit/files/{fileAuditId}` |
| **Authentication** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `fileAuditId` |
| **Request Body** | None |
| **Response Body** | `{ "fileAssetId", "action", "actorUserId", "actorName", "ipAddress", "createdAt" }` |
| **Validation Rules** | `fileAuditId`: must exist |
| **Business Rules** | None |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 FILE_AUDIT_NOT_FOUND` |
| **HTTP Status Codes** | `200`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `audit_log`, `file_asset` |
| **Related Functional Module** | `ARCHITECTURE.md` §19 File Storage Architecture |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | None beyond standard RBAC |

---

### 10.10 Security Audit APIs

Security-specific events — failed logins, lockouts, MFA challenges, permission changes (`DATABASE_DESIGN.md` §10 `auth_event_log`, §13 `account_lockout_state`, `role_permission`).

#### 10.10.1 List Security Events

| | |
|---|---|
| **Endpoint Name** | List Security Events |
| **Purpose** | Search security-relevant events — lockouts, MFA enrollment/reset, permission grants/revocations, provider credential changes |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/audit/security-events` |
| **Authentication** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | `?eventType=lockout\|mfa_reset\|permission_change\|provider_credential_change`, `?actorUserId=`, `?filter[createdAt][gte]=`, `?filter[createdAt][lte]=`, `?cursor=`, `?limit=` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "eventType", "actorUserId"?, "targetUserId"?, "createdAt" } ], "meta": { "pagination" } }` |
| **Validation Rules** | `limit`: max 200 |
| **Business Rules** | None |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `auth_event_log`, `account_lockout_state`, `role_permission` |
| **Related Functional Module** | SRS §8 Security Requirements |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited (read-only) |
| **Security Considerations** | Restricted to the two highest Admin tiers — this endpoint is itself a high-value target for an attacker probing security posture |

#### 10.10.2 Get Security Event Detail

| | |
|---|---|
| **Endpoint Name** | Get Security Event Detail |
| **Purpose** | Retrieve full detail for a single security event |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/audit/security-events/{securityEventId}` |
| **Authentication** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `securityEventId` |
| **Request Body** | None |
| **Response Body** | `{ "eventType", "actorUserId"?, "actorName"?, "targetUserId"?, "targetName"?, "ipAddress", "createdAt" }` |
| **Validation Rules** | `securityEventId`: must exist |
| **Business Rules** | None |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 SECURITY_EVENT_NOT_FOUND` |
| **HTTP Status Codes** | `200`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `auth_event_log`, `account_lockout_state` |
| **Related Functional Module** | SRS §8 Security Requirements |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | Same restriction as Section 10.10.1 |

---
### 10.11 Audit Search APIs

#### 10.11.1 Global Audit Search

| | |
|---|---|
| **Endpoint Name** | Global Audit Search |
| **Purpose** | Free-text/cross-entity search across every specialized audit trail in Sections 10.2–10.10 in one call, for an investigator who does not yet know which specific trail holds the answer |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/audit/search` |
| **Authentication** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | `?q=` (required, free-text, `API_SPECIFICATION.md` §1.11), `?trails=audit_log,activity_log,auth_event_log,config_change_history,workflow,ai_decision,notification,file,security` (optional filter to a subset), `?filter[createdAt][gte]=`, `?filter[createdAt][lte]=`, `?cursor=`, `?limit=` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "trail", "id", "summary", "actorUserId"?, "entityType"?, "entityId"?, "createdAt" } ], "meta": { "pagination" } }` |
| **Validation Rules** | `q`: required, minimum 3 characters; `limit`: max 200 |
| **Business Rules** | Backed by MySQL `FULLTEXT` in Phase-1, transparently upgraded to OpenSearch/Elasticsearch in later phases (`DATABASE_DESIGN.md` §31), with no client-facing contract change across that backend swap — identical phasing to the platform's other search surfaces |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `audit_log`, `activity_log`, `auth_event_log`, `config_change_history` (plus the workflow/AI/notification/file source tables listed in Section 10.1.4) |
| **Related Functional Module** | `DATABASE_DESIGN.md` §31 Enterprise Search Architecture |
| **Related AI Agent** | None |
| **Audit Requirements** | `audit_log` entry recording the search query and requesting Admin — a cross-trail investigation search is itself a compliance-relevant action |
| **Security Considerations** | Restricted to the two highest Admin tiers; results never include raw PII regardless of which trail they originate from |

---

### 10.12 Audit Export APIs

#### 10.12.1 Export Audit Logs

| | |
|---|---|
| **Endpoint Name** | Export Audit Logs |
| **Purpose** | Export any of the audit trails in Sections 10.2–10.11 as CSV/PDF for offline/compliance use |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/audit/export` |
| **Authentication** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>`; `Idempotency-Key` (optional) |
| **Request Parameters** | `?trail=` (required, one of Section 10.1.4's trail keys or `audit_log`/`activity_log`/`login_history`/`configuration_changes`/`security_events`), `?format=csv\|pdf` (required), plus that trail's own filters |
| **Request Body** | None |
| **Response Body** | `202 Accepted`: `{ "exportJobId", "status": "queued" }` |
| **Validation Rules** | `trail`/`format`: required |
| **Business Rules** | Large exports are generated asynchronously via the Scheduler (`ARCHITECTURE.md` §17); the resulting artifact is a `file_asset`, retrieved via `11-File-Management-APIs.md` §11.2 |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `429 RATE_LIMITED` |
| **HTTP Status Codes** | `202`, `400`, `401`, `403`, `429` |
| **Rate Limiting** | Export-generation throttling |
| **Idempotency** | `Idempotency-Key` honored (24-hour TTL) |
| **Related Database Entities** | `file_asset` (the generated export artifact) |
| **Related Functional Module** | SRS §3.4 Admin Module — Audit Logs |
| **Related AI Agent** | None |
| **Audit Requirements** | Mandatory `audit_log` entry recording the export request, trail, filters, and requesting Admin — exporting audit evidence is itself a compliance-relevant action requiring its own trail |
| **Security Considerations** | Export artifact inherits the same signed-URL, virus-scan, and retention rules as any other `file_asset` (`API_SPECIFICATION.md` §11); the export itself is never left unencrypted at rest |

#### 10.12.2 Get Audit Export Job Status

| | |
|---|---|
| **Endpoint Name** | Get Audit Export Job Status |
| **Purpose** | Poll the status of an asynchronous audit export job |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/audit/export/{exportJobId}` |
| **Authentication** | Yes |
| **Authorization** | The requesting Admin (own export job) |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `exportJobId` |
| **Request Body** | None |
| **Response Body** | `{ "exportJobId", "status": "queued" \| "processing" \| "completed" \| "failed", "fileAssetId"? }` |
| **Validation Rules** | `exportJobId`: must exist and belong to the caller |
| **Business Rules** | None beyond ownership check |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 EXPORT_JOB_NOT_FOUND` |
| **HTTP Status Codes** | `200`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `file_asset` |
| **Related Functional Module** | `ARCHITECTURE.md` §17 Scheduler Architecture |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | Ownership check enforced server-side |

---

### 10.13 Compliance APIs

Structured views mapping directly onto SRS §9 Compliance Requirements (CERT-In, GIGW, OWASP Top 10, DPDP Act, STQC readiness).

#### 10.13.1 Get Compliance Report

| | |
|---|---|
| **Endpoint Name** | Get Compliance Report |
| **Purpose** | Generate a compliance evidence report for a specific framework (e.g. DPDP data-subject-access readiness, audit-trail completeness) |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/audit/compliance-reports/{reportType}` |
| **Authentication** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `reportType` (e.g. `dpdp-readiness`, `audit-completeness`, `owasp-mapping`); `?periodStart=`, `?periodEnd=` |
| **Request Body** | None |
| **Response Body** | `{ "reportType", "generatedAt", "sections": [ { "title", "status": "compliant" \| "attention_required", "detail" } ] }` |
| **Validation Rules** | `reportType`: required, must be one of Section 10.13.2's recognized types |
| **Business Rules** | This report is a structured *evidence summary* over already-approved controls (`ARCHITECTURE.md` §11.3 OWASP mapping, SRS §9) — it does not itself claim certification, matching SRS §9's "design for certifiability, not a claim of certification" |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 REPORT_TYPE_NOT_FOUND` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `audit_log`, `config_change_history`, `auth_event_log`, `pii_masking_log` |
| **Related Functional Module** | SRS §9 Compliance Requirements |
| **Related AI Agent** | None |
| **Audit Requirements** | `audit_log` entry recording the compliance-report generation and requesting Admin |
| **Security Considerations** | Restricted to the two highest Admin tiers |

#### 10.13.2 List Compliance Report Types

| | |
|---|---|
| **Endpoint Name** | List Compliance Report Types |
| **Purpose** | Retrieve the catalog of available compliance report types |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/audit/compliance-reports` |
| **Authentication** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | None |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "reportType", "title", "framework": "CERT-In" \| "GIGW" \| "OWASP" \| "DPDP" \| "STQC" } ] }` |
| **Validation Rules** | None (read-only) |
| **Business Rules** | None |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | None (static catalog) |
| **Related Functional Module** | SRS §9 Compliance Requirements |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | None beyond standard RBAC |

---

### 10.14 Audit Retention APIs

Read-only views over the retention policy already fixed in `DATABASE_DESIGN.md` §23 (Data Retention Strategy) — this section never modifies retention behavior, it only reports on it; the retention/purge mechanism itself remains the automated Cleanup Job already approved in `ARCHITECTURE.md` §17.

#### 10.14.1 Get Retention Policy

| | |
|---|---|
| **Endpoint Name** | Get Retention Policy |
| **Purpose** | Retrieve the tenant's currently effective retention periods per data category |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/audit/retention-policy` |
| **Authentication** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | None |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "dataCategory": "complaint_records" \| "audit_logs" \| "voice_recordings" \| "uploaded_documents", "retentionYears" } ] }` |
| **Validation Rules** | None (read-only) |
| **Business Rules** | Values reflect the fixed periods in `DATABASE_DESIGN.md` §23 (10 years for complaint records/audit logs/documents, 5 years for voice) — not tenant-editable below the SRS §4.3 floor |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | None (policy is a fixed system constant per `DATABASE_DESIGN.md` §23, not a configurable table row) |
| **Related Functional Module** | SRS §4.3 Data Retention; `DATABASE_DESIGN.md` §23 Data Retention Strategy |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | None beyond standard RBAC |

#### 10.14.2 Get Retention Status Report

| | |
|---|---|
| **Endpoint Name** | Get Retention Status Report |
| **Purpose** | Report which records are approaching their retention-expiry purge date, for advance visibility before the automated Cleanup Job runs |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/audit/retention-status` |
| **Authentication** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | `?dataCategory=`, `?withinDays=` (default 90) |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "dataCategory", "recordCount", "earliestPurgeDate" } ] }` |
| **Validation Rules** | `withinDays`: positive integer, max 3650 |
| **Business Rules** | Purely informational — this endpoint never triggers a purge; the only purge path remains the automated, audited Cleanup Job (`ARCHITECTURE.md` §17, `DATABASE_DESIGN.md` §21) |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `complaint`, `audit_log`, `file_asset` (retention-anchored tables per `DATABASE_DESIGN.md` §23) |
| **Related Functional Module** | `DATABASE_DESIGN.md` §23 Data Retention Strategy |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | Aggregate counts only — no individual record content exposed |

---

### 10.15 Audit Dashboard APIs

#### 10.15.1 Get Audit Dashboard Summary

| | |
|---|---|
| **Endpoint Name** | Get Audit Dashboard Summary |
| **Purpose** | Composite summary of audit/security posture — recent failed logins, lockouts, config changes, AI overrides, and pending compliance attention items — for an Admin Portal Audit Dashboard landing view |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/audit/dashboard` |
| **Authentication** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | `?periodStart=`, `?periodEnd=` (defaults to last 7 days) |
| **Request Body** | None |
| **Response Body** | `{ "failedLoginCount", "activeLockoutCount", "configChangeCount", "emergencyOverrideCount", "complianceAttentionItems": [ { "reportType", "title" } ], "generatedAt" }` |
| **Validation Rules** | `periodEnd` ≥ `periodStart` if both supplied |
| **Business Rules** | Aggregates across every trail in Sections 10.2–10.13 into one landing-page summary |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `auth_event_log`, `account_lockout_state`, `config_change_history`, `notification_dispatch` |
| **Related Functional Module** | SRS §3.4 Admin Module — Audit Logs |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited (read-only aggregate) |
| **Security Considerations** | Restricted to the two highest Admin tiers |

---

*(End of Section 10.)*


