# API Specification Document — Section 9

## AI Powered Enterprise Citizen Service & Grievance Management Platform

> **Continuation note**: This file continues the API Specification from the end of the approved Section 8 (Notification APIs, `docs/08-Notification-APIs.md`). Sections 1–8 are not reproduced, summarized, or modified here. This file contains **only** Section 9 (Reports APIs) and is otherwise governed by the same design principles, error envelope, HTTP status code table, and security model already defined in `docs/API_SPECIFICATION.md` Sections 1, 12, 13, 14. No SQL, no Express routes, no controllers, no services, no database queries, no implementation code.

---

## 9. Reports APIs

Backed by the **Analytics & Reporting Service** (`ARCHITECTURE.md` §3.1 #11), reading from the pre-aggregated Reporting Tables (`DATABASE_DESIGN.md` §14: `daily_complaint_summary`, `weekly_officer_performance`, `monthly_department_report`/`monthly_district_report`, `trend_snapshot`) rather than live-aggregating transaction tables — the same denormalization rationale already fixed in `DATABASE_DESIGN.md` §17. This section is fully compatible with, and introduces no change to, the Business Requirements, `SRS.md`, `ARCHITECTURE.md`, `INFRASTRUCTURE_DEVOPS.md`, `DATABASE_DESIGN.md` v1.1, the AI Agent architecture, and API Specification Sections 1–8.

### 9.1 Reports Overview

#### 9.1.1 Design Note — What Is Live-Queried vs. Pre-Aggregated vs. Newly Proposed

- **Live-queried, no new table**: report list/detail views (9.3–9.9) read directly from the existing Reporting Tables (`DATABASE_DESIGN.md` §14) plus `complaint`, `sla_tracking`, `complaint_feedback`, `notification_dispatch`, and `geo_analytics_snapshot` (`DATABASE_DESIGN.md` §26). No report-data table is invented by this section.
- **Report Permissions (9.14)**: modeled entirely as `resource = 'report'` rows in the already-approved global `permission` catalog, granted via the existing `role_permission`/`user_role_assignment` tables (`DATABASE_DESIGN.md` §5, §13, `ARCHITECTURE.md` §11.2) — no new table.
- **Report Statistics (9.15)**: modeled as `activity_type = 'report_generated'` rows in the existing `activity_log` table (`DATABASE_DESIGN.md` §10) — no new table.
- **Genuinely new persistence, explicitly flagged**: **Scheduled Reports** (9.11) and **Report Templates** (9.12) need durable state (a cron schedule + recipient list; a saved filter/column set) that does not fit any existing v1.0/v1.1 table. This document proposes `report_schedule_config` and `report_template_config` — both following the **exact, already-approved `*_config` versioned-table pattern** (`DATABASE_DESIGN.md` §7, §22), not a new architectural pattern. **Report Sharing** (9.13) proposes one polymorphic grant table, `resource_share` (`sharedEntityType` + `sharedEntityId`), reusing the polymorphic-reference pattern already established for `file_asset`, `audit_log`, and `embedding_vector` (`DATABASE_DESIGN.md` §12, §10, §34) — the same `resource_share` table is reused by File Sharing (`11-File-Management-APIs.md` §11.6), avoiding two parallel sharing mechanisms. **All three are proposed, pending a future Database Architecture v1.2 addendum** — nothing in the frozen `DATABASE_DESIGN.md` v1.1 is altered, and no new pattern is introduced, only new instances of patterns v1.1 already establishes.

#### 9.1.2 Dashboard Widgets & KPIs

| Widget/KPI | Source |
|---|---|
| Open Complaint Count | `daily_complaint_summary` |
| Resolved Complaint Count | `daily_complaint_summary` |
| SLA Breach Rate | `sla_tracking`, `daily_complaint_summary` |
| Average Resolution Time | `monthly_department_report` |
| Officer Workload | `officer_workload` (`DATABASE_DESIGN.md` §8) |
| Citizen Satisfaction Score | `complaint_feedback` |
| Notification Delivery Rate | `notification_dispatch` (`08-Notification-APIs.md` §8.15) |
| Complaint Density by Ward | `geo_analytics_snapshot` (`07-Geographic-APIs.md` §7.15) |

#### 9.1.3 Chart & Table Types

Line (trend over time), bar (category/department comparison), pie/donut (category breakdown), heatmap (geographic density, delegates to `07-Geographic-APIs.md` §7.14), and tabular grid (sortable/filterable/paginated per `API_SPECIFICATION.md` §1.8–§1.10) — the chart *type* is a rendering hint returned alongside the data (`chartType` field), never a separate endpoint per chart type.

#### 9.1.4 Drill-Down vs. Drill-Through

- **Drill-down**: narrowing the *same* report to a more granular grouping (e.g. a department-level SLA summary row → the same report scoped to one category within that department) — expressed as additional query filters on the same endpoint.
- **Drill-through**: jumping from an aggregate report row to the *underlying transactional record list* (e.g. a ward's complaint count → the actual list of complaints in that ward) — expressed as a dedicated `.../drill-down` or `.../drill-through` sub-resource returning `Complaint`-shaped rows (`API_SPECIFICATION.md` §4.8's list shape), not aggregate rows.

#### 9.1.5 Export Formats

CSV, PDF, and Excel (`.xlsx`) — all three share one asynchronous export mechanism (Section 9.10), identical in shape to the export pattern already fixed in `API_SPECIFICATION.md` §9.8.

#### 9.1.6 Report Caching

List/summary report responses carry a `Cache-Control: private, max-age=<n>` header (typically 300–900 seconds, tuned per report type) and an `ETag` derived from the underlying Reporting Table's last refresh timestamp — a client polling the same report between scheduled refreshes receives `304 Not Modified` rather than recomputing. Caching is transparent to the contract; no separate cache-management endpoint is introduced.

#### 9.1.7 Multi-Tenant Reporting

Every report endpoint is tenant-scoped from the JWT exactly as fixed in `API_SPECIFICATION.md` §1.1 — no report endpoint accepts a `tenantId` path/query override except the documented Super Admin cross-tenant exception, and even then, results are always grouped/labeled by tenant, never silently blended across tenants.

---

### 9.2 Dashboard APIs

#### 9.2.1 Get Executive Dashboard

| | |
|---|---|
| **Endpoint Name** | Get Executive Dashboard |
| **Purpose** | Retrieve the role-aware composite dashboard (widget set + KPI summary) for the Officer/Admin Portal home screen |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/reports/dashboard/executive` |
| **Authentication** | Yes |
| **Authorization** | Officer / Department Admin / Corporation Admin / Super Admin — widget set returned varies by role |
| **Request Headers** | `Authorization: Bearer <jwt>`; `Accept-Language`; `If-None-Match` (cache revalidation) |
| **Request Parameters** | `?periodStart=`, `?periodEnd=` (defaults to current month) |
| **Request Body** | None |
| **Response Body** | `{ "widgets": [ { "widgetKey", "chartType", "data" } ], "kpis": [ { "kpiKey", "value", "trendDirection" } ], "generatedAt" }` |
| **Validation Rules** | `periodEnd` ≥ `periodStart` if both supplied |
| **Business Rules** | Widget set is filtered server-side to those the caller's role/scope is permitted to view (Section 9.14) |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `304`, `400`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable (`GET`) |
| **Related Database Entities** | `daily_complaint_summary`, `sla_tracking`, `officer_workload`, `complaint_feedback` |
| **Related Functional Module** | SRS §3.3 Officer Module — Analytics; §3.4 Admin Module — Reports |
| **Related AI Agent** | None (raw aggregate; AI-narrated version is `API_SPECIFICATION.md` §5.6 Analytics Insights) |
| **Audit Requirements** | Not separately audited (read-only) |
| **Security Considerations** | Cached response never varies by requester identity beyond role/scope — no risk of cache cross-contamination between users of the same role |

#### 9.2.2 Get Dashboard Widget Data

| | |
|---|---|
| **Endpoint Name** | Get Dashboard Widget Data |
| **Purpose** | Retrieve a single widget's data in isolation, for a client that renders widgets independently/lazily |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/reports/dashboard/widgets/{widgetKey}` |
| **Authentication** | Yes |
| **Authorization** | Same as Section 9.2.1, scoped per widget |
| **Request Headers** | `Authorization: Bearer <jwt>`; `Accept-Language` |
| **Request Parameters** | Path: `widgetKey`; `?periodStart=`, `?periodEnd=` |
| **Request Body** | None |
| **Response Body** | `{ "widgetKey", "chartType", "data", "generatedAt" }` |
| **Validation Rules** | `widgetKey`: must be a recognized, role-permitted widget key |
| **Business Rules** | Same permission gate as Section 9.2.1 |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 WIDGET_NOT_FOUND` |
| **HTTP Status Codes** | `200`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | Varies by `widgetKey` (Section 9.1.2 table) |
| **Related Functional Module** | SRS §3.4 Admin Module — Reports |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | None beyond standard RBAC |

#### 9.2.3 List Available Widgets

| | |
|---|---|
| **Endpoint Name** | List Available Widgets |
| **Purpose** | Retrieve the catalog of widgets the caller's role is permitted to view, for a customizable dashboard layout builder |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/reports/dashboard/widgets` |
| **Authentication** | Yes |
| **Authorization** | Officer / Department Admin / Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | None |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "widgetKey", "title", "chartType", "requiredPermission" } ] }` |
| **Validation Rules** | None (read-only) |
| **Business Rules** | Only widgets the caller's granted `report:*` permissions (Section 9.14) allow are listed |
| **Error Responses** | `401 UNAUTHORIZED` |
| **HTTP Status Codes** | `200`, `401` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `permission`, `role_permission` |
| **Related Functional Module** | SRS §3.4 Admin Module — Reports |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | None beyond standard RBAC |

#### 9.2.4 Get KPI Summary

| | |
|---|---|
| **Endpoint Name** | Get KPI Summary |
| **Purpose** | Retrieve just the KPI tile values (no chart payloads), for a lightweight summary strip |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/reports/kpis` |
| **Authentication** | Yes |
| **Authorization** | Officer / Department Admin / Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | `?periodStart=`, `?periodEnd=` |
| **Request Body** | None |
| **Response Body** | `{ "kpis": [ { "kpiKey", "label", "value", "unit", "trendDirection", "changePercent" } ] }` |
| **Validation Rules** | `periodEnd` ≥ `periodStart` if both supplied |
| **Business Rules** | Same scope filtering as Section 9.2.1 |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `daily_complaint_summary`, `trend_snapshot` |
| **Related Functional Module** | SRS §3.4 Admin Module — Reports |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | None beyond standard RBAC |

---

### 9.3 Complaint Reports

#### 9.3.1 Complaint Summary Report

| | |
|---|---|
| **Endpoint Name** | Complaint Summary Report |
| **Purpose** | Per-department/category/ward complaint counts by status for a period |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/reports/complaints/summary` |
| **Authentication** | Yes |
| **Authorization** | Department Admin (own department) / Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | `?periodStart=` (required), `?periodEnd=` (required), `?departmentId=`, `?wardId=`, `?sort=`, `?page=`, `?size=` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "departmentId", "categoryId", "wardId", "registeredCount", "resolvedCount", "breachedCount" } ], "meta": { "pagination" } }` |
| **Validation Rules** | `periodStart`/`periodEnd`: required, `periodEnd` ≥ `periodStart` |
| **Business Rules** | Reads `daily_complaint_summary` rows within range, aggregated server-side |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `daily_complaint_summary` |
| **Related Functional Module** | SRS §3.4 Admin Module — Reports |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | None beyond standard RBAC |

#### 9.3.2 Complaint Trend Report

| | |
|---|---|
| **Endpoint Name** | Complaint Trend Report |
| **Purpose** | Time-series complaint volume/resolution trend for line-chart rendering |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/reports/complaints/trend` |
| **Authentication** | Yes |
| **Authorization** | Department Admin / Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | `?periodStart=` (required), `?periodEnd=` (required), `?granularity=daily\|weekly\|monthly`, `?departmentId=` |
| **Request Body** | None |
| **Response Body** | `{ "chartType": "line", "series": [ { "seriesKey", "points": [ { "date", "value" } ] } ] }` |
| **Validation Rules** | `granularity`: default `daily`; max 24-month range for `monthly`, 12-month for `weekly`, 3-month for `daily` (bounds the point count returned) |
| **Business Rules** | None beyond scope |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `daily_complaint_summary`, `trend_snapshot` |
| **Related Functional Module** | SRS §3.5 AI Agent Layer — Analytics Agent (trend data source) |
| **Related AI Agent** | None (structured source; narrated version is `API_SPECIFICATION.md` §5.6) |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | None beyond standard RBAC |

#### 9.3.3 Complaint Category Breakdown Report

| | |
|---|---|
| **Endpoint Name** | Complaint Category Breakdown Report |
| **Purpose** | Category-wise share of complaint volume, for pie/donut-chart rendering |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/reports/complaints/category-breakdown` |
| **Authentication** | Yes |
| **Authorization** | Department Admin / Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | `?periodStart=` (required), `?periodEnd=` (required), `?departmentId=` |
| **Request Body** | None |
| **Response Body** | `{ "chartType": "pie", "data": [ { "categoryName", "count", "percentOfTotal" } ] }` |
| **Validation Rules** | `periodStart`/`periodEnd`: required |
| **Business Rules** | None beyond scope |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `daily_complaint_summary`, `complaint_category` |
| **Related Functional Module** | SRS §3.4 Admin Module — Reports |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | None beyond standard RBAC |

#### 9.3.4 Complaint Drill-Down

| | |
|---|---|
| **Endpoint Name** | Complaint Drill-Down |
| **Purpose** | Drill-through from a Complaint Summary Report row to the underlying list of individual complaints |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/reports/complaints/summary/drill-down` |
| **Authentication** | Yes |
| **Authorization** | Department Admin / Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | `?periodStart=` (required), `?periodEnd=` (required), `?departmentId=`, `?categoryId=`, `?wardId=`, `?statusId=`, `?cursor=`, `?limit=` — same grouping filters as the summary row being drilled into |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "id", "trackingId", "statusLabel", "priority", "createdAt" } ], "meta": { "pagination": { "nextCursor", "hasMore" } } }` — identical shape to `API_SPECIFICATION.md` §4.8's Complaint List |
| **Validation Rules** | `periodStart`/`periodEnd`: required; `limit`: max 100 |
| **Business Rules** | This is deliberately the *same* underlying query as `GET /complaints` (`API_SPECIFICATION.md` §4.8) with a report-context wrapper — not a second complaint-listing implementation |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `complaint` |
| **Related Functional Module** | SRS §3.3 Officer Module — Pending/Assigned Complaints Queue |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | Same tenant/scope enforcement as `API_SPECIFICATION.md` §4.8 |

---
### 9.4 SLA Reports

#### 9.4.1 SLA Compliance Report

| | |
|---|---|
| **Endpoint Name** | SLA Compliance Report |
| **Purpose** | Percentage of complaints resolved within their pinned SLA window, per department/category |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/reports/sla/compliance` |
| **Authentication** | Yes |
| **Authorization** | Department Admin / Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | `?periodStart=` (required), `?periodEnd=` (required), `?departmentId=`, `?categoryId=` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "departmentId", "categoryId", "complianceRatePercent", "totalComplaints", "compliantCount" } ] }` |
| **Validation Rules** | `periodStart`/`periodEnd`: required |
| **Business Rules** | Compliance is computed against each complaint's **originally-pinned** `sla_rule_config` version (`DATABASE_DESIGN.md` §22) — never against whatever SLA rule is active today |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `sla_tracking`, `sla_rule_config` |
| **Related Functional Module** | SRS §3.5 AI Agent Layer — SLA Agent |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | None beyond standard RBAC |

#### 9.4.2 SLA Breach Report

| | |
|---|---|
| **Endpoint Name** | SLA Breach Report |
| **Purpose** | List of complaints that breached their SLA within a period, for triage and escalation review |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/reports/sla/breach` |
| **Authentication** | Yes |
| **Authorization** | Department Admin / Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | `?periodStart=` (required), `?periodEnd=` (required), `?departmentId=`, `?sort=-breachedAt`, `?cursor=`, `?limit=` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "complaintId", "trackingId", "dueAt", "breachedAt", "escalatedTo"? } ], "meta": { "pagination" } }` |
| **Validation Rules** | `periodStart`/`periodEnd`: required; `limit`: max 100 |
| **Business Rules** | None beyond scope |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `sla_tracking`, `escalation_instance` |
| **Related Functional Module** | SRS §3.5 AI Agent Layer — SLA Agent |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | None beyond standard RBAC |

#### 9.4.3 SLA Trend Report

| | |
|---|---|
| **Endpoint Name** | SLA Trend Report |
| **Purpose** | Time-series SLA compliance rate, for line-chart rendering |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/reports/sla/trend` |
| **Authentication** | Yes |
| **Authorization** | Department Admin / Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | `?periodStart=` (required), `?periodEnd=` (required), `?granularity=weekly\|monthly`, `?departmentId=` |
| **Request Body** | None |
| **Response Body** | `{ "chartType": "line", "series": [ { "seriesKey": "complianceRatePercent", "points": [ { "date", "value" } ] } ] }` |
| **Validation Rules** | `periodStart`/`periodEnd`: required |
| **Business Rules** | None beyond scope |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `trend_snapshot`, `sla_tracking` |
| **Related Functional Module** | SRS §3.5 AI Agent Layer — SLA Agent |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | None beyond standard RBAC |

---

### 9.5 Officer Performance Reports

#### 9.5.1 Officer Performance Report

| | |
|---|---|
| **Endpoint Name** | Officer Performance Report |
| **Purpose** | Per-officer weekly assigned/resolved/pending/overdue counts |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/reports/officer-performance` |
| **Authentication** | Yes |
| **Authorization** | Officer (own record only) / Department Admin (officers within department) / Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | `?officerId=`, `?weekStartDate=` |
| **Request Body** | None |
| **Response Body** | `{ "officerId", "weekStartDate", "assignedCount", "resolvedCount", "overdueCount" }` |
| **Validation Rules** | An Officer caller may only request their own `officerId` |
| **Business Rules** | None beyond scope |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `weekly_officer_performance` |
| **Related Functional Module** | SRS §3.3 Officer Module — Officer AI Agent (performance report) |
| **Related AI Agent** | None (structured source; narrated version reachable via `API_SPECIFICATION.md` §5.5's `"generate officer performance report"` query) |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | Scope check enforced server-side |

#### 9.5.2 Officer Leaderboard Report

| | |
|---|---|
| **Endpoint Name** | Officer Leaderboard Report |
| **Purpose** | Rank officers within a department by resolution count/SLA compliance, for a recognition/performance-management view |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/reports/officer-performance/leaderboard` |
| **Authentication** | Yes |
| **Authorization** | Department Admin (own department) / Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | `?departmentId=`, `?periodStart=` (required), `?periodEnd=` (required), `?sort=-resolvedCount` (default), `?limit=` (default 10, max 100) |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "officerId", "officerName", "resolvedCount", "slaCompliancePercent", "rank" } ] }` |
| **Validation Rules** | `periodStart`/`periodEnd`: required |
| **Business Rules** | Ranking is computed server-side; ties broken deterministically by `officerId` for a stable, reproducible order |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `weekly_officer_performance` |
| **Related Functional Module** | SRS §3.4 Admin Module — Reports |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | None beyond standard RBAC |

#### 9.5.3 Officer Drill-Down

| | |
|---|---|
| **Endpoint Name** | Officer Drill-Down |
| **Purpose** | Drill-through from an officer's summary/leaderboard row to their individual assigned-complaint list |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/reports/officer-performance/{officerId}/drill-down` |
| **Authentication** | Yes |
| **Authorization** | Officer (own record only) / Department Admin / Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `officerId`; `?periodStart=` (required), `?periodEnd=` (required), `?statusId=`, `?cursor=`, `?limit=` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "id", "trackingId", "statusLabel", "assignedAt", "slaDueAt" } ], "meta": { "pagination" } }` |
| **Validation Rules** | `periodStart`/`periodEnd`: required; `limit`: max 100 |
| **Business Rules** | Same underlying query as `GET /complaints?departmentId=&...` (`API_SPECIFICATION.md` §4.8) filtered to this officer's assignments |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 OFFICER_NOT_FOUND` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `complaint_assignment`, `complaint` |
| **Related Functional Module** | SRS §3.3 Officer Module |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | Scope check enforced server-side |

---

### 9.6 Department Reports

#### 9.6.1 Department Performance Report

| | |
|---|---|
| **Endpoint Name** | Department Performance Report |
| **Purpose** | Department-level registered/resolved/SLA-breach-rate rollup over a period |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/reports/department-performance` |
| **Authentication** | Yes |
| **Authorization** | Department Admin (own department) / Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | `?departmentId=`, `?periodStart=`, `?periodEnd=` |
| **Request Body** | None |
| **Response Body** | `{ "departmentId", "registeredCount", "resolvedCount", "breachRatePercent", "avgResolutionHours" }` |
| **Validation Rules** | `periodEnd` ≥ `periodStart` |
| **Business Rules** | None beyond scope |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `monthly_department_report`, `daily_complaint_summary` |
| **Related Functional Module** | SRS §3.4 Admin Module — Reports |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | None beyond standard RBAC |

#### 9.6.2 Department Comparison Report

| | |
|---|---|
| **Endpoint Name** | Department Comparison Report |
| **Purpose** | Side-by-side comparison of every department's key metrics for a period, for bar-chart rendering |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/reports/department-performance/comparison` |
| **Authentication** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | `?periodStart=` (required), `?periodEnd=` (required), `?metricKey=registeredCount\|resolvedCount\|breachRatePercent\|avgResolutionHours` |
| **Request Body** | None |
| **Response Body** | `{ "chartType": "bar", "data": [ { "departmentName", "value" } ] }` |
| **Validation Rules** | `periodStart`/`periodEnd`: required |
| **Business Rules** | Tenant-wide only — a Department Admin cannot compare across departments outside their own (`403`) |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `monthly_department_report` |
| **Related Functional Module** | SRS §3.4 Admin Module — Reports |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | Corporation-wide comparison is intentionally restricted above Department Admin scope |

#### 9.6.3 Department Drill-Down

| | |
|---|---|
| **Endpoint Name** | Department Drill-Down |
| **Purpose** | Drill-through from a department's summary row to its complaint list |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/reports/department-performance/{departmentId}/drill-down` |
| **Authentication** | Yes |
| **Authorization** | Department Admin (own department) / Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `departmentId`; `?periodStart=` (required), `?periodEnd=` (required), `?statusId=`, `?cursor=`, `?limit=` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "id", "trackingId", "statusLabel", "createdAt" } ], "meta": { "pagination" } }` |
| **Validation Rules** | `periodStart`/`periodEnd`: required; `limit`: max 100 |
| **Business Rules** | Same underlying query as `GET /complaints?departmentId=` (`API_SPECIFICATION.md` §4.8) |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 DEPARTMENT_NOT_FOUND` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `complaint`, `department` |
| **Related Functional Module** | SRS §3.4 Admin Module — Reports |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | Scope check enforced server-side |

---
### 9.7 AI Analytics Reports

Structured, non-AI-narrated data sources; the AI-narrated equivalent is `API_SPECIFICATION.md` §5.6 (Analytics Insights), not duplicated here.

#### 9.7.1 AI Prediction Report

| | |
|---|---|
| **Endpoint Name** | AI Prediction Report |
| **Purpose** | Structured view of Analytics Agent trend predictions (complaint volume forecast, category forecast) |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/reports/ai-analytics/predictions` |
| **Authentication** | Yes |
| **Authorization** | Department Admin / Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | `?scope=department\|district\|tenant`, `?periodStart=` (required), `?periodEnd=` (required) |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "metricKey", "predictedValue", "confidenceScore", "predictionDate" } ] }` |
| **Validation Rules** | `periodStart`/`periodEnd`: required, max 12-month range |
| **Business Rules** | Falls back to an empty/`unavailable` result set (not an error) if the AI Orchestration Service is degraded, per `ARCHITECTURE.md` §8.3 |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `trend_snapshot` |
| **Related Functional Module** | SRS §3.5 AI Agent Layer — Analytics Agent |
| **Related AI Agent** | Analytics Agent (source of the underlying predictions; this endpoint reads the pre-computed result, it does not itself invoke Claude) |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | None beyond standard RBAC |

#### 9.7.2 AI Classification Accuracy Report

| | |
|---|---|
| **Endpoint Name** | AI Classification Accuracy Report |
| **Purpose** | Report how often the Complaint Agent's category/priority/department classification was subsequently overridden by an Officer/Admin (`API_SPECIFICATION.md` §4.4 Update Complaint), as a model-quality signal |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/reports/ai-analytics/classification-accuracy` |
| **Authentication** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | `?periodStart=` (required), `?periodEnd=` (required), `?departmentId=` |
| **Request Body** | None |
| **Response Body** | `{ "totalClassified", "overriddenCount", "overrideRatePercent", "averageConfidenceScore" }` |
| **Validation Rules** | `periodStart`/`periodEnd`: required |
| **Business Rules** | An "override" is any `complaint.categoryId`/`priority` value that differs between the `ai_classification_result` row and the complaint's current stored value |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `ai_classification_result`, `complaint` |
| **Related Functional Module** | SRS §3.5 AI Agent Layer — Complaint Agent |
| **Related AI Agent** | Complaint Agent (subject of this accuracy report) |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | Aggregate-only response — no individual complaint content |

---

### 9.8 Citizen Service Reports

#### 9.8.1 Citizen Satisfaction Report

| | |
|---|---|
| **Endpoint Name** | Citizen Satisfaction Report |
| **Purpose** | Average feedback rating and comment-sentiment summary per department/category |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/reports/citizen-service/satisfaction` |
| **Authentication** | Yes |
| **Authorization** | Department Admin / Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | `?periodStart=` (required), `?periodEnd=` (required), `?departmentId=` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "departmentId", "averageRating", "feedbackCount", "ratingDistribution": { "1", "2", "3", "4", "5" } } ] }` |
| **Validation Rules** | `periodStart`/`periodEnd`: required |
| **Business Rules** | Excludes complaints with no submitted feedback from the average rather than treating them as zero |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `complaint_feedback` |
| **Related Functional Module** | SRS §3.2 Citizen Module — Feedback |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | None beyond standard RBAC |

#### 9.8.2 Citizen Engagement Report

| | |
|---|---|
| **Endpoint Name** | Citizen Engagement Report |
| **Purpose** | Registration, repeat-complaint, and feedback-submission-rate metrics, for citizen-adoption tracking |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/reports/citizen-service/engagement` |
| **Authentication** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | `?periodStart=` (required), `?periodEnd=` (required) |
| **Request Body** | None |
| **Response Body** | `{ "newRegistrations", "activeComplainants", "feedbackSubmissionRatePercent", "reopenRatePercent" }` |
| **Validation Rules** | `periodStart`/`periodEnd`: required |
| **Business Rules** | None |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `user`, `citizen_profile`, `complaint`, `complaint_feedback` |
| **Related Functional Module** | SRS §3.2 Citizen Module |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | Aggregate-only response — no individual citizen identity in results |

#### 9.8.3 Channel Usage Report

| | |
|---|---|
| **Endpoint Name** | Channel Usage Report |
| **Purpose** | Complaint registration channel mix (text/voice) and notification channel delivery mix, for capacity/provider planning |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/reports/citizen-service/channel-usage` |
| **Authentication** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | `?periodStart=` (required), `?periodEnd=` (required) |
| **Request Body** | None |
| **Response Body** | `{ "registrationChannels": { "text", "voice" }, "notificationChannels": { "sms", "email", "whatsapp", "push" } }` |
| **Validation Rules** | `periodStart`/`periodEnd`: required |
| **Business Rules** | Notification channel figures cross-reference `08-Notification-APIs.md` §8.15 rather than recomputing independently |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `complaint`, `voice_complaint`, `notification_dispatch` |
| **Related Functional Module** | SRS §3.6 Voice Complaint Flow; §5 External Interface Requirements |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | Aggregate-only response |

---

### 9.9 Geographic Reports

Structural counterparts to `07-Geographic-APIs.md` §7.14 (Heatmap) and §7.15 (Geo Analytics), presented in the Reports domain for a unified Reports Portal navigation; both cross-reference rather than recompute the same `geo_analytics_snapshot` source.

#### 9.9.1 Ward-Wise Complaint Report

| | |
|---|---|
| **Endpoint Name** | Ward-Wise Complaint Report |
| **Purpose** | Tabular per-ward complaint count/category breakdown for a period |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/reports/geographic/ward-wise` |
| **Authentication** | Yes |
| **Authorization** | Department Admin / Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | `?periodStart=` (required), `?periodEnd=` (required), `?zoneId=`, `?sort=-complaintCount`, `?page=`, `?size=` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "wardId", "wardName", "complaintCount", "categoryBreakdown": [ { "categoryName", "count" } ] } ], "meta": { "pagination" } }` |
| **Validation Rules** | `periodStart`/`periodEnd`: required |
| **Business Rules** | Sourced from `geo_analytics_snapshot` (`07-Geographic-APIs.md` §7.15), not a live spatial query |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `501 NOT_ENABLED` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403`, `501` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `geo_analytics_snapshot`, `ward` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §26 GIS & Geospatial Data Architecture |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | None beyond standard RBAC |

#### 9.9.2 Zone-Wise Complaint Report

| | |
|---|---|
| **Endpoint Name** | Zone-Wise Complaint Report |
| **Purpose** | Tabular per-zone complaint count/category breakdown for a period |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/reports/geographic/zone-wise` |
| **Authentication** | Yes |
| **Authorization** | Department Admin / Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | `?periodStart=` (required), `?periodEnd=` (required), `?districtId=`, `?sort=-complaintCount`, `?page=`, `?size=` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "zoneId", "zoneName", "complaintCount", "categoryBreakdown": [ { "categoryName", "count" } ] } ], "meta": { "pagination" } }` |
| **Validation Rules** | `periodStart`/`periodEnd`: required |
| **Business Rules** | Sourced from `geo_analytics_snapshot`, aggregated up one level from Ward |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `501 NOT_ENABLED` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403`, `501` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `geo_analytics_snapshot`, `zone` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §26 GIS & Geospatial Data Architecture |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | None beyond standard RBAC |

---

### 9.10 Export Reports

#### 9.10.1 Export Report

| | |
|---|---|
| **Endpoint Name** | Export Report |
| **Purpose** | Export any report in Sections 9.2–9.9 as PDF, Excel, or CSV |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/reports/export` |
| **Authentication** | Yes |
| **Authorization** | Department Admin / Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>`; `Idempotency-Key` (optional) |
| **Request Parameters** | `?reportType=` (required, any Section 9.2–9.9 report key), `?format=csv\|pdf\|xlsx` (required), plus that report's own filters |
| **Request Body** | None |
| **Response Body** | `202 Accepted`: `{ "exportJobId", "status": "queued" }` |
| **Validation Rules** | `reportType`/`format`: required, `format` one of the three supported values |
| **Business Rules** | Large exports are generated asynchronously via the Scheduler (`ARCHITECTURE.md` §17); the resulting artifact is a `file_asset`, retrieved via Section 9.10.3 |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `429 RATE_LIMITED` |
| **HTTP Status Codes** | `202`, `400`, `401`, `403`, `429` |
| **Rate Limiting** | Export-generation throttling |
| **Idempotency** | `Idempotency-Key` honored (24-hour TTL) |
| **Related Database Entities** | `file_asset` (the generated export artifact) |
| **Related Functional Module** | SRS §3.4 Admin Module — Reports |
| **Related AI Agent** | None |
| **Audit Requirements** | `audit_log` entry recording the export request, filters, and requesting Admin |
| **Security Considerations** | Export artifact inherits the same signed-URL, virus-scan, and retention rules as any other `file_asset` (`API_SPECIFICATION.md` §11) |

#### 9.10.2 Get Export Job Status

| | |
|---|---|
| **Endpoint Name** | Get Export Job Status |
| **Purpose** | Poll the status of an asynchronous report export job |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/reports/export/{exportJobId}` |
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

#### 9.10.3 Download Export

| | |
|---|---|
| **Endpoint Name** | Download Export |
| **Purpose** | Retrieve the completed export artifact via a short-lived, signed URL |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/reports/export/{exportJobId}/download` |
| **Authentication** | Yes |
| **Authorization** | The requesting Admin (own export job) |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `exportJobId` |
| **Request Body** | None |
| **Response Body** | `302 Found` redirect to a signed URL, identical mechanics to `API_SPECIFICATION.md` §11.2 |
| **Validation Rules** | Export job must be `completed` |
| **Business Rules** | Delegates entirely to the File Download endpoint (`11-File-Management-APIs.md` §11.2) once the underlying `fileAssetId` is resolved |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 EXPORT_JOB_NOT_FOUND`, `409 EXPORT_NOT_YET_COMPLETE` |
| **HTTP Status Codes** | `302`, `401`, `403`, `404`, `409` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `file_asset` |
| **Related Functional Module** | `ARCHITECTURE.md` §19 File Storage Architecture |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited (download itself is not separately logged beyond the standard file-access audit already fixed in `11-File-Management-APIs.md` §11.15) |
| **Security Considerations** | Same signed-URL/virus-scan posture as `API_SPECIFICATION.md` §11.2 |

---
### 9.11 Scheduled Reports

Backed by the **proposed** `report_schedule_config` table (Section 9.1.1) — follows the existing versioned `*_config` pattern exactly (`DATABASE_DESIGN.md` §7, §22); delivery reuses the already-approved Email channel (`08-Notification-APIs.md` §8.3) and the existing Scheduler (`ARCHITECTURE.md` §17), so only the schedule *definition* is new, not the delivery mechanism.

#### 9.11.1 List Scheduled Reports

| | |
|---|---|
| **Endpoint Name** | List Scheduled Reports |
| **Purpose** | Retrieve the tenant's configured recurring report schedules |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/report-schedules` |
| **Authentication** | Yes |
| **Authorization** | Department Admin (own schedules) / Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | `?reportType=`, `?isActive=true` (default), `?page=`, `?size=` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "id", "reportType", "cronExpression", "format", "recipientEmails", "isActive" } ], "meta": { "pagination" } }` |
| **Validation Rules** | `size`: max 100 |
| **Business Rules** | None (read-only) |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `report_schedule_config` (proposed, pending Database Architecture v1.2) |
| **Related Functional Module** | SRS §3.4 Admin Module — Reports |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited (read-only) |
| **Security Considerations** | None beyond standard RBAC |

#### 9.11.2 Create Scheduled Report

| | |
|---|---|
| **Endpoint Name** | Create Scheduled Report |
| **Purpose** | Define a new recurring report generation + email-delivery schedule |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/report-schedules` |
| **Authentication** | Yes |
| **Authorization** | Department Admin / Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | None |
| **Request Body** | `{ "reportType": "string (any Section 9.2-9.9 report key)", "filters": { "key": "value" }, "cronExpression": "string", "format": "csv" \| "pdf" \| "xlsx", "recipientEmails": ["string"] }` |
| **Response Body** | `{ "id", "reportType", "cronExpression", "format", "recipientEmails", "isActive": true, "version": 1, "createdAt" }` |
| **Validation Rules** | `cronExpression`: required, valid cron syntax, minimum interval of 1 hour (prevents excessive Scheduler load); `recipientEmails`: required, 1–50 valid RFC 5322 addresses; `reportType`: required, must be a recognized report key |
| **Business Rules** | The Scheduler (`ARCHITECTURE.md` §17) picks up active schedules and internally invokes Section 9.10.1's export pipeline, then dispatches the resulting artifact via the Email channel (`08-Notification-APIs.md` §8.3.1) with the export as an attachment |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 REPORT_TYPE_NOT_FOUND` |
| **HTTP Status Codes** | `201`, `400`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user write-endpoint throttle |
| **Idempotency** | `Idempotency-Key` accepted (optional) |
| **Related Database Entities** | `report_schedule_config` (proposed) |
| **Related Functional Module** | `ARCHITECTURE.md` §17 Scheduler Architecture |
| **Related AI Agent** | None |
| **Audit Requirements** | `audit_log` entry recording the creating Admin and schedule definition |
| **Security Considerations** | Recipient email addresses are validated against the tenant's known user directory where the tenant chooses to restrict scheduled-report delivery to internal addresses only |

#### 9.11.3 Get Scheduled Report

| | |
|---|---|
| **Endpoint Name** | Get Scheduled Report |
| **Purpose** | Retrieve a single scheduled report's configuration |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/report-schedules/{scheduleId}` |
| **Authentication** | Yes |
| **Authorization** | Department Admin (own) / Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `scheduleId` |
| **Request Body** | None |
| **Response Body** | `{ "id", "reportType", "filters", "cronExpression", "format", "recipientEmails", "isActive", "version", "lastRunAt"?, "nextRunAt"? }` |
| **Validation Rules** | None (read-only) |
| **Business Rules** | None |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 SCHEDULE_NOT_FOUND` |
| **HTTP Status Codes** | `200`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `report_schedule_config` (proposed) |
| **Related Functional Module** | `ARCHITECTURE.md` §17 Scheduler Architecture |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | None beyond standard RBAC |

#### 9.11.4 Update Scheduled Report

| | |
|---|---|
| **Endpoint Name** | Update Scheduled Report |
| **Purpose** | Change a schedule's cron expression, recipients, format, or active state |
| **HTTP Method** | `PATCH` |
| **URL** | `/api/v1/report-schedules/{scheduleId}` |
| **Authentication** | Yes |
| **Authorization** | Department Admin (own) / Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>`; `If-Match: "<current version>"` (optimistic concurrency) |
| **Request Parameters** | Path: `scheduleId` |
| **Request Body** | `{ "cronExpression"?: "string", "recipientEmails"?: ["string"], "format"?: "string", "isActive"?: "boolean", "expectedVersion": "integer" }` |
| **Response Body** | Updated schedule object (Section 9.11.3 shape), `version` incremented |
| **Validation Rules** | Same cron/email rules as Section 9.11.2; `expectedVersion`: required, must match current version |
| **Business Rules** | **Optimistic concurrency**: a version mismatch returns `409` rather than silently overwriting a concurrent edit |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 SCHEDULE_NOT_FOUND`, `409 CONCURRENT_MODIFICATION` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403`, `404`, `409` |
| **Rate Limiting** | Standard per-user write-endpoint throttle |
| **Idempotency** | `PATCH` idempotent by HTTP semantics; concurrency check guards against lost updates |
| **Related Database Entities** | `report_schedule_config` (proposed), `config_change_history` |
| **Related Functional Module** | `ARCHITECTURE.md` §17 Scheduler Architecture |
| **Related AI Agent** | None |
| **Audit Requirements** | `audit_log`/`config_change_history` entry recording the change and editing Admin |
| **Security Considerations** | None beyond standard RBAC |

#### 9.11.5 Delete Scheduled Report

| | |
|---|---|
| **Endpoint Name** | Delete Scheduled Report |
| **Purpose** | Soft-delete (deactivate) a scheduled report |
| **HTTP Method** | `DELETE` |
| **URL** | `/api/v1/report-schedules/{scheduleId}` |
| **Authentication** | Yes |
| **Authorization** | Department Admin (own) / Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `scheduleId` |
| **Request Body** | None |
| **Response Body** | `204 No Content` |
| **Validation Rules** | None beyond existence check |
| **Business Rules** | A deactivated schedule is excluded from the Scheduler's next run without affecting reports already dispatched historically |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 SCHEDULE_NOT_FOUND` |
| **HTTP Status Codes** | `204`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user write-endpoint throttle |
| **Idempotency** | Naturally idempotent (`DELETE` semantics) |
| **Related Database Entities** | `report_schedule_config` (proposed), `audit_log` |
| **Related Functional Module** | `ARCHITECTURE.md` §17 Scheduler Architecture |
| **Related AI Agent** | None |
| **Audit Requirements** | `audit_log` entry recording the deactivation |
| **Security Considerations** | None beyond standard RBAC |

---

### 9.12 Report Templates

Backed by the **proposed** `report_template_config` table (Section 9.1.1) — a saved filter/column set for a report type, following the same versioned `*_config` pattern.

#### 9.12.1 List Report Templates

| | |
|---|---|
| **Endpoint Name** | List Report Templates |
| **Purpose** | Retrieve saved report templates (filter/column presets) |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/report-templates` |
| **Authentication** | Yes |
| **Authorization** | Department Admin / Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | `?reportType=`, `?page=`, `?size=` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "id", "name", "reportType", "createdBy", "version" } ], "meta": { "pagination" } }` |
| **Validation Rules** | `size`: max 100 |
| **Business Rules** | None (read-only) |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `report_template_config` (proposed) |
| **Related Functional Module** | SRS §3.4 Admin Module — Reports |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | None beyond standard RBAC |

#### 9.12.2 Create Report Template

| | |
|---|---|
| **Endpoint Name** | Create Report Template |
| **Purpose** | Save the current filter/column/sort configuration of a report as a reusable named template |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/report-templates` |
| **Authentication** | Yes |
| **Authorization** | Department Admin / Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | None |
| **Request Body** | `{ "name": "string", "reportType": "string", "savedFilters": { "key": "value" }, "savedColumns"?: ["string"], "savedSort"?: "string" }` |
| **Response Body** | `{ "id", "name", "reportType", "version": 1, "createdAt" }` |
| **Validation Rules** | `name`: required, unique per caller per `reportType`; `reportType`: required, must be a recognized report key |
| **Business Rules** | A template is private to its creator by default; visibility to others is granted via Report Sharing (Section 9.13) |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `409 TEMPLATE_NAME_ALREADY_EXISTS` |
| **HTTP Status Codes** | `201`, `400`, `401`, `403`, `409` |
| **Rate Limiting** | Standard per-user write-endpoint throttle |
| **Idempotency** | `Idempotency-Key` accepted (optional) |
| **Related Database Entities** | `report_template_config` (proposed) |
| **Related Functional Module** | SRS §3.4 Admin Module — Reports |
| **Related AI Agent** | None |
| **Audit Requirements** | `audit_log` entry recording creation |
| **Security Considerations** | None beyond standard RBAC |

#### 9.12.3 Get Report Template

| | |
|---|---|
| **Endpoint Name** | Get Report Template |
| **Purpose** | Retrieve a single saved report template |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/report-templates/{reportTemplateId}` |
| **Authentication** | Yes |
| **Authorization** | Creator, or a user the template has been shared with (Section 9.13) |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `reportTemplateId` |
| **Request Body** | None |
| **Response Body** | `{ "id", "name", "reportType", "savedFilters", "savedColumns", "savedSort", "createdBy", "version" }` |
| **Validation Rules** | None (read-only) |
| **Business Rules** | None beyond access check |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 TEMPLATE_NOT_FOUND` |
| **HTTP Status Codes** | `200`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `report_template_config` (proposed), `resource_share` (proposed) |
| **Related Functional Module** | SRS §3.4 Admin Module — Reports |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | Access check covers both ownership and share grants |

#### 9.12.4 Update Report Template

| | |
|---|---|
| **Endpoint Name** | Update Report Template |
| **Purpose** | Change a saved template's filters/columns/sort — creates a new version |
| **HTTP Method** | `PATCH` |
| **URL** | `/api/v1/report-templates/{reportTemplateId}` |
| **Authentication** | Yes |
| **Authorization** | Creator only |
| **Request Headers** | `Authorization: Bearer <jwt>`; `If-Match: "<current version>"` |
| **Request Parameters** | Path: `reportTemplateId` |
| **Request Body** | `{ "savedFilters"?: { "key": "value" }, "savedColumns"?: ["string"], "savedSort"?: "string", "expectedVersion": "integer" }` |
| **Response Body** | Updated template object, `version` incremented |
| **Validation Rules** | `expectedVersion`: required, must match current version |
| **Business Rules** | **Optimistic concurrency**: version mismatch returns `409` |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 TEMPLATE_NOT_FOUND`, `409 CONCURRENT_MODIFICATION` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403`, `404`, `409` |
| **Rate Limiting** | Standard per-user write-endpoint throttle |
| **Idempotency** | `PATCH` idempotent by HTTP semantics; concurrency check guards lost updates |
| **Related Database Entities** | `report_template_config` (proposed) |
| **Related Functional Module** | SRS §3.4 Admin Module — Reports |
| **Related AI Agent** | None |
| **Audit Requirements** | `audit_log` entry recording the change |
| **Security Considerations** | Creator-only write access — sharing (9.13) grants read, never write |

#### 9.12.5 Delete Report Template

| | |
|---|---|
| **Endpoint Name** | Delete Report Template |
| **Purpose** | Remove a saved report template |
| **HTTP Method** | `DELETE` |
| **URL** | `/api/v1/report-templates/{reportTemplateId}` |
| **Authentication** | Yes |
| **Authorization** | Creator only |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `reportTemplateId` |
| **Request Body** | None |
| **Response Body** | `204 No Content` |
| **Validation Rules** | None beyond ownership check |
| **Business Rules** | Also revokes any outstanding shares of this template (cascades to `resource_share`) |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 TEMPLATE_NOT_FOUND` |
| **HTTP Status Codes** | `204`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user write-endpoint throttle |
| **Idempotency** | Naturally idempotent |
| **Related Database Entities** | `report_template_config` (proposed), `resource_share` (proposed), `audit_log` |
| **Related Functional Module** | SRS §3.4 Admin Module — Reports |
| **Related AI Agent** | None |
| **Audit Requirements** | `audit_log` entry recording deletion |
| **Security Considerations** | Creator-only |

---

### 9.13 Report Sharing

Backed by the **proposed** `resource_share` table (Section 9.1.1) — polymorphic (`sharedEntityType` + `sharedEntityId`), reusing the same polymorphic-reference pattern already established for `file_asset`/`audit_log`/`embedding_vector` (`DATABASE_DESIGN.md` §12, §10, §34). The same table is reused by File Sharing (`11-File-Management-APIs.md` §11.6) — one sharing mechanism, not two.

#### 9.13.1 Share Report

| | |
|---|---|
| **Endpoint Name** | Share Report |
| **Purpose** | Grant another user (or a saved Report Template) access to a completed report export or a saved template |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/reports/{reportInstanceId}/shares` |
| **Authentication** | Yes |
| **Authorization** | The report's owner (exporter or template creator) |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `reportInstanceId` (an `exportJobId`'s resulting `fileAssetId`, or a `reportTemplateId`) |
| **Request Body** | `{ "sharedEntityType": "file_asset" \| "report_template", "grantedToUserId": "id", "expiresAt"?: "ISO-8601" }` |
| **Response Body** | `{ "shareId", "sharedEntityType", "sharedEntityId", "grantedToUserId", "expiresAt"?, "createdAt" }` |
| **Validation Rules** | `grantedToUserId`: required, must be within the sharer's tenant; `expiresAt`, if present: must be in the future |
| **Business Rules** | Sharing a report never bypasses the recipient's own RBAC scope for the *underlying* data — a shared export/template still respects the recipient's own department/tenant boundary at view time (Section 9.14) |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 RESOURCE_NOT_FOUND`, `404 USER_NOT_FOUND` |
| **HTTP Status Codes** | `201`, `400`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user write-endpoint throttle |
| **Idempotency** | `Idempotency-Key` accepted (optional) |
| **Related Database Entities** | `resource_share` (proposed), `file_asset`, `report_template_config` (proposed) |
| **Related Functional Module** | SRS §3.4 Admin Module — Reports |
| **Related AI Agent** | None |
| **Audit Requirements** | `audit_log` entry recording the share grant, sharer, and recipient |
| **Security Considerations** | Sharing across tenants is never permitted, even for Super Admin — a shared report always stays within the originating tenant |

#### 9.13.2 List Report Shares

| | |
|---|---|
| **Endpoint Name** | List Report Shares |
| **Purpose** | Retrieve every outstanding share grant for a report export or template |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/reports/{reportInstanceId}/shares` |
| **Authentication** | Yes |
| **Authorization** | The resource's owner |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `reportInstanceId` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "shareId", "grantedToUserId", "grantedToName", "expiresAt"?, "createdAt" } ] }` |
| **Validation Rules** | None (read-only) |
| **Business Rules** | None beyond ownership check |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 RESOURCE_NOT_FOUND` |
| **HTTP Status Codes** | `200`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `resource_share` (proposed) |
| **Related Functional Module** | SRS §3.4 Admin Module — Reports |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | Owner-only visibility into who a resource has been shared with |

#### 9.13.3 Revoke Report Share

| | |
|---|---|
| **Endpoint Name** | Revoke Report Share |
| **Purpose** | Remove a previously granted share |
| **HTTP Method** | `DELETE` |
| **URL** | `/api/v1/reports/{reportInstanceId}/shares/{shareId}` |
| **Authentication** | Yes |
| **Authorization** | The resource's owner |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `reportInstanceId`, `shareId` |
| **Request Body** | None |
| **Response Body** | `204 No Content` |
| **Validation Rules** | None beyond existence/ownership check |
| **Business Rules** | Revocation takes effect immediately — the recipient's next access attempt returns `403` |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 SHARE_NOT_FOUND` |
| **HTTP Status Codes** | `204`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user write-endpoint throttle |
| **Idempotency** | Naturally idempotent |
| **Related Database Entities** | `resource_share` (proposed), `audit_log` |
| **Related Functional Module** | SRS §3.4 Admin Module — Reports |
| **Related AI Agent** | None |
| **Audit Requirements** | `audit_log` entry recording revocation |
| **Security Considerations** | None beyond standard RBAC |

---

### 9.14 Report Permissions

Modeled entirely as `resource = 'report'` rows in the already-approved global `permission` catalog (`DATABASE_DESIGN.md` §5), granted via existing `role_permission`/`user_role_assignment` — no new table.

#### 9.14.1 Get Report Permission Matrix

| | |
|---|---|
| **Endpoint Name** | Get Report Permission Matrix |
| **Purpose** | Retrieve which roles are granted which report-related permissions (e.g. `report:sla:read`, `report:department-comparison:read`) |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/report-permissions` |
| **Authentication** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | `?roleId=` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "roleId", "roleName", "permissions": ["report:sla:read", "report:department-comparison:read"] } ] }` |
| **Validation Rules** | None (read-only) |
| **Business Rules** | None |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `permission`, `role_permission`, `role` |
| **Related Functional Module** | `ARCHITECTURE.md` §11.2 RBAC Model |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | None beyond standard RBAC |

#### 9.14.2 Update Report Permission

| | |
|---|---|
| **Endpoint Name** | Update Report Permission |
| **Purpose** | Grant or revoke a report-related permission for a role |
| **HTTP Method** | `PATCH` |
| **URL** | `/api/v1/report-permissions` |
| **Authentication** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | None |
| **Request Body** | `{ "roleId": "id", "permissionKey": "string (e.g. report:sla:read)", "action": "grant" \| "revoke" }` |
| **Response Body** | `{ "roleId", "permissionKey", "granted": "boolean" }` |
| **Validation Rules** | `permissionKey`: required, must exist in the global `permission` catalog under `resource = 'report'` (`06-Administration-APIs.md` §6.5); `roleId`: required, must not be a system role's protected baseline permission set |
| **Business Rules** | This is a thin convenience wrapper equivalent to `PATCH /api/v1/roles/{roleId}` (`06-Administration-APIs.md` §6.4.4) scoped to `report:*` permissions — it does not introduce a second permission-grant mechanism |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 ROLE_NOT_FOUND`, `404 PERMISSION_NOT_FOUND` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user write-endpoint throttle |
| **Idempotency** | Naturally idempotent — granting an already-granted permission (or revoking an already-revoked one) is a no-op success |
| **Related Database Entities** | `role_permission`, `permission`, `role` |
| **Related Functional Module** | `ARCHITECTURE.md` §11.2 RBAC Model |
| **Related AI Agent** | None |
| **Audit Requirements** | `audit_log` entry recording the grant/revoke and acting Admin |
| **Security Considerations** | Rejected (`403`) for system roles' protected baseline permissions, same rule as `06-Administration-APIs.md` §6.4.4 |

---

### 9.15 Report Statistics

Modeled as `activity_type = 'report_generated'` rows in the existing `activity_log` table — no new table.

#### 9.15.1 Get Report Usage Statistics

| | |
|---|---|
| **Endpoint Name** | Get Report Usage Statistics |
| **Purpose** | Retrieve which reports are run most frequently, by whom, for Reports Portal usage analysis and capacity planning |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/reports/statistics/usage` |
| **Authentication** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | `?periodStart=` (required), `?periodEnd=` (required), `?reportType=` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "reportType", "runCount", "uniqueUserCount", "averageResponseTimeMs" } ] }` |
| **Validation Rules** | `periodStart`/`periodEnd`: required |
| **Business Rules** | Every report `GET` in Sections 9.2–9.9 emits an `activity_log` row with `activityType = 'report_generated'`, which this endpoint aggregates |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `activity_log` |
| **Related Functional Module** | `ARCHITECTURE.md` §11.5 Audit Logging — Activity Monitoring |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited (this endpoint itself reads, rather than writes, `activity_log`) |
| **Security Considerations** | Aggregate-only response — no individual report *content* is exposed, only usage metadata |

---

*(End of Section 9.)*



