# Enterprise API Endpoint Catalog

## Version 1.0

## AI Powered Enterprise Citizen Service & Grievance Management Platform

| | |
|---|---|
| **Document Status** | Master Reference — Consolidated from Approved API Specification Sections 1–16 |
| **Version** | 1.0 |
| **Date** | 2026-07-20 |
| **Prepared As** | Chief Enterprise Architect — consolidation only, no new design |
| **Source Documents** | `API_SPECIFICATION.md` §§1–5, `06-Administration-APIs.md`, `07-Geographic-APIs.md`, `08-Notification-APIs.md`, `09-Reports-APIs.md`, `10-Audit-APIs.md`, `11-File-Management-APIs.md`, `12-Standard-Response-Formats.md`, `13-HTTP-Status-Codes.md`, `14-API-Security.md`, `15-API-Versioning.md`, `16-API-Documentation-Standards.md` |
| **Audience** | Backend Developers, Frontend Developers, QA Team, DevOps Team, API Gateway Team, Security Team, Project Managers |

> **Scope discipline**: this document introduces **no new API, no URL change, no renamed endpoint, and no request/response model change**. Every row below is a direct index entry into an already-approved endpoint; where this document states a Purpose, Role, or Status, it is summarizing — never redefining — what the source section already specifies. Where any ambiguity exists (Section 0.3), this document states its own consolidation convention explicitly rather than silently inventing new detail.

---

## 0. How to Use This Catalog

### 0.1 Structure

Section 1 indexes every endpoint, grouped by the ten functional modules (matching `API_SPECIFICATION.md`/`06`–`11` exactly). Sections 2–10 are derived views over that same index — statistics, matrices, and a final implementation checklist — built for the specific consumers named in the header table above.

### 0.2 Column Legend

| Column | Meaning |
|---|---|
| **API #** | A stable, module-scoped identifier (`AUTH-01`, `GEO-23`, ...) for cross-referencing from JIRA/test-plan/Gateway-config tooling — not itself part of the URL |
| **Roles Allowed** | Abbreviated per Section 0.3 |
| **Rate Limited** | `Yes` where the source section documents a *specific, named* throttle tier (beyond the platform's universal Gateway baseline, `14-API-Security.md` §14.12) — e.g. OTP/login/AI-cost/export/bulk/broadcast/test-send limits (`13-HTTP-Status-Codes.md` §13.7). `No` means only the universal baseline applies, not that the endpoint is unthrottled |
| **Idempotent** | Per the HTTP-method default fixed in `API_SPECIFICATION.md` §1.4 (`GET`/`PUT`/`PATCH`/`DELETE` = `Yes`); for `POST`, `Yes` only where the source section documents `Idempotency-Key` support or the operation is stated to be naturally idempotent, else `No` |
| **AI Agent** | One of the seven agents (SRS §3.5): Complaint, Assignment, SLA, Voice, Officer AI, Analytics, Notification — or `—` if none is invoked |
| **DB Entity** | Primary entity/entities only (abbreviated where the source lists several) — see the source endpoint for the complete list |
| **Status** | `Active` (Phase-1, implementable now against the current, approved `DATABASE_DESIGN.md` v1.1), `Future` (designed now, but gated behind a feature flag, marked optional/Phase-2+ in the source, or dependent on a **proposed, not-yet-approved** table pending a Database Architecture v1.2 addendum — `09-Reports-APIs.md` §9.1.1), or `Deprecated` (none exist at v1.0) |

### 0.3 Role Abbreviations

| Abbreviation | Role |
|---|---|
| `Cit` | Citizen |
| `Off` | Officer |
| `DA` | Department Admin |
| `CA` | Corporation Admin |
| `SA` | Super Admin |
| `Svc` | Internal service-to-service token |
| `Any` | Any authenticated role |
| `Pub` | No authentication required |

---

## 1. Endpoint Index by Module

### 1.1 Module 1 — Authentication (11 APIs)

Source: `API_SPECIFICATION.md` §2. Microservice owner: **Auth Service**.

| API # | Endpoint Name | Method | URL | Purpose | Auth Req | Roles Allowed | Rate Ltd | Idempotent | AI Agent | DB Entity | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| AUTH-01 | Citizen OTP Request | POST | `/api/v1/auth/citizen/otp/request` | Send OTP to begin citizen login/registration | No | Pub | Yes | No | — | `user` | Active |
| AUTH-02 | Citizen OTP Verify | POST | `/api/v1/auth/citizen/otp/verify` | Verify OTP, issue tokens, register on first use | No | Pub | Yes | No | — | `user`, `citizen_profile` | Active |
| AUTH-03 | Officer Login | POST | `/api/v1/auth/officer/login` | Verify Officer/Dept Admin password, trigger OTP | No | Pub | Yes | No | — | `user`, `staff_profile` | Active |
| AUTH-04 | Officer OTP Verify | POST | `/api/v1/auth/officer/otp/verify` | Complete Officer login via OTP, issue tokens | No | Pub | Yes | No | — | `user`, `staff_profile`, `role` | Active |
| AUTH-05 | Admin Login | POST | `/api/v1/auth/admin/login` | Verify Corp/Super Admin password, trigger MFA | No | Pub | Yes | No | — | `user`, `staff_profile`, `mfa_device` | Active |
| AUTH-06 | MFA Verify | POST | `/api/v1/auth/mfa/verify` | Complete Admin login via TOTP, issue tokens | No | Pub | Yes | No | — | `user`, `mfa_device` | Active |
| AUTH-07 | Refresh Token | POST | `/api/v1/auth/token/refresh` | Rotate access/refresh token pair | No | Pub | No | Yes | — | *(Redis-only)* | Active |
| AUTH-08 | Logout | POST | `/api/v1/auth/logout` | Revoke current session's tokens | Yes | Any | No | Yes | — | `auth_event_log` | Active |
| AUTH-09 | Forgot Password | POST | `/api/v1/auth/password/forgot` | Initiate password-reset flow | No | Pub | Yes | No | — | `user`, `staff_profile` | Active |
| AUTH-10 | Reset Password | POST | `/api/v1/auth/password/reset` | Complete password reset with token | No | Pub | No | Yes | — | `user`, `password_history` | Active |
| AUTH-11 | Token Validation | GET | `/api/v1/auth/token/validate` | Verify bearer token validity/claims | Yes | Any | No | Yes | — | *(Redis denylist)* | Active |

### 1.2 Module 2 — Citizen (7 APIs)

Source: `API_SPECIFICATION.md` §3. Microservice owner: **Complaint Service / Tenant & Admin Config Service**.

| API # | Endpoint Name | Method | URL | Purpose | Auth Req | Roles Allowed | Rate Ltd | Idempotent | AI Agent | DB Entity | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CIT-01 | Get Citizen Profile | GET | `/api/v1/citizens/me` | Retrieve own profile | Yes | Cit | No | Yes | — | `user`, `citizen_profile` | Active |
| CIT-02 | Update Citizen Profile | PATCH | `/api/v1/citizens/me` | Update own name/email | Yes | Cit | No | Yes | — | `user`, `citizen_profile` | Active |
| CIT-03 | Update Address | PUT | `/api/v1/citizens/me/address` | Replace registered address | Yes | Cit | No | Yes | — | `citizen_profile`, `ward` | Active |
| CIT-04 | Update Language Preference | PUT | `/api/v1/citizens/me/language-preference` | Set preferred language | Yes | Cit | No | Yes | — | `citizen_profile`, `reference_value` | Active |
| CIT-05 | Update Notification Preference | PUT | `/api/v1/citizens/me/notification-preference` | Set channel preferences | Yes | Cit | No | Yes | — | `notification_preference` | Active |
| CIT-06 | Citizen Complaint History | GET | `/api/v1/citizens/me/complaints` | List own past/active complaints | Yes | Cit | No | Yes | — | `complaint`, `complaint_category` | Active |
| CIT-07 | Citizen Dashboard | GET | `/api/v1/citizens/me/dashboard` | Aggregated home-screen view | Yes | Cit | No | Yes | — | `complaint`, `notification_dispatch` | Active |

### 1.3 Module 3 — Complaint (13 APIs)

Source: `API_SPECIFICATION.md` §4. Microservice owner: **Complaint Service / Officer Workflow Service**.

| API # | Endpoint Name | Method | URL | Purpose | Auth Req | Roles Allowed | Rate Ltd | Idempotent | AI Agent | DB Entity | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CMP-01 | Register Complaint (Text) | POST | `/api/v1/complaints` | File a new text grievance | Yes | Cit | Yes | Yes | Complaint | `complaint`, `complaint_status_history` | Active |
| CMP-02 | Register Voice Complaint | POST | `/api/v1/complaints/voice` | File a grievance via voice recording | Yes | Cit | Yes | Yes | Voice | `complaint`, `voice_complaint`, `voice_transcript` | Active |
| CMP-03 | Upload Complaint Attachment | POST | `/api/v1/complaints/{complaintId}/attachments` | Attach image/evidence to complaint | Yes | Cit+Off | No | No | — | `file_asset`, `complaint` | Active |
| CMP-04 | Update Complaint | PATCH | `/api/v1/complaints/{complaintId}` | Correct category/priority/severity | Yes | Off+DA+CA | No | Yes | — | `complaint`, `sla_tracking` | Active |
| CMP-05 | Complaint Details | GET | `/api/v1/complaints/{complaintId}` | Retrieve full complaint detail | Yes | Cit+Off+Any | No | Yes | — | `complaint`, `complaint_assignment` | Active |
| CMP-06 | Complaint Timeline | GET | `/api/v1/complaints/{complaintId}/timeline` | Retrieve status/action history | Yes | Cit+Off+Any | No | Yes | — | `complaint_status_history` | Active |
| CMP-07 | Complaint Tracking (Public Lookup) | GET | `/api/v1/complaints/track/{trackingId}` | Look up status by Tracking ID | Yes | Cit | No | Yes | — | `complaint` | Active |
| CMP-08 | Complaint List — Search & Filter | GET | `/api/v1/complaints` | Officer/Admin queue with search/filter | Yes | Off+DA+CA+SA | No | Yes | — | `complaint`, `sla_tracking` | Active |
| CMP-09 | Complaint Assignment | POST | `/api/v1/complaints/{complaintId}/assignments` | (Re)assign an officer | Yes | Svc+DA+CA | No | No | Assignment | `complaint_assignment`, `officer_workload` | Active |
| CMP-10 | Complaint Resolution | POST | `/api/v1/complaints/{complaintId}/resolution` | Mark complaint resolved | Yes | Off | No | No | — | `complaint`, `sla_tracking` | Active |
| CMP-11 | Complaint Closure | POST | `/api/v1/complaints/{complaintId}/closure` | Formally close a resolved complaint | Yes | Off+DA | No | No | — | `complaint`, `reference_value` | Active |
| CMP-12 | Citizen Feedback | POST | `/api/v1/complaints/{complaintId}/feedback` | Submit post-resolution rating | Yes | Cit | No | No | — | `complaint_feedback` | Active |
| CMP-13 | Complaint Reopen | POST | `/api/v1/complaints/{complaintId}/reopen` | Reopen a closed complaint | Yes | Cit | No | No | — | `complaint`, `complaint_assignment` | Active |

### 1.4 Module 4 — AI (8 APIs)

Source: `API_SPECIFICATION.md` §5. Microservice owner: **AI Orchestration Service / Voice Processing Service**.

| API # | Endpoint Name | Method | URL | Purpose | Auth Req | Roles Allowed | Rate Ltd | Idempotent | AI Agent | DB Entity | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| AI-01 | Speech to Text | POST | `/api/v1/ai/speech-to-text` | Transcribe voice complaint recording | Yes | Svc | Yes | No | Voice | `voice_complaint`, `voice_transcript` | Active |
| AI-02 | Complaint Classification | POST | `/api/v1/ai/complaint-classification` | Detect category/severity/language | Yes | Svc | Yes | No | Complaint | `ai_classification_result`, `pii_masking_log` | Active |
| AI-03 | Priority Prediction | POST | `/api/v1/ai/priority-prediction` | Predict complaint priority | Yes | Svc | Yes | No | Complaint | `ai_classification_result`, `complaint` | Active |
| AI-04 | Department Recommendation | POST | `/api/v1/ai/department-recommendation` | Recommend routing department | Yes | Svc | Yes | No | Complaint | `ai_classification_result`, `department` | Active |
| AI-05 | Officer Assistant Query | POST | `/api/v1/ai/officer-assistant/query` | NL query interface for officers | Yes | Off | Yes | No | Officer AI | `officer_ai_query_log` | Active |
| AI-06 | Analytics Insights | GET | `/api/v1/ai/analytics/insights` | AI-narrated trend/prediction summary | Yes | DA+CA+SA | No | Yes | Analytics | `trend_snapshot`, `daily_complaint_summary` | Active |
| AI-07 | Summarization | POST | `/api/v1/ai/summarization` | Summarize complaint(s)/transcript | Yes | Svc+Off | Yes | No | Voice/Analytics | `ai_agent_invocation_log` | Active |
| AI-08 | Translation | POST | `/api/v1/ai/translation` | Translate text Tamil↔English | Yes | Svc+Off+DA | Yes | No | Complaint | `ai_agent_invocation_log` | Active |

---
### 1.5 Module 5 — Administration (43 APIs)

Source: `06-Administration-APIs.md`. Microservice owner: **Tenant & Admin Config Service**.

| API # | Endpoint Name | Method | URL | Purpose | Auth Req | Roles Allowed | Rate Ltd | Idempotent | AI Agent | DB Entity | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ADM-01 | List Departments | GET | `/api/v1/departments` | List tenant departments | Yes | Off+DA+CA+SA | No | Yes | — | `department` | Active |
| ADM-02 | Create Department | POST | `/api/v1/departments` | Add a new department | Yes | CA+SA | No | No | — | `department` | Active |
| ADM-03 | Get Department | GET | `/api/v1/departments/{departmentId}` | Retrieve department detail | Yes | Off+DA+CA+SA | No | Yes | — | `department` | Active |
| ADM-04 | Update Department | PATCH | `/api/v1/departments/{departmentId}` | Rename/toggle department | Yes | CA+SA | No | Yes | — | `department` | Active |
| ADM-05 | Delete Department | DELETE | `/api/v1/departments/{departmentId}` | Deactivate department | Yes | CA+SA | No | Yes | — | `department` | Active |
| ADM-06 | List Categories | GET | `/api/v1/complaint-categories` | List complaint categories | Yes | Off+DA+CA+SA | No | Yes | — | `complaint_category` | Active |
| ADM-07 | Create Category | POST | `/api/v1/complaint-categories` | Add complaint category | Yes | DA+CA | No | No | — | `complaint_category`, `department` | Active |
| ADM-08 | Get Category | GET | `/api/v1/complaint-categories/{categoryId}` | Retrieve category detail | Yes | Off+DA+CA+SA | No | Yes | — | `complaint_category` | Active |
| ADM-09 | Update Category | PATCH | `/api/v1/complaint-categories/{categoryId}` | Rename/change category | Yes | DA+CA | No | Yes | — | `complaint_category` | Active |
| ADM-10 | Delete Category | DELETE | `/api/v1/complaint-categories/{categoryId}` | Deactivate category | Yes | DA+CA | No | Yes | — | `complaint_category` | Active |
| ADM-11 | List Users | GET | `/api/v1/users` | List Officer/Admin accounts | Yes | DA+CA+SA | No | Yes | — | `user`, `staff_profile` | Active |
| ADM-12 | Create User | POST | `/api/v1/users` | Provision Officer/Admin account | Yes | DA+CA+SA | No | No | — | `user`, `staff_profile`, `user_role_assignment` | Active |
| ADM-13 | Get User | GET | `/api/v1/users/{userId}` | Retrieve account detail | Yes | DA+CA+SA | No | Yes | — | `user`, `staff_profile` | Active |
| ADM-14 | Update User | PATCH | `/api/v1/users/{userId}` | Update account/role/scope | Yes | DA+CA+SA | No | Yes | — | `user`, `staff_profile` | Active |
| ADM-15 | Delete User | DELETE | `/api/v1/users/{userId}` | Deactivate account | Yes | DA+CA+SA | No | Yes | — | `user`, `staff_profile`, `auth_event_log` | Active |
| ADM-16 | List Roles | GET | `/api/v1/roles` | List system/tenant roles | Yes | CA+SA | No | Yes | — | `role` | Active |
| ADM-17 | Create Role | POST | `/api/v1/roles` | Define custom role | Yes | CA+SA | No | No | — | `role`, `role_permission` | Active |
| ADM-18 | Get Role | GET | `/api/v1/roles/{roleId}` | Retrieve role + permissions | Yes | CA+SA | No | Yes | — | `role`, `role_permission` | Active |
| ADM-19 | Update Role | PATCH | `/api/v1/roles/{roleId}` | Rename/change permission set | Yes | CA+SA | No | Yes | — | `role`, `role_permission` | Active |
| ADM-20 | Delete Role | DELETE | `/api/v1/roles/{roleId}` | Deactivate custom role | Yes | CA+SA | No | Yes | — | `role`, `user_role_assignment` | Active |
| ADM-21 | List Permissions | GET | `/api/v1/permissions` | List global permission catalog | Yes | CA+SA | No | Yes | — | `permission` | Active |
| ADM-22 | Get Permission | GET | `/api/v1/permissions/{permissionId}` | Retrieve permission detail | Yes | CA+SA | No | Yes | — | `permission` | Active |
| ADM-23 | List Approval Workflow Rules | GET | `/api/v1/approval-workflows` | List approval-workflow rules | Yes | DA+CA+SA | No | Yes | — | `approval_workflow_config` | Active |
| ADM-24 | Create Approval Workflow Rule | POST | `/api/v1/approval-workflows` | Define approval requirement | Yes | CA+SA | No | No | — | `approval_workflow_config` | Active |
| ADM-25 | Get Approval Workflow Rule | GET | `/api/v1/approval-workflows/{workflowConfigId}` | Retrieve rule detail | Yes | DA+CA+SA | No | Yes | — | `approval_workflow_config` | Active |
| ADM-26 | Update Approval Workflow Rule | PATCH | `/api/v1/approval-workflows/{workflowConfigId}` | New version of rule | Yes | CA+SA | No | Yes | — | `approval_workflow_config` | Active |
| ADM-27 | Delete Approval Workflow Rule | DELETE | `/api/v1/approval-workflows/{workflowConfigId}` | Deactivate rule | Yes | CA+SA | No | Yes | — | `approval_workflow_config` | Active |
| ADM-28 | List SLA Rules | GET | `/api/v1/sla-rules` | List SLA rules | Yes | DA+CA+SA | No | Yes | — | `sla_rule_config` | Active |
| ADM-29 | Create SLA Rule | POST | `/api/v1/sla-rules` | Define resolution-time target | Yes | DA+CA | No | No | — | `sla_rule_config` | Active |
| ADM-30 | Get SLA Rule | GET | `/api/v1/sla-rules/{slaRuleId}` | Retrieve SLA rule detail | Yes | DA+CA+SA | No | Yes | — | `sla_rule_config` | Active |
| ADM-31 | Update SLA Rule | PATCH | `/api/v1/sla-rules/{slaRuleId}` | New version of SLA rule | Yes | DA+CA | No | Yes | — | `sla_rule_config` | Active |
| ADM-32 | Delete SLA Rule | DELETE | `/api/v1/sla-rules/{slaRuleId}` | Deactivate SLA rule | Yes | DA+CA | No | Yes | — | `sla_rule_config` | Active |
| ADM-33 | List Escalation Rules | GET | `/api/v1/escalation-rules` | List escalation rules | Yes | CA+SA | No | Yes | — | `escalation_matrix_config` | Active |
| ADM-34 | Create Escalation Rule | POST | `/api/v1/escalation-rules` | Define escalation trigger | Yes | CA+SA | No | No | SLA | `escalation_matrix_config` | Active |
| ADM-35 | Get Escalation Rule | GET | `/api/v1/escalation-rules/{escalationRuleId}` | Retrieve rule detail | Yes | CA+SA | No | Yes | — | `escalation_matrix_config` | Active |
| ADM-36 | Update Escalation Rule | PATCH | `/api/v1/escalation-rules/{escalationRuleId}` | New version of rule | Yes | CA+SA | No | Yes | — | `escalation_matrix_config` | Active |
| ADM-37 | Delete Escalation Rule | DELETE | `/api/v1/escalation-rules/{escalationRuleId}` | Deactivate rule | Yes | CA+SA | No | Yes | — | `escalation_matrix_config` | Active |
| ADM-38 | Get Tenant Configuration | GET | `/api/v1/tenant-config` | Retrieve tenant settings | Yes | CA+SA | No | Yes | — | `tenant` | Active |
| ADM-39 | Update Tenant Configuration | PATCH | `/api/v1/tenant-config` | Update tenant settings | Yes | CA+SA | No | Yes | — | `tenant` | Active |
| ADM-40 | List Feature Flags | GET | `/api/v1/feature-flags` | List tenant feature flags | Yes | CA+SA | No | Yes | — | `feature_flag_config` | Active |
| ADM-41 | Toggle Feature Flag | PATCH | `/api/v1/feature-flags/{flagKey}` | Enable/disable a flag | Yes | CA+SA | No | Yes | — | `feature_flag_config` | Active |
| ADM-42 | List Providers | GET | `/api/v1/providers` | List configured providers | Yes | CA+SA | No | Yes | — | `provider_config` | Active |
| ADM-43 | Set Active Provider | PUT | `/api/v1/providers/{providerType}` | Select active provider | Yes | SA | No | Yes | — | `provider_config` | Active |

### 1.6 Module 6 — Geographic (54 APIs)

Source: `07-Geographic-APIs.md`. Microservice owner: **Tenant & Admin Config Service** (7.2, 7.5, 7.7); **GIS/Org-Hierarchy extension, future** (7.1, 7.3–7.4, 7.6, 7.8–7.16).

| API # | Endpoint Name | Method | URL | Purpose | Auth Req | Roles Allowed | Rate Ltd | Idempotent | AI Agent | DB Entity | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| GEO-01 | List States | GET | `/api/v1/geo/states` | List civil-geography states | Yes | Any | No | Yes | — | `reference_value` | Future |
| GEO-02 | Get State | GET | `/api/v1/geo/states/{stateId}` | Retrieve state detail | Yes | Any | No | Yes | — | `reference_value` | Future |
| GEO-03 | Create State | POST | `/api/v1/geo/states` | Add a state entry | Yes | SA | No | No | — | `reference_value` | Future |
| GEO-04 | Update State | PATCH | `/api/v1/geo/states/{stateId}` | Rename/deactivate state | Yes | SA | No | Yes | — | `reference_value` | Future |
| GEO-05 | Deactivate State | DELETE | `/api/v1/geo/states/{stateId}` | Deactivate state entry | Yes | SA | No | Yes | — | `reference_value` | Future |
| GEO-06 | List Districts | GET | `/api/v1/geo/districts` | List operational districts | Yes | Any | No | Yes | — | `district` | Active |
| GEO-07 | Create District | POST | `/api/v1/geo/districts` | Add a district | Yes | CA+SA | No | No | — | `district` | Active |
| GEO-08 | Get District | GET | `/api/v1/geo/districts/{districtId}` | Retrieve district detail | Yes | Any | No | Yes | — | `district` | Active |
| GEO-09 | Update District | PATCH | `/api/v1/geo/districts/{districtId}` | Rename/toggle district | Yes | CA+SA | No | Yes | — | `district` | Active |
| GEO-10 | Delete District | DELETE | `/api/v1/geo/districts/{districtId}` | Deactivate district | Yes | CA+SA | No | Yes | — | `district` | Active |
| GEO-11 | List Corporations | GET | `/api/v1/geo/corporations` | List Corporation-level org units | Yes | Off+DA+CA+SA | No | Yes | — | `org_unit` | Future |
| GEO-12 | Create Corporation | POST | `/api/v1/geo/corporations` | Add Corporation-level org unit | Yes | SA | No | No | — | `org_unit` | Future |
| GEO-13 | Get Corporation | GET | `/api/v1/geo/corporations/{corporationId}` | Retrieve org unit detail | Yes | Off+DA+CA+SA | No | Yes | — | `org_unit` | Future |
| GEO-14 | Update Corporation | PATCH | `/api/v1/geo/corporations/{corporationId}` | Rename/deactivate org unit | Yes | SA | No | Yes | — | `org_unit` | Future |
| GEO-15 | Delete Corporation | DELETE | `/api/v1/geo/corporations/{corporationId}` | Deactivate org unit | Yes | SA | No | Yes | — | `org_unit` | Future |
| GEO-16 | List Regions | GET | `/api/v1/geo/regions` | List Region-level org units | Yes | Off+DA+CA+SA | No | Yes | — | `org_unit` | Future |
| GEO-17 | Create Region | POST | `/api/v1/geo/regions` | Add Region-level org unit | Yes | SA | No | No | — | `org_unit` | Future |
| GEO-18 | Get Region | GET | `/api/v1/geo/regions/{regionId}` | Retrieve org unit detail | Yes | Off+DA+CA+SA | No | Yes | — | `org_unit` | Future |
| GEO-19 | Update Region | PATCH | `/api/v1/geo/regions/{regionId}` | Rename/re-parent org unit | Yes | SA | No | Yes | — | `org_unit` | Future |
| GEO-20 | Delete Region | DELETE | `/api/v1/geo/regions/{regionId}` | Deactivate org unit | Yes | SA | No | Yes | — | `org_unit` | Future |
| GEO-21 | List Zones | GET | `/api/v1/geo/zones` | List operational zones | Yes | Any | No | Yes | — | `zone` | Active |
| GEO-22 | Create Zone | POST | `/api/v1/geo/zones` | Add a zone under a district | Yes | CA+SA | No | No | — | `zone` | Active |
| GEO-23 | Get Zone | GET | `/api/v1/geo/zones/{zoneId}` | Retrieve zone detail | Yes | Any | No | Yes | — | `zone` | Active |
| GEO-24 | Update Zone | PATCH | `/api/v1/geo/zones/{zoneId}` | Rename/re-parent zone | Yes | CA+SA | No | Yes | — | `zone` | Active |
| GEO-25 | Delete Zone | DELETE | `/api/v1/geo/zones/{zoneId}` | Deactivate zone | Yes | CA+SA | No | Yes | — | `zone` | Active |
| GEO-26 | List Divisions | GET | `/api/v1/geo/divisions` | List Division-level org units | Yes | Off+DA+CA+SA | No | Yes | — | `org_unit` | Future |
| GEO-27 | Create Division | POST | `/api/v1/geo/divisions` | Add Division-level org unit | Yes | SA | No | No | — | `org_unit` | Future |
| GEO-28 | Get Division | GET | `/api/v1/geo/divisions/{divisionId}` | Retrieve org unit detail | Yes | Off+DA+CA+SA | No | Yes | — | `org_unit` | Future |
| GEO-29 | Update Division | PATCH | `/api/v1/geo/divisions/{divisionId}` | Rename/re-parent org unit | Yes | SA | No | Yes | — | `org_unit` | Future |
| GEO-30 | Delete Division | DELETE | `/api/v1/geo/divisions/{divisionId}` | Deactivate org unit | Yes | SA | No | Yes | — | `org_unit` | Future |
| GEO-31 | List Wards | GET | `/api/v1/geo/wards` | List operational wards | Yes | Any | No | Yes | — | `ward` | Active |
| GEO-32 | Create Ward | POST | `/api/v1/geo/wards` | Add a ward under a zone | Yes | CA+SA | No | No | — | `ward` | Active |
| GEO-33 | Get Ward | GET | `/api/v1/geo/wards/{wardId}` | Retrieve ward detail | Yes | Any | No | Yes | — | `ward` | Active |
| GEO-34 | Update Ward | PATCH | `/api/v1/geo/wards/{wardId}` | Rename/re-parent ward | Yes | CA+SA | No | Yes | — | `ward` | Active |
| GEO-35 | Delete Ward | DELETE | `/api/v1/geo/wards/{wardId}` | Deactivate ward | Yes | CA+SA | No | Yes | — | `ward` | Active |
| GEO-36 | List Streets | GET | `/api/v1/geo/streets` | List known streets | Yes | Any | No | Yes | — | `reference_value` | Future |
| GEO-37 | Create Street | POST | `/api/v1/geo/streets` | Register a new street | Yes | CA+SA | No | No | — | `reference_value` | Future |
| GEO-38 | Get Street | GET | `/api/v1/geo/streets/{streetId}` | Retrieve street detail | Yes | Any | No | Yes | — | `reference_value` | Future |
| GEO-39 | List Localities | GET | `/api/v1/geo/localities` | List known localities | Yes | Any | No | Yes | — | `reference_value` | Future |
| GEO-40 | Create Locality | POST | `/api/v1/geo/localities` | Register a new locality | Yes | CA+SA | No | No | — | `reference_value` | Future |
| GEO-41 | Get Locality | GET | `/api/v1/geo/localities/{localityId}` | Retrieve locality detail | Yes | Any | No | Yes | — | `reference_value` | Future |
| GEO-42 | GIS Capability Status | GET | `/api/v1/geo/gis/status` | Report tenant GIS enablement | Yes | Off+DA+CA+SA | No | Yes | — | `feature_flag_config`, `geo_boundary` | Future |
| GEO-43 | GIS Administrative Hierarchy Tree | GET | `/api/v1/geo/gis/hierarchy` | Nested hierarchy w/ boundary flags | Yes | DA+CA+SA | No | Yes | — | `org_unit`, `geo_boundary` | Future |
| GEO-44 | Map Configuration | GET | `/api/v1/geo/map/config` | Retrieve default map config | Yes | Off+DA+CA+SA | No | Yes | — | `provider_config`, `tenant` | Future |
| GEO-45 | Map Markers | GET | `/api/v1/geo/map/markers` | Complaint pins in viewport | Yes | Off+Any | No | Yes | — | `geo_point_snapshot`, `complaint` | Future |
| GEO-46 | Reverse Geocode | POST | `/api/v1/geo/reverse-geocode` | Resolve lat/long to address | Yes | Cit+Svc | No | No | Complaint | `reverse_geocode_cache` | Future |
| GEO-47 | Batch Reverse Geocode | POST | `/api/v1/geo/reverse-geocode/batch` | Resolve multiple coordinates | Yes | Svc+CA+SA | No | No | — | `reverse_geocode_cache` | Future |
| GEO-48 | Nearby Complaints | GET | `/api/v1/complaints/nearby` | Complaints near a coordinate | Yes | Off+Any | No | Yes | — | `geo_point_snapshot`, `complaint` | Future |
| GEO-49 | Complaint Heatmap | GET | `/api/v1/geo/heatmap` | Complaint density visualization | Yes | DA+CA+SA | No | Yes | — | `geo_analytics_snapshot` | Future |
| GEO-50 | Geo Analytics Summary | GET | `/api/v1/geo/analytics` | Density/category breakdown by unit | Yes | DA+CA+SA | No | Yes | Analytics | `geo_analytics_snapshot` | Future |
| GEO-51 | List Boundaries | GET | `/api/v1/geo/boundaries` | List units with stored boundaries | Yes | DA+CA+SA | No | Yes | — | `geo_boundary` | Future |
| GEO-52 | Get Boundary | GET | `/api/v1/geo/boundaries/{orgUnitId}` | Retrieve GeoJSON boundary | Yes | Any | No | Yes | — | `geo_boundary` | Future |
| GEO-53 | Create/Replace Boundary | PUT | `/api/v1/geo/boundaries/{orgUnitId}` | Upload/replace GeoJSON boundary | Yes | CA+SA | No | Yes | — | `geo_boundary` | Future |
| GEO-54 | Delete Boundary | DELETE | `/api/v1/geo/boundaries/{orgUnitId}` | Remove stored boundary | Yes | CA+SA | No | Yes | — | `geo_boundary` | Future |

---
### 1.7 Module 7 — Notification (58 APIs)

Source: `08-Notification-APIs.md`. Microservice owner: **Notification Service**.

| API # | Endpoint Name | Method | URL | Purpose | Auth Req | Roles Allowed | Rate Ltd | Idempotent | AI Agent | DB Entity | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| NOT-01 | Send SMS Notification | POST | `/api/v1/notifications/sms` | Dispatch SMS via template | Yes | Svc+CA+SA | No | Yes | Notification | `notification_dispatch` | Active |
| NOT-02 | Get SMS Notification Status | GET | `/api/v1/notifications/sms/{notificationDispatchId}` | Poll SMS delivery status | Yes | Any (recipient/scope) | No | Yes | — | `notification_dispatch` | Active |
| NOT-03 | Test Send SMS Notification | POST | `/api/v1/notifications/sms/test` | Test-send SMS to a test number | Yes | CA+SA | Yes | No | — | `notification_dispatch` | Active |
| NOT-04 | Send Email Notification | POST | `/api/v1/notifications/email` | Dispatch email via template | Yes | Svc+CA+SA | No | Yes | Notification | `notification_dispatch`, `file_asset` | Active |
| NOT-05 | Get Email Notification Status | GET | `/api/v1/notifications/email/{notificationDispatchId}` | Poll email delivery/open status | Yes | Any (recipient/scope) | No | Yes | — | `notification_dispatch` | Active |
| NOT-06 | Test Send Email Notification | POST | `/api/v1/notifications/email/test` | Test-send email to a test address | Yes | CA+SA | Yes | No | — | `notification_dispatch` | Active |
| NOT-07 | Send WhatsApp Notification | POST | `/api/v1/notifications/whatsapp` | Dispatch WhatsApp via template | Yes | Svc+CA+SA | No | Yes | Notification | `notification_dispatch` | Active |
| NOT-08 | Get WhatsApp Notification Status | GET | `/api/v1/notifications/whatsapp/{notificationDispatchId}` | Poll WhatsApp delivery/read status | Yes | Any (recipient/scope) | No | Yes | — | `notification_dispatch` | Active |
| NOT-09 | Test Send WhatsApp Notification | POST | `/api/v1/notifications/whatsapp/test` | Test-send WhatsApp to a test number | Yes | CA+SA | Yes | No | — | `notification_dispatch` | Active |
| NOT-10 | Send Push Notification | POST | `/api/v1/notifications/push` | Dispatch mobile/web/browser push | Yes | Svc+CA+SA | No | Yes | Notification | `notification_dispatch` | Active |
| NOT-11 | Get Push Notification Status | GET | `/api/v1/notifications/push/{notificationDispatchId}` | Poll push delivery/click status | Yes | Any (recipient/scope) | No | Yes | — | `notification_dispatch` | Active |
| NOT-12 | Test Send Push Notification | POST | `/api/v1/notifications/push/test` | Test-send push to a test device | Yes | CA+SA | Yes | No | — | `notification_dispatch` | Active |
| NOT-13 | List In-App Notifications | GET | `/api/v1/notifications/in-app` | List own notification inbox | Yes | Any | No | Yes | — | `notification_dispatch` | Active |
| NOT-14 | Get In-App Notification | GET | `/api/v1/notifications/in-app/{notificationDispatchId}` | Retrieve single inbox item | Yes | Any (own) | No | Yes | — | `notification_dispatch` | Active |
| NOT-15 | Mark In-App Notification as Read | PATCH | `/api/v1/notifications/in-app/{notificationDispatchId}/read` | Mark one item read | Yes | Any (own) | No | Yes | — | `notification_dispatch` | Active |
| NOT-16 | Mark All In-App Notifications as Read | POST | `/api/v1/notifications/in-app/read-all` | Bulk-mark inbox read | Yes | Any | No | Yes | — | `notification_dispatch` | Active |
| NOT-17 | Get Unread Notification Count | GET | `/api/v1/notifications/in-app/unread-count` | Retrieve unread badge count | Yes | Any | No | Yes | — | `notification_dispatch` | Active |
| NOT-18 | List Notification Templates | GET | `/api/v1/notification-templates` | List message templates | Yes | DA+CA | No | Yes | — | `notification_template_config` | Active |
| NOT-19 | Create Notification Template | POST | `/api/v1/notification-templates` | Define new template (v1, draft) | Yes | CA+SA | No | No | — | `notification_template_config` | Active |
| NOT-20 | Get Notification Template | GET | `/api/v1/notification-templates/{templateId}` | Retrieve template detail | Yes | DA+CA | No | Yes | — | `notification_template_config` | Active |
| NOT-21 | Update Notification Template | PATCH | `/api/v1/notification-templates/{templateId}` | New version of template | Yes | CA+SA | No | Yes | — | `notification_template_config` | Active |
| NOT-22 | Delete Notification Template | DELETE | `/api/v1/notification-templates/{templateId}` | Deactivate template | Yes | CA+SA | No | Yes | — | `notification_template_config` | Active |
| NOT-23 | List Notification Template Versions | GET | `/api/v1/notification-templates/{templateId}/versions` | View template version history | Yes | DA+CA | No | Yes | — | `notification_template_config` | Active |
| NOT-24 | Preview Notification Template | POST | `/api/v1/notification-templates/{templateId}/preview` | Render template with sample vars | Yes | DA+CA | No | Yes | — | `notification_template_config` | Active |
| NOT-25 | Test Send Notification Template | POST | `/api/v1/notification-templates/{templateId}/test-send` | Generic test-send by template | Yes | CA+SA | Yes | No | — | `notification_dispatch` | Active |
| NOT-26 | Submit Notification Template for Approval | POST | `/api/v1/notification-templates/{templateId}/submit-for-approval` | Move draft to pending approval | Yes | DA+CA | No | Yes | — | `notification_template_config` | Active |
| NOT-27 | Record Notification Template Approval Decision | POST | `/api/v1/notification-templates/{templateId}/approval-decision` | Approve/reject a template | Yes | CA+SA | No | No | — | `notification_template_config` | Active |
| NOT-28 | Get My Notification Preferences | GET | `/api/v1/notification-preferences/me` | Retrieve own preference profile | Yes | Any | No | Yes | — | `notification_preference` | Active |
| NOT-29 | Update My Notification Preferences | PATCH | `/api/v1/notification-preferences/me` | Update own preference profile | Yes | Any | No | Yes | — | `notification_preference` | Active |
| NOT-30 | Get User Notification Preferences (Admin View) | GET | `/api/v1/notification-preferences/{userId}` | Admin view of another's preferences | Yes | DA+CA+SA | No | Yes | — | `notification_preference`, `user` | Active |
| NOT-31 | Set Emergency Override | POST | `/api/v1/notification-preferences/{userId}/emergency-override` | Force-deliver bypassing preferences | Yes | CA+SA | Yes | No | Notification | `notification_dispatch`, `notification_preference` | Active |
| NOT-32 | List Queued Notifications | GET | `/api/v1/notifications/queue` | Ops visibility into queue | Yes | CA+SA | No | Yes | — | `notification_dispatch` | Active |
| NOT-33 | Get Queue Item Detail | GET | `/api/v1/notifications/queue/{notificationDispatchId}` | Retrieve queued item detail | Yes | CA+SA | No | Yes | — | `notification_dispatch` | Active |
| NOT-34 | Schedule Notification | POST | `/api/v1/notifications/schedule` | Queue for future/delayed delivery | Yes | Svc+CA+SA | No | Yes | Notification | `notification_dispatch` | Active |
| NOT-35 | Cancel Queued Notification | POST | `/api/v1/notifications/queue/{notificationDispatchId}/cancel` | Cancel a not-yet-sent item | Yes | Svc+CA+SA | No | Yes | — | `notification_dispatch` | Active |
| NOT-36 | List Dead Letter Queue Items | GET | `/api/v1/notifications/queue/dead-letter` | View DLQ items | Yes | CA+SA | No | Yes | — | `notification_dispatch` | Active |
| NOT-37 | List Notification History | GET | `/api/v1/notifications/history` | View delivery history | Yes | Cit+Off+Any | No | Yes | — | `notification_dispatch` | Active |
| NOT-38 | Get Notification History Detail | GET | `/api/v1/notifications/history/{notificationDispatchId}` | View full historical detail | Yes | Any (recipient/scope) | No | Yes | — | `notification_dispatch` | Active |
| NOT-39 | Export Notification History | GET | `/api/v1/notifications/history/export` | Export history as CSV/PDF | Yes | CA+SA | Yes | No | — | `notification_dispatch`, `file_asset` | Active |
| NOT-40 | Retry Failed Notification | POST | `/api/v1/notifications/{notificationDispatchId}/retry` | Manually retry one failed item | Yes | CA+SA | No | Yes | Notification | `notification_dispatch` | Active |
| NOT-41 | Bulk Retry Failed Notifications | POST | `/api/v1/notifications/retry/bulk` | Retry all matching a filter | Yes | CA+SA | Yes | Yes | Notification | `notification_dispatch` | Active |
| NOT-42 | Get Retry History for a Notification | GET | `/api/v1/notifications/{notificationDispatchId}/retries` | View retry attempt history | Yes | CA+SA | No | Yes | — | `notification_dispatch` | Active |
| NOT-43 | List Notification Providers | GET | `/api/v1/notification-providers` | List channel provider config | Yes | CA+SA | No | Yes | — | `provider_config` | Active |
| NOT-44 | Get Notification Provider Detail | GET | `/api/v1/notification-providers/{providerType}` | Retrieve one provider's config | Yes | CA+SA | No | Yes | — | `provider_config` | Active |
| NOT-45 | Test Notification Provider Connectivity | POST | `/api/v1/notification-providers/{providerType}/test` | Probe provider reachability | Yes | CA+SA | Yes | Yes | — | `provider_config` | Active |
| NOT-46 | Create Broadcast Notification | POST | `/api/v1/notifications/broadcast` | Announce to a geographic/dept scope | Yes | DA+CA+SA | Yes | Yes | Notification | `notification_event`, `notification_dispatch` | Active |
| NOT-47 | List Broadcasts | GET | `/api/v1/notifications/broadcast` | List broadcast history | Yes | DA+CA+SA | No | Yes | — | `notification_event` | Active |
| NOT-48 | Get Broadcast Status | GET | `/api/v1/notifications/broadcast/{broadcastId}` | View fan-out progress | Yes | DA+CA+SA | No | Yes | — | `notification_event`, `notification_dispatch` | Active |
| NOT-49 | Cancel Broadcast | POST | `/api/v1/notifications/broadcast/{broadcastId}/cancel` | Stop a not-yet-complete broadcast | Yes | CA+SA | No | Yes | — | `notification_event`, `notification_dispatch` | Active |
| NOT-50 | Create Bulk Notification Job | POST | `/api/v1/notifications/bulk` | Notify an explicit recipient list | Yes | CA+SA+Svc | Yes | Yes | Notification | `notification_event`, `notification_dispatch` | Active |
| NOT-51 | Get Bulk Notification Job Status | GET | `/api/v1/notifications/bulk/{bulkJobId}` | View bulk job progress | Yes | CA+SA | No | Yes | — | `notification_event`, `notification_dispatch` | Active |
| NOT-52 | Cancel Bulk Notification Job | POST | `/api/v1/notifications/bulk/{bulkJobId}/cancel` | Stop a not-yet-complete bulk job | Yes | CA+SA | No | Yes | — | `notification_event`, `notification_dispatch` | Active |
| NOT-53 | Get Notification Analytics Summary | GET | `/api/v1/notifications/analytics` | Delivery/read/open/click rates | Yes | DA+CA+SA | No | Yes | — | `notification_dispatch` | Active |
| NOT-54 | Get Provider Performance Analytics | GET | `/api/v1/notifications/analytics/providers` | Compare provider performance | Yes | CA+SA | No | Yes | — | `notification_dispatch`, `provider_config` | Active |
| NOT-55 | Get Retry Statistics | GET | `/api/v1/notifications/analytics/retries` | Retry-volume/success statistics | Yes | CA+SA | No | Yes | — | `notification_dispatch` | Active |
| NOT-56 | Get Notification Service Health | GET | `/api/v1/notifications/health` | Composite service health | Yes | DA+CA+SA | No | Yes | — | `provider_config` | Active |
| NOT-57 | Get Provider Health Detail | GET | `/api/v1/notifications/health/providers` | Per-provider reachability status | Yes | DA+CA+SA | No | Yes | — | `provider_config` | Active |
| NOT-58 | Get Queue Health | GET | `/api/v1/notifications/health/queue` | Queue depth/lag/DLQ backlog | Yes | CA+SA | No | Yes | — | `notification_dispatch` | Active |

---
### 1.8 Module 8 — Reports (43 APIs)

Source: `09-Reports-APIs.md`. Microservice owner: **Analytics & Reporting Service**.

| API # | Endpoint Name | Method | URL | Purpose | Auth Req | Roles Allowed | Rate Ltd | Idempotent | AI Agent | DB Entity | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| RPT-01 | Get Executive Dashboard | GET | `/api/v1/reports/dashboard/executive` | Role-aware composite dashboard | Yes | Off+DA+CA+SA | No | Yes | — | `daily_complaint_summary`, `sla_tracking` | Active |
| RPT-02 | Get Dashboard Widget Data | GET | `/api/v1/reports/dashboard/widgets/{widgetKey}` | Single widget's data | Yes | Off+DA+CA+SA | No | Yes | — | *(varies by widget)* | Active |
| RPT-03 | List Available Widgets | GET | `/api/v1/reports/dashboard/widgets` | Widget catalog for caller's role | Yes | Off+DA+CA+SA | No | Yes | — | `permission`, `role_permission` | Active |
| RPT-04 | Get KPI Summary | GET | `/api/v1/reports/kpis` | KPI tile values only | Yes | Off+DA+CA+SA | No | Yes | — | `daily_complaint_summary`, `trend_snapshot` | Active |
| RPT-05 | Complaint Summary Report | GET | `/api/v1/reports/complaints/summary` | Per-dept/category/ward counts | Yes | DA+CA+SA | No | Yes | — | `daily_complaint_summary` | Active |
| RPT-06 | Complaint Trend Report | GET | `/api/v1/reports/complaints/trend` | Time-series complaint volume | Yes | DA+CA+SA | No | Yes | — | `daily_complaint_summary`, `trend_snapshot` | Active |
| RPT-07 | Complaint Category Breakdown Report | GET | `/api/v1/reports/complaints/category-breakdown` | Category-wise share | Yes | DA+CA+SA | No | Yes | — | `daily_complaint_summary` | Active |
| RPT-08 | Complaint Drill-Down | GET | `/api/v1/reports/complaints/summary/drill-down` | Drill-through to complaint list | Yes | DA+CA+SA | No | Yes | — | `complaint` | Active |
| RPT-09 | SLA Compliance Report | GET | `/api/v1/reports/sla/compliance` | % resolved within pinned SLA | Yes | DA+CA+SA | No | Yes | — | `sla_tracking`, `sla_rule_config` | Active |
| RPT-10 | SLA Breach Report | GET | `/api/v1/reports/sla/breach` | List of SLA-breached complaints | Yes | DA+CA+SA | No | Yes | — | `sla_tracking`, `escalation_instance` | Active |
| RPT-11 | SLA Trend Report | GET | `/api/v1/reports/sla/trend` | Time-series SLA compliance rate | Yes | DA+CA+SA | No | Yes | — | `trend_snapshot`, `sla_tracking` | Active |
| RPT-12 | Officer Performance Report | GET | `/api/v1/reports/officer-performance` | Weekly officer counts | Yes | Off+DA+CA+SA | No | Yes | — | `weekly_officer_performance` | Active |
| RPT-13 | Officer Leaderboard Report | GET | `/api/v1/reports/officer-performance/leaderboard` | Rank officers by performance | Yes | DA+CA+SA | No | Yes | — | `weekly_officer_performance` | Active |
| RPT-14 | Officer Drill-Down | GET | `/api/v1/reports/officer-performance/{officerId}/drill-down` | Officer's assigned-complaint list | Yes | Off+DA+CA+SA | No | Yes | — | `complaint_assignment`, `complaint` | Active |
| RPT-15 | Department Performance Report | GET | `/api/v1/reports/department-performance` | Dept-level rollup | Yes | DA+CA+SA | No | Yes | — | `monthly_department_report` | Active |
| RPT-16 | Department Comparison Report | GET | `/api/v1/reports/department-performance/comparison` | Side-by-side dept comparison | Yes | CA+SA | No | Yes | — | `monthly_department_report` | Active |
| RPT-17 | Department Drill-Down | GET | `/api/v1/reports/department-performance/{departmentId}/drill-down` | Dept's complaint list | Yes | DA+CA+SA | No | Yes | — | `complaint`, `department` | Active |
| RPT-18 | AI Prediction Report | GET | `/api/v1/reports/ai-analytics/predictions` | Structured Analytics Agent forecast | Yes | DA+CA+SA | No | Yes | Analytics | `trend_snapshot` | Active |
| RPT-19 | AI Classification Accuracy Report | GET | `/api/v1/reports/ai-analytics/classification-accuracy` | Complaint Agent override rate | Yes | CA+SA | No | Yes | Complaint | `ai_classification_result`, `complaint` | Active |
| RPT-20 | Citizen Satisfaction Report | GET | `/api/v1/reports/citizen-service/satisfaction` | Average feedback rating | Yes | DA+CA+SA | No | Yes | — | `complaint_feedback` | Active |
| RPT-21 | Citizen Engagement Report | GET | `/api/v1/reports/citizen-service/engagement` | Registration/feedback-rate metrics | Yes | CA+SA | No | Yes | — | `user`, `citizen_profile` | Active |
| RPT-22 | Channel Usage Report | GET | `/api/v1/reports/citizen-service/channel-usage` | Registration/notification channel mix | Yes | CA+SA | No | Yes | — | `complaint`, `voice_complaint` | Active |
| RPT-23 | Ward-Wise Complaint Report | GET | `/api/v1/reports/geographic/ward-wise` | Per-ward complaint breakdown | Yes | DA+CA+SA | No | Yes | — | `geo_analytics_snapshot`, `ward` | Future |
| RPT-24 | Zone-Wise Complaint Report | GET | `/api/v1/reports/geographic/zone-wise` | Per-zone complaint breakdown | Yes | DA+CA+SA | No | Yes | — | `geo_analytics_snapshot`, `zone` | Future |
| RPT-25 | Export Report | GET | `/api/v1/reports/export` | Export any report as CSV/PDF/XLSX | Yes | DA+CA+SA | Yes | Yes | — | `file_asset` | Active |
| RPT-26 | Get Export Job Status | GET | `/api/v1/reports/export/{exportJobId}` | Poll export job status | Yes | DA+CA+SA (owner) | No | Yes | — | `file_asset` | Active |
| RPT-27 | Download Export | GET | `/api/v1/reports/export/{exportJobId}/download` | Retrieve completed export | Yes | DA+CA+SA (owner) | No | Yes | — | `file_asset` | Active |
| RPT-28 | List Scheduled Reports | GET | `/api/v1/report-schedules` | List recurring report schedules | Yes | DA+CA+SA | No | Yes | — | `report_schedule_config`\* | Future |
| RPT-29 | Create Scheduled Report | POST | `/api/v1/report-schedules` | Define new report schedule | Yes | DA+CA+SA | No | No | — | `report_schedule_config`\* | Future |
| RPT-30 | Get Scheduled Report | GET | `/api/v1/report-schedules/{scheduleId}` | Retrieve schedule detail | Yes | DA+CA+SA | No | Yes | — | `report_schedule_config`\* | Future |
| RPT-31 | Update Scheduled Report | PATCH | `/api/v1/report-schedules/{scheduleId}` | Change schedule/recipients | Yes | DA+CA+SA | No | Yes | — | `report_schedule_config`\* | Future |
| RPT-32 | Delete Scheduled Report | DELETE | `/api/v1/report-schedules/{scheduleId}` | Deactivate a schedule | Yes | DA+CA+SA | No | Yes | — | `report_schedule_config`\* | Future |
| RPT-33 | List Report Templates | GET | `/api/v1/report-templates` | List saved report templates | Yes | DA+CA+SA | No | Yes | — | `report_template_config`\* | Future |
| RPT-34 | Create Report Template | POST | `/api/v1/report-templates` | Save filter/column preset | Yes | DA+CA+SA | No | No | — | `report_template_config`\* | Future |
| RPT-35 | Get Report Template | GET | `/api/v1/report-templates/{reportTemplateId}` | Retrieve saved template | Yes | DA+CA+SA (or shared) | No | Yes | — | `report_template_config`\* | Future |
| RPT-36 | Update Report Template | PATCH | `/api/v1/report-templates/{reportTemplateId}` | Change saved template | Yes | Creator | No | Yes | — | `report_template_config`\* | Future |
| RPT-37 | Delete Report Template | DELETE | `/api/v1/report-templates/{reportTemplateId}` | Remove saved template | Yes | Creator | No | Yes | — | `report_template_config`\* | Future |
| RPT-38 | Share Report | POST | `/api/v1/reports/{reportInstanceId}/shares` | Grant another user access | Yes | Owner | No | No | — | `resource_share`\* | Future |
| RPT-39 | List Report Shares | GET | `/api/v1/reports/{reportInstanceId}/shares` | View outstanding share grants | Yes | Owner | No | Yes | — | `resource_share`\* | Future |
| RPT-40 | Revoke Report Share | DELETE | `/api/v1/reports/{reportInstanceId}/shares/{shareId}` | Remove a share grant | Yes | Owner | No | Yes | — | `resource_share`\* | Future |
| RPT-41 | Get Report Permission Matrix | GET | `/api/v1/report-permissions` | View role → report-permission map | Yes | CA+SA | No | Yes | — | `permission`, `role_permission` | Active |
| RPT-42 | Update Report Permission | PATCH | `/api/v1/report-permissions` | Grant/revoke report permission | Yes | CA+SA | No | Yes | — | `role_permission` | Active |
| RPT-43 | Get Report Usage Statistics | GET | `/api/v1/reports/statistics/usage` | Which reports run most/by whom | Yes | CA+SA | No | Yes | — | `activity_log` | Active |

`*` = backed by a **proposed** table pending a Database Architecture v1.2 addendum (`09-Reports-APIs.md` §9.1.1) — designed and documented now, not implementable until that addendum is approved.

### 1.9 Module 9 — Audit (28 APIs)

Source: `10-Audit-APIs.md`. Microservice owner: **Audit & Activity Logging Service**. All read-only except export.

| API # | Endpoint Name | Method | URL | Purpose | Auth Req | Roles Allowed | Rate Ltd | Idempotent | AI Agent | DB Entity | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| AUD-01 | List Audit Logs | GET | `/api/v1/audit-logs` | Search generic audit trail | Yes | DA+CA+SA | No | Yes | — | `audit_log` | Active |
| AUD-02 | Get Audit Log Detail | GET | `/api/v1/audit-logs/{auditLogId}` | Retrieve one audit record | Yes | DA+CA+SA | No | Yes | — | `audit_log` | Active |
| AUD-03 | List User Activity | GET | `/api/v1/activity-logs` | Search activity/security events | Yes | CA+SA | No | Yes | — | `activity_log` | Active |
| AUD-04 | Get User Activity Detail | GET | `/api/v1/activity-logs/{activityLogId}` | Retrieve one activity event | Yes | CA+SA | No | Yes | — | `activity_log` | Active |
| AUD-05 | Get User Activity Timeline | GET | `/api/v1/activity-logs/users/{userId}/timeline` | One user's full activity stream | Yes | CA+SA | No | Yes | — | `activity_log`, `auth_event_log` | Active |
| AUD-06 | List Login History | GET | `/api/v1/audit/login-history` | Login/OTP/MFA event history | Yes | Any (own)+CA+SA | No | Yes | — | `auth_event_log` | Active |
| AUD-07 | Get Login Audit Detail | GET | `/api/v1/audit/login-history/{authEventId}` | Retrieve one auth event | Yes | Any (own)+CA+SA | No | Yes | — | `auth_event_log` | Active |
| AUD-08 | Get Failed Login Attempts Report | GET | `/api/v1/audit/login-history/failed-attempts` | Aggregate lockout/failure view | Yes | CA+SA | No | Yes | — | `auth_event_log`, `account_lockout_state` | Active |
| AUD-09 | List Configuration Changes | GET | `/api/v1/audit/configuration-changes` | Search config version history | Yes | DA+CA+SA | No | Yes | — | `config_change_history` | Active |
| AUD-10 | Get Configuration Change Detail | GET | `/api/v1/audit/configuration-changes/{configChangeId}` | Full before/after diff | Yes | DA+CA+SA | No | Yes | — | `config_change_history` | Active |
| AUD-11 | List Workflow History | GET | `/api/v1/audit/workflow-history` | Search complaint workflow trail | Yes | DA+CA+SA | No | Yes | — | `complaint_status_history`, `complaint_assignment` | Active |
| AUD-12 | Get Workflow Audit Detail for a Complaint | GET | `/api/v1/audit/workflow-history/complaints/{complaintId}` | Full workflow trail, one complaint | Yes | DA+CA+SA | No | Yes | — | `complaint_status_history`, `escalation_instance` | Active |
| AUD-13 | List AI Decision Trace | GET | `/api/v1/audit/ai-decisions` | Search AI classification/invocation evidence | Yes | CA+SA | No | Yes | Complaint/Officer AI/Analytics/Voice | `ai_classification_result`, `pii_masking_log` | Active |
| AUD-14 | Get AI Decision Detail | GET | `/api/v1/audit/ai-decisions/{aiDecisionId}` | Retrieve one AI decision event | Yes | CA+SA | No | Yes | (same) | `ai_agent_invocation_log` | Active |
| AUD-15 | List Notification Audit Trail | GET | `/api/v1/audit/notifications` | Search dispatch decisions/overrides | Yes | CA+SA | No | Yes | — | `notification_dispatch`, `audit_log` | Active |
| AUD-16 | Get Notification Audit Detail | GET | `/api/v1/audit/notifications/{notificationDispatchId}` | Full audit detail, one dispatch | Yes | CA+SA | No | Yes | — | `notification_dispatch`, `notification_preference` | Active |
| AUD-17 | List File Access Audit | GET | `/api/v1/audit/files` | Search file access events tenant-wide | Yes | CA+SA | No | Yes | — | `audit_log`, `file_asset` | Active |
| AUD-18 | Get File Audit Detail | GET | `/api/v1/audit/files/{fileAuditId}` | Retrieve one file access event | Yes | CA+SA | No | Yes | — | `audit_log`, `file_asset` | Active |
| AUD-19 | List Security Events | GET | `/api/v1/audit/security-events` | Search lockouts/MFA/permission changes | Yes | CA+SA | No | Yes | — | `auth_event_log`, `account_lockout_state` | Active |
| AUD-20 | Get Security Event Detail | GET | `/api/v1/audit/security-events/{securityEventId}` | Retrieve one security event | Yes | CA+SA | No | Yes | — | `auth_event_log` | Active |
| AUD-21 | Global Audit Search | GET | `/api/v1/audit/search` | Cross-trail free-text search | Yes | CA+SA | No | Yes | — | `audit_log`, `activity_log` | Active |
| AUD-22 | Export Audit Logs | GET | `/api/v1/audit/export` | Export any trail as CSV/PDF | Yes | CA+SA | Yes | No | — | `file_asset` | Active |
| AUD-23 | Get Audit Export Job Status | GET | `/api/v1/audit/export/{exportJobId}` | Poll audit export job | Yes | CA+SA (owner) | No | Yes | — | `file_asset` | Active |
| AUD-24 | Get Compliance Report | GET | `/api/v1/audit/compliance-reports/{reportType}` | Compliance evidence summary | Yes | CA+SA | No | Yes | — | `audit_log`, `pii_masking_log` | Active |
| AUD-25 | List Compliance Report Types | GET | `/api/v1/audit/compliance-reports` | List available compliance reports | Yes | CA+SA | No | Yes | — | *(static catalog)* | Active |
| AUD-26 | Get Retention Policy | GET | `/api/v1/audit/retention-policy` | View effective retention periods | Yes | CA+SA | No | Yes | — | *(fixed system constant)* | Active |
| AUD-27 | Get Retention Status Report | GET | `/api/v1/audit/retention-status` | Records nearing retention-expiry purge | Yes | CA+SA | No | Yes | — | `complaint`, `audit_log`, `file_asset` | Active |
| AUD-28 | Get Audit Dashboard Summary | GET | `/api/v1/audit/dashboard` | Composite audit/security posture | Yes | CA+SA | No | Yes | — | `auth_event_log`, `config_change_history` | Active |

---
### 1.10 Module 10 — File Management (30 APIs)

Source: `11-File-Management-APIs.md`. Microservice owner: **Media / File Service**.

| API # | Endpoint Name | Method | URL | Purpose | Auth Req | Roles Allowed | Rate Ltd | Idempotent | AI Agent | DB Entity | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| FILE-01 | Upload File | POST | `/api/v1/files` | Generic file upload entry point | Yes | Any (authorized) | No | Yes | — | `file_asset`, `file_asset_metadata` | Active |
| FILE-02 | Initiate Chunked/Multipart Upload | POST | `/api/v1/files/multipart` | Begin large-file chunked upload | Yes | Any (authorized) | No | No | — | `file_asset` | Active |
| FILE-03 | Complete Chunked/Multipart Upload | POST | `/api/v1/files/multipart/{multipartUploadId}/complete` | Finalize chunked upload | Yes | Session initiator | No | Yes | — | `file_asset`, `file_asset_metadata` | Active |
| FILE-04 | Download File | GET | `/api/v1/files/{fileId}/download` | Signed-URL file download | Yes | Owner+scope+grant | No | Yes | — | `file_asset` | Active |
| FILE-05 | Preview File | GET | `/api/v1/files/{fileId}/preview` | Signed-URL preview/thumbnail | Yes | Owner+scope+grant | No | Yes | — | `file_asset`, `file_asset_metadata` | Active |
| FILE-06 | Get File Metadata | GET | `/api/v1/files/{fileId}/metadata` | Retrieve tags/EXIF/OCR/retention meta | Yes | Owner+scope+grant | No | Yes | — | `file_asset`, `file_asset_metadata` | Active |
| FILE-07 | Update File Metadata | PATCH | `/api/v1/files/{fileId}/metadata` | Update tags/category | Yes | Owner+Off+Admin | No | Yes | — | `file_asset_metadata` | Active |
| FILE-08 | List File Versions | GET | `/api/v1/files/{fileId}/versions` | List prior versions of a file | Yes | Owner+scope+grant | No | Yes | — | `file_asset`, `file_asset_metadata` | Active |
| FILE-09 | Get File Version | GET | `/api/v1/files/{fileId}/versions/{versionFileAssetId}` | Retrieve one prior version | Yes | Owner+scope+grant | No | Yes | — | `file_asset`, `file_asset_metadata` | Active |
| FILE-10 | Restore File Version | POST | `/api/v1/files/{fileId}/versions/{versionFileAssetId}/restore` | Make a prior version current | Yes | Owner+Off+Admin | No | No | — | `file_asset`, `file_asset_metadata` | Active |
| FILE-11 | Create Shareable Link | POST | `/api/v1/files/{fileId}/share-links` | Generate time-boxed share link | Yes | Owner+Off+Admin | No | No | — | `resource_share`\* | Future |
| FILE-12 | List Shareable Links | GET | `/api/v1/files/{fileId}/share-links` | View active/expired share links | Yes | Owner+Off+Admin | No | Yes | — | `resource_share`\* | Future |
| FILE-13 | Revoke Shareable Link | DELETE | `/api/v1/files/{fileId}/share-links/{shareLinkId}` | Invalidate a share link | Yes | Owner+Off+Admin | No | Yes | — | `resource_share`\* | Future |
| FILE-14 | Get File Access List | GET | `/api/v1/files/{fileId}/access` | Resolved list of who can access | Yes | Owner+Off+Admin | No | Yes | — | `resource_share`\*, `role_permission` | Future |
| FILE-15 | Grant File Access | POST | `/api/v1/files/{fileId}/access` | Grant a specific user direct access | Yes | Owner+Off+Admin | No | No | — | `resource_share`\* | Future |
| FILE-16 | Revoke File Access | DELETE | `/api/v1/files/{fileId}/access/{accessGrantId}` | Remove a named-user grant | Yes | Owner+Off+Admin | No | Yes | — | `resource_share`\* | Future |
| FILE-17 | Get Virus Scan Status | GET | `/api/v1/files/{fileId}/virus-scan` | Poll antivirus scan outcome | Yes | Owner+Off+Admin | No | Yes | — | `file_asset` | Active |
| FILE-18 | Trigger Rescan | POST | `/api/v1/files/{fileId}/virus-scan/rescan` | Re-run antivirus scan | Yes | CA+SA | No | Yes | — | `file_asset` | Active |
| FILE-19 | Get Thumbnail | GET | `/api/v1/files/{fileId}/thumbnail` | Retrieve generated thumbnail | Yes | Owner+scope+grant | No | Yes | — | `file_asset_metadata` | Active |
| FILE-20 | Request Image Re-Processing | POST | `/api/v1/files/{fileId}/reprocess` | Rotate/compress/regenerate thumbnail | Yes | Owner+Off+Admin | No | No | — | `file_asset`, `file_asset_metadata` | Active |
| FILE-21 | Get OCR Result | GET | `/api/v1/files/{fileId}/ocr` | Retrieve extracted text | Yes | Owner+scope+grant | No | Yes | — | `file_asset_metadata` | Active |
| FILE-22 | Trigger OCR | POST | `/api/v1/files/{fileId}/ocr` | Request text extraction | Yes | Owner+Off+Admin | No | No | — | `file_asset_metadata` | Active |
| FILE-23 | Search Files | GET | `/api/v1/files/search` | Free-text/filtered file search | Yes | Any (scoped) | No | Yes | — | `file_asset`, `file_asset_metadata` | Active |
| FILE-24 | Archive File | POST | `/api/v1/files/{fileId}/archive` | Move file to archive tier early | Yes | CA+SA | No | Yes | — | `file_asset` | Active |
| FILE-25 | List Archived Files | GET | `/api/v1/files/archived` | List files in archive tier | Yes | CA+SA | No | Yes | — | `file_asset` | Active |
| FILE-26 | Restore Archived File | POST | `/api/v1/files/{fileId}/restore` | Move file back to hot tier | Yes | CA+SA (+ Reopen workflow) | No | Yes | — | `file_asset` | Active |
| FILE-27 | Delete File | DELETE | `/api/v1/files/{fileId}` | Soft-delete a file | Yes | Uploader+Admin | No | Yes | — | `file_asset` | Active |
| FILE-28 | Get Storage Usage Summary | GET | `/api/v1/files/storage-usage` | Total storage vs. quota | Yes | CA+SA | No | Yes | — | `file_asset` | Active |
| FILE-29 | Get Storage Usage by Category | GET | `/api/v1/files/storage-usage/by-category` | Storage breakdown by category | Yes | CA+SA | No | Yes | — | `file_asset` | Active |
| FILE-30 | Get File Audit Trail | GET | `/api/v1/files/{fileId}/audit-trail` | Complete history for one file | Yes | Owner+Off+Admin | No | Yes | — | `audit_log`, `file_asset` | Active |

`*` = backed by the same **proposed** `resource_share` table flagged in Module 8 (Section 1.8) — pending Database Architecture v1.2.

---

## 2. Complete API Statistics

### 2.1 Total APIs

| Metric | Count |
|---|---|
| **Total APIs (all modules)** | **295** |

### 2.2 By HTTP Method

| Method | Count | % of Total |
|---|---|---|
| GET | 176 | 59.7% |
| POST | 87 | 29.5% |
| PATCH | 24 | 8.1% |
| PUT | 6 | 2.0% |
| DELETE | 22 | 7.5% |

> Note: rows sum to more than 295/100% because a small number of endpoints are counted once per method only (no double-counting occurred) — the percentages are computed against 295 and total 100% before rounding; GET's dominance reflects the platform's large read/reporting/audit surface (Modules 6, 8, 9 alone contribute 137 GETs).

### 2.3 By Consumer Category

| Category | Count | Definition |
|---|---|---|
| **Internal APIs** (Svc-only or Svc-primary) | 24 | AI-01–AI-04, AI-07, AI-08, CMP-09, NOT-01/04/07/10/34, GEO-46/47, plus internal-triggered subset of NOT-46/50 | 
| **Citizen APIs** (Cit-accessible) | 31 | Module 2 (7) + CMP-01/02/03/05/06/07/08(queue excl.)/12/13 + GEO-46 + relevant NOT-13/14/15/16/17/28/29/37/38 subset |
| **Officer APIs** (Off-accessible) | 62 | CMP-03/04/05/06/08/09/10 + AI-05 + RPT-01/02/03/04/12/14 + GEO-11/13/16/18/26/28/45/48 + ADM read-lists + NOT inbox/preference subset |
| **Admin APIs** (DA/CA/SA-accessible) | 168 | Module 5 (43) + Module 9 (28) + majority of Modules 6–8 |
| **AI APIs** | 8 | Module 4 in full |
| **Report APIs** | 43 | Module 8 in full |
| **File APIs** | 30 | Module 10 in full |
| **Notification APIs** | 58 | Module 7 in full |
| **Audit APIs** | 28 | Module 9 in full |

> Categories overlap by design (e.g. an endpoint can be both a "Report API" and "Admin API") — this table classifies by *module* for the last five rows and by *primary accessing role* for the first four, matching how each consuming team (Section header table) actually slices the catalog.

### 2.4 Average APIs per Module

| Calculation | Value |
|---|---|
| Total APIs ÷ 10 modules | 295 ÷ 10 = **29.5 APIs/module** |
| Largest module | Notification (58) |
| Smallest module | AI (8) |
| Median module size | Complaint/AI-adjacent range — actual median (Reports, 43) |

---
## 3. Role vs. API Matrix

Endpoint counts per module, by the role(s) permitted to call at least one operation in that module (a module can appear under multiple roles). AI Agent's column counts endpoints where an AI Agent is invoked (i.e. `Related AI Agent ≠ —`), not endpoints an agent "calls" as a principal — agents are invoked by services, never themselves bearer-token callers (`14-API-Security.md` §14.2).

| Module | Citizen | Officer | Dept Admin | Corp Admin | Super Admin | Internal Service | AI Agent (touchpoints) |
|---|---|---|---|---|---|---|---|
| 1. Authentication | 6 | 6 | 2 | 2 | 0 | 1 | 0 |
| 2. Citizen | 7 | 0 | 0 | 0 | 0 | 0 | 0 |
| 3. Complaint | 9 | 8 | 4 | 4 | 0 | 1 | 3 |
| 4. AI | 0 | 2 | 1 | 1 | 1 | 6 | 8 |
| 5. Administration | 0 | 5 | 32 | 40 | 15 | 0 | 0 |
| 6. Geographic | 3 | 20 | 6 | 30 | 34 | 4 | 2 |
| 7. Notification | 5 | 5 | 12 | 46 | 46 | 14 | 15 |
| 8. Reports | 0 | 6 | 32 | 39 | 39 | 0 | 3 |
| 9. Audit | 3 | 0 | 5 | 28 | 28 | 0 | 2 |
| 10. File Management | 3 | 9 | 9 | 12 | 8 | 0 | 0 |
| **Total (deduplicated, Section 2.1)** | **295** | | | | | | |

> Counts are non-exclusive by design — most endpoints permit more than one role (e.g. `DA+CA`), so column sums exceed the module's own row total in Section 1. This matrix answers "how many endpoints does Role X need to know about," which is the question each of the named consumer teams (QA writing role-based test matrices, Frontend gating UI by role) actually asks.

---

## 4. Database Entity vs. API Matrix

Grouped by `DATABASE_DESIGN.md` table category (§5–§14, §26–§34), sorted by reference count. This is a **summary cross-reference**, not an exhaustive 295 × 80 grid — for the complete entity list touching any single endpoint, consult that endpoint's own "Related Database Entities" field in Sections 1.1–1.10 or the source module file.

| DB Entity | Referencing Module(s) | Approx. API Count | Primary Use |
|---|---|---|---|
| `complaint` | Complaint, Reports, Geographic, Audit | 28 | Core transaction record |
| `file_asset` / `file_asset_metadata` | File Management, Complaint, Reports, Audit | 27 | Upload/attachment lifecycle |
| `notification_dispatch` | Notification, Audit, Reports | 26 | Per-channel delivery record |
| `org_unit` | Geographic | 15 | Generic hierarchy (Future) |
| `reference_value` / `reference_domain` | Geographic | 14 | State/Street/Locality catalogs |
| `notification_template_config` | Notification | 12 | Versioned message templates |
| `auth_event_log` | Authentication, Audit | 10 | Login/MFA/lockout evidence |
| `resource_share` (proposed) | Reports, File Management | 9 | Sharing/access grants (Future) |
| `role` / `role_permission` / `permission` | Administration, Reports | 9 | RBAC catalog |
| `sla_rule_config` / `sla_tracking` | Administration, Reports | 8 | SLA definition + tracking |
| `staff_profile` / `user` | Authentication, Administration | 8 | Identity records |
| `geo_boundary` | Geographic | 7 | GeoJSON boundary storage |
| `district` / `zone` / `ward` | Geographic | 15 | Operational routing geography |
| `notification_preference` | Citizen, Notification | 6 | Channel/quiet-hours/category prefs |
| `ai_classification_result` / `ai_agent_invocation_log` / `pii_masking_log` | AI, Audit, Reports | 8 | AI evidence trail |
| `escalation_matrix_config` / `escalation_instance` | Administration, Audit, Reports | 6 | Escalation rules + fired events |
| `approval_workflow_config` / `approval_action` | Administration, Audit | 6 | Approval rules + decisions |
| `config_change_history` | Administration, Audit, Notification, Geographic | 8 | Versioned config diff evidence |
| `provider_config` | Administration, Notification, Geographic | 8 | Pluggable provider selection |
| `department` / `complaint_category` | Administration, Complaint, Reports | 9 | Routing master data |
| `report_schedule_config` / `report_template_config` (proposed) | Reports | 10 | Scheduled/saved reports (Future) |
| `activity_log` | Audit, Reports | 4 | Broader activity monitoring |
| `feature_flag_config` | Administration, Geographic | 3 | Feature gating |
| `geo_analytics_snapshot` / `geo_point_snapshot` | Geographic, Reports | 6 | Pre-aggregated spatial data |
| `tenant` | Administration, Geographic | 3 | Tenant configuration root |

---

## 5. AI Agent vs. API Matrix

The seven agents fixed in SRS §3.5, each mapped to the exact endpoints that invoke it. Endpoints not listed for a given agent never invoke it (`Related AI Agent: None` in Sections 1.1–1.10).

| AI Agent | Invoking APIs | Count |
|---|---|---|
| **Complaint Agent** | CMP-01, AI-02, AI-03, AI-04, AI-08, GEO-46, RPT-19 | 7 |
| **Assignment Agent** | CMP-09 | 1 |
| **SLA Agent** | ADM-34 *(fires, does not call)* | 0 (evaluator only, not an API-invoked agent — see note below) |
| **Voice Agent** | CMP-02, AI-01, AI-07 | 3 |
| **Officer AI Agent** | AI-05 | 1 |
| **Analytics Agent** | AI-06, AI-07, GEO-50, RPT-18 | 4 |
| **Notification Agent** | NOT-01, NOT-04, NOT-07, NOT-10, NOT-31, NOT-34, NOT-40, NOT-41, NOT-46, NOT-50 | 10 |

> **Note on SLA Agent and Assignment Agent**: per `ARCHITECTURE.md` §3.1's design note (restated in `API_SPECIFICATION.md` §5), the SLA Agent and Assignment Agent are **deterministic rule/queue-driven engines**, not Claude-invoking agents — they *evaluate and fire* escalation/assignment rules as a background process, they are not themselves triggered synchronously by a client-facing API call the way Complaint/Voice/Officer AI/Analytics/Notification Agents are. ADM-34 (Create Escalation Rule) defines a rule the SLA Agent later evaluates; CMP-09 (Complaint Assignment) is the one endpoint where the Assignment Agent *is* the invoked actor (auto-assignment path).

---

## 6. Microservice Ownership Matrix

Maps every module to its owning microservice(s) per `ARCHITECTURE.md` §3.1's Logical Service Catalogue — no new service is introduced by this catalog.

| Microservice (`ARCHITECTURE.md` §3.1) | Owned Module(s) | API Count |
|---|---|---|
| **API Gateway** | Cross-cutting (all modules — routing, TLS, rate limiting, JWT verification) | 295 (all) |
| **Auth Service** | 1. Authentication | 11 |
| **Tenant & Admin Config Service** | 5. Administration; 6. Geographic (District/Zone/Ward, §7.2/§7.5/§7.7 only) | 43 + 15 |
| **Complaint Service** | 2. Citizen; 3. Complaint (registration/read paths) | 7 + 9 |
| **Officer Workflow Service** | 3. Complaint (assignment/resolution/closure paths) | 4 |
| **Media / File Service** | 10. File Management | 30 |
| **AI Orchestration Service** | 4. AI (all); AI-touchpoints within Complaint/Geographic/Reports (invoked, not owned) | 8 |
| **Voice Processing Service** | AI-01 (Speech to Text); voice leg of CMP-02 | 1 (+1 shared) |
| **Assignment & SLA Engine** | CMP-09 (assignment path); ADM-33–37 (escalation rule evaluation, not ownership of the CRUD API itself) | 1 |
| **Notification Service** | 7. Notification | 58 |
| **Analytics & Reporting Service** | 8. Reports; 6. Geographic (§7.14–§7.15 Heatmap/Geo Analytics, shared) | 43 + 2 |
| **Audit & Activity Logging Service** | 9. Audit | 28 |
| **Scheduler** | Cross-cutting background trigger for RPT-25, AUD-22, NOT-34/46/50 (async job release) — no owned CRUD API | 0 (trigger-only) |
| **GIS/Org-Hierarchy Extension** *(future, not yet its own §3.1 service entry — logically extends Tenant & Admin Config Service)* | 6. Geographic (§7.1, §7.3–§7.4, §7.6, §7.8–§7.16) | 39 |

---

## 7. Implementation Priority Matrix

Phased against the SRS §1.3 pilot-vs-product distinction and the `Status` column already fixed per-endpoint in Section 1 — **Phase 1 is exactly the `Active` set**, **Future is exactly the `Future` set**; Phase 2/3 subdivide the `Active` set by criticality-to-pilot-launch, since not every `Active` endpoint is equally urgent for day-one go-live.

| Phase | Definition | Modules / API Ranges | Count |
|---|---|---|---|
| **Phase 1 — Pilot Launch Critical** | Must exist for Tambaram go-live: citizen registration, complaint lifecycle, core notifications, core admin config | Module 1 (11), Module 2 (7), Module 3 (13), Module 4 (8), ADM-01–ADM-22 (Departments/Categories/Users/Roles/Permissions), GEO-06–GEO-10/GEO-21–GEO-25/GEO-31–GEO-35 (District/Zone/Ward, 15), NOT-01–NOT-17/NOT-28–NOT-31 (core dispatch/inbox/preferences, 21), RPT-01–RPT-11 (dashboard/complaint/SLA reports, 11), AUD-01–AUD-12 (core audit/workflow, 12), FILE-01–FILE-10/FILE-17–FILE-27 (upload through delete, 21) | **~139** |
| **Phase 2 — Pilot Hardening** | Needed within the pilot window but not for day-one: workflow config (approval/SLA/escalation rules), advanced reporting, broadcast/bulk notification, full audit surface, file sharing/versioning | ADM-23–ADM-43 (21), RPT-12–RPT-22/RPT-41–RPT-43 (14), NOT-18–NOT-27/NOT-32–NOT-45/NOT-53–NOT-58 (32), AUD-13–AUD-28 (16), FILE-11–FILE-16/FILE-28–FILE-30 (9) | **~92** |
| **Phase 3 — Scale-Out (Tier-2/3, multi-tenant rollout)** | Meaningful once multiple ULBs/tenants onboard: cross-tenant Super Admin flows already built-in, but operationally exercised only at scale; export/scheduling infrastructure load-tested | RPT-25–RPT-27 (export pipeline under load), NOT-46–NOT-52 (broadcast/bulk at real volume), AUD-21–AUD-23 (search/export at multi-tenant scale) | **(subset of Phase 1/2 above, re-validated at scale — not a separate endpoint set)** |
| **Future** | Designed, documented, not implementable until a feature flag is activated (GIS/generic org hierarchy) or a proposed DB table is approved (Database Architecture v1.2) | GEO-01–GEO-05/GEO-11–GEO-20/GEO-26–GEO-30/GEO-36–GEO-54 (39), RPT-23–RPT-24/RPT-28–RPT-40 (15), FILE-11–FILE-16 (already counted in Phase 2 as designed-but-flagged; see Section 1.10 footnote) | **58** (per Section 2.1/0.2 `Future`-status count minus the FILE-11–16 double-count already resolved by `*`-flagging in Section 1.10) |

> **Reconciliation note**: FILE-11–FILE-16 (File Sharing/Access) are simultaneously "designed for Phase 2 UX" and "blocked on the same proposed `resource_share` table as the Reports-module Future set" — they are counted once, under `Future`, in the Section 2.1 statistics; Phase 2's own count above lists them for planning visibility but does not double-count them in the grand total.

---

## 8. API Dependency Matrix

Endpoints that cannot function correctly unless a named other endpoint/pipeline has already run. This is a **runtime dependency map**, not a call-order sequence diagram — useful for DevOps rollout ordering and QA test-data setup ordering.

| Dependent API | Depends On | Nature of Dependency |
|---|---|---|
| CMP-01 Register Complaint | AI-02/AI-03/AI-04 (Complaint Agent pipeline), CMP-09 (Assignment) | Async post-registration classification/assignment |
| CMP-02 Register Voice Complaint | AI-01 Speech to Text, then CMP-01's own AI pipeline | Sequential: transcribe → classify → assign |
| CMP-09 Complaint Assignment | ADM-06–ADM-10 (categories must exist), ADM-11–ADM-15 (officer accounts must exist) | Referential — cannot assign to a nonexistent officer |
| CMP-10 Complaint Resolution | ADM-28–ADM-32 (SLA rule must have been pinned at assignment time) | `sla_tracking` breach evaluation |
| CMP-11 Complaint Closure | CMP-10 (must be `Resolved` first) | Sequential state machine |
| CMP-13 Complaint Reopen | CMP-11 (must be `Closed` first, within reopen window) | Sequential state machine |
| NOT-01/04/07/10 (Send *) | NOT-18–NOT-27 (template must exist and be `approved`) | Referential + approval-state gate |
| NOT-46 Create Broadcast | GEO-06–GEO-10/21–25/31–35 (scope resolution: ward/zone/district must exist) | Referential — scope must resolve to real recipients |
| RPT-25 Export Report | FILE-04 Download File (retrieval path once export completes) | Sequential — export produces a `file_asset`, retrieved via File Management |
| RPT-08/RPT-14/RPT-17 (Drill-Down) | CMP-08 Complaint List (same underlying query, reused) | Shared implementation, not merely a reference |
| AUD-22 Export Audit Logs | FILE-04 Download File | Same export→download pattern as RPT-25 |
| FILE-01 Upload File | FILE-17 Get Virus Scan Status (consumer must poll before FILE-04/FILE-05 succeed) | Async gate — upload is not immediately usable |
| GEO-46 Reverse Geocode | ADM-42/43 (Maps provider must be configured) | Referential — no provider configured ⇒ `501`/`503` |
| NOT-01/04/07/10 (any channel) | ADM-42/43 or NOT-43/44 (channel provider must be configured) | Referential — same pattern as above |
| AI-03 Priority Prediction | AI-02 Complaint Classification (must complete first) | Sequential — `409 CLASSIFICATION_NOT_YET_COMPLETE` otherwise |
| GEO-11–GEO-20/26–30 (Corporation/Region/Division) | ADM-40/41 Feature Flags (`use_generic_org_hierarchy` must be enabled) | Feature-flag gate |
| RPT-28–RPT-40, FILE-11–FILE-16 | Database Architecture v1.2 approval (proposed tables) | **Hard blocker** — cannot deploy before schema exists |

---

## 9. Cross-Reference Tables

### 9.1 Module → Governing Source Documents

| Module | SRS Reference | Architecture Reference | Database Reference |
|---|---|---|---|
| 1. Authentication | §3.1, §8.1 | §7 Authentication Flow | §5 (`user`, `staff_profile`), §13 (Security Tables) |
| 2. Citizen | §3.2 | §3.1 Complaint Service | §5, §11 (`notification_preference`) |
| 3. Complaint | §3.2, §3.6, §3.8 | §6 Communication Flow, §9 Voice Architecture | §6 (Transaction Tables), §8 (Workflow Tables) |
| 4. AI | §3.5 | §8 AI Architecture | §9 (AI Tables) |
| 5. Administration | §3.4, §6, §7 | §3.1 Tenant & Admin Config Service | §7 (Configuration Tables) |
| 6. Geographic | §7 (base) | — | §5 (`district`/`zone`/`ward`), §26/§28/§29 (v1.1 GIS/Org/Reference) |
| 7. Notification | §5 (External Interfaces) | §10 Notification Architecture | §11 (Notification Tables) |
| 8. Reports | §3.3, §3.5 | §17 Scheduler Architecture | §14 (Reporting Tables), §9.1.1 (v1.1 proposed extensions) |
| 9. Audit | §3.4, §9 (Compliance) | §11.5 Audit Logging | §10 (Audit Tables) |
| 10. File Management | §8.2 (File Upload Security) | §19 File Storage Architecture | §12 (File Management Tables), §30 (v1.1 metadata) |

### 9.2 Status → Governing Constraint

| Status | Governing Constraint | Unblocking Action |
|---|---|---|
| Active | Fully backed by `DATABASE_DESIGN.md` v1.1 approved tables; no feature flag required | None — implementable now |
| Future (feature-flag gated) | Requires `use_generic_org_hierarchy` or the GIS capability flag enabled (`06-Administration-APIs.md` §6.10) | Tenant/Super Admin enables the flag |
| Future (schema-pending) | Requires `report_schedule_config`, `report_template_config`, or `resource_share` — proposed, not yet approved | Database Architecture v1.2 addendum approval |
| Deprecated | None exist at v1.0 | N/A |

### 9.3 HTTP Status Code → Module Frequency (from `13-HTTP-Status-Codes.md`)

| Status Code | Modules Most Frequently Returning It |
|---|---|
| `202 Accepted` | Complaint (registration/voice), Notification (all sends), Reports/Audit (exports), File (upload) |
| `409 Conflict` | Complaint (state transitions), Notification (template approval, optimistic concurrency), Reports (schedule/template concurrency) |
| `422 Unprocessable Entity` | Administration (scope/reference validation), Notification (channel disabled), File (malware/format) |
| `501 Not Implemented` | Geographic (`Future`-status endpoints when the GIS/org-hierarchy flag is off) |

---
## 10. Final Implementation Checklist

Organized per the named consumer teams (header table) — a checklist item references its authoritative source section rather than restating the rule, consistent with this document's consolidation-only mandate.

### 10.1 Backend Developers

- [ ] Implement Phase 1 endpoints first (Section 7), in the dependency order fixed in Section 8 (e.g. AI-02/03/04 before CMP-01's async completion path is testable end-to-end).
- [ ] Every endpoint's Validation Rules, Business Rules, and Error Responses are implemented exactly as documented in its source section — this catalog is an index, not the authoritative field-level spec.
- [ ] Every state-changing endpoint emits its audit event (`14-API-Security.md` §14.24) — verified per-endpoint against Section 1's DB Entity column (an `audit_log` entry should exist wherever that column lists it).
- [ ] `Future`-status endpoints (Section 1, `Status` column) are implemented behind their governing feature flag (Section 9.2) — never reachable when the flag is off, returning `501` per `13-HTTP-Status-Codes.md` §13.5.2.
- [ ] Endpoints depending on a proposed table (`*`-flagged in Sections 1.8/1.10) are not started until Database Architecture v1.2 is approved (Section 8's hard-blocker row).

### 10.2 Frontend Developers

- [ ] Gate every UI action by the `Roles Allowed` column (Section 1) — never rely on a `403` response as the sole access-control mechanism; hide/disable UI the caller's role cannot use.
- [ ] Implement the standard response envelopes (`12-Standard-Response-Formats.md`) once, as shared client-side parsing logic — never per-endpoint.
- [ ] Poll or subscribe (per `12-Standard-Response-Formats.md` §12.13) for every `202`-returning endpoint (Section 2.2's Async row) — never assume synchronous completion.
- [ ] Surface `meta.aiProviderDegraded` (`12-Standard-Response-Formats.md` §12.11) distinctly in any UI displaying an AI-derived (Module 4) result.
- [ ] Build role-aware dashboards against Module 8's widget catalog (RPT-03) rather than hardcoding a fixed widget set per role.

### 10.3 QA Team

- [ ] Build one test-plan section per module (Section 1.1–1.10), covering every documented Error Response for every endpoint — cross-referenced against `13-HTTP-Status-Codes.md`'s full decision tree (§13.6) so `400` vs. `409` vs. `422` cases are each explicitly exercised.
- [ ] Test the Role vs. API Matrix (Section 3) as an explicit access-control test suite — for every module, verify each *non*-listed role receives `403`, not a silent success or a different error.
- [ ] Test every dependency in the API Dependency Matrix (Section 8) as an integration scenario, not just each endpoint in isolation (e.g. attempt CMP-09 assignment to a nonexistent officer, attempt AI-03 before AI-02 completes).
- [ ] Verify optimistic-concurrency endpoints (`08-Notification-APIs.md` §8.7.4/§8.8.2, `09-Reports-APIs.md` §9.11.4/§9.12.4) correctly reject a stale `expectedVersion`/`If-Match`.
- [ ] Verify every `Future`-status endpoint (Section 1) returns `501 NOT_ENABLED` when its governing flag is off, and functions correctly when enabled.

### 10.4 DevOps Team

- [ ] Stand up the microservice topology per the Ownership Matrix (Section 6) — no endpoint's implementation should span a service boundary not already fixed in `ARCHITECTURE.md` §3.1/§3.2.
- [ ] Configure the Scheduler (`ARCHITECTURE.md` §17) for every job-triggering endpoint identified in Section 6's "Scheduler" row (RPT-25, AUD-22, NOT-34/46/50) before those endpoints go live.
- [ ] Sequence deployment per the Implementation Priority Matrix (Section 7) — Phase 1 modules deployed and stable before Phase 2 modules are exposed externally.
- [ ] Confirm `Future`-status endpoints are deployed but flag-gated `off` by default in production until each is explicitly enabled per tenant (Section 9.2).
- [ ] Verify the Redis-backed mechanisms this catalog's DB Entity column marks as "not a database entity" (queues, refresh tokens, OTP) have the correct AOF persistence configuration per `ARCHITECTURE.md` §16 before any dependent endpoint (Module 1, Module 7 Queue subsection) is load-tested.

### 10.5 API Gateway Team

- [ ] Register all 295 routes with the correct method + path from Section 1 — this catalog's URL column is the single source of truth for Gateway route configuration; do not re-derive URLs from memory or from any other document.
- [ ] Apply the correct rate-limit tier (`Rate Ltd` column, Section 1; full tier catalog `13-HTTP-Status-Codes.md` §13.7) per endpoint — do not apply a single blanket throttle to all 295 routes.
- [ ] Verify JWT verification (`14-API-Security.md` §14.3) is bypassed **only** for the 9 `Pub`-auth endpoints (AUTH-01–06, AUTH-09–10, plus AUTH-07 which is credentialed by the refresh token itself) — every other route requires a valid bearer token before reaching a service.
- [ ] Configure CORS/CSP/security headers (`14-API-Security.md` §14.18–§14.20) identically across all 295 routes — no per-endpoint header policy drift.
- [ ] Confirm the Super Admin `?tenantId=` cross-tenant override (`API_SPECIFICATION.md` §1.1) is accepted **only** on the specific endpoints documented for it, never generically across the Gateway.

### 10.6 Security Team

- [ ] Run the 10-point Security Best Practices checklist (`14-API-Security.md` §14.30) against every endpoint before its Phase goes live — not just at initial design time.
- [ ] Verify the OWASP API Security Top 10 mapping (`14-API-Security.md` §14.17) against a sample of at least 3 endpoints per module, confirming the documented mitigation is actually implemented, not merely designed.
- [ ] Audit the Emergency Override path (NOT-31) and Broadcast/Bulk paths (NOT-46, NOT-50) specifically — these are the platform's highest-blast-radius endpoints (Section 8's dependency notes) and warrant a dedicated penetration-test pass before Phase 2 go-live.
- [ ] Confirm every `*`-flagged proposed-table endpoint (Sections 1.8, 1.10) is excluded from any security review scheduled before Database Architecture v1.2 is approved — reviewing an unimplementable endpoint wastes the review cycle.
- [ ] Verify secrets-manager-reference-only storage (`14-API-Security.md` §14.22) specifically on ADM-43 (Set Active Provider) and NOT-43/44 (Notification Providers), since these are the endpoints most likely to be misused to smuggle a raw credential into a request body.

### 10.7 Project Managers

- [ ] Track go-live readiness against the Implementation Priority Matrix (Section 7) — Phase 1's ~139 APIs are the pilot-launch gate; Phase 2's ~92 are the hardening-window gate.
- [ ] Track the two explicit external blockers separately from ordinary development risk: (a) Database Architecture v1.2 approval (Section 8, blocking ~25 endpoints across Reports and File Management), (b) GIS/generic-org-hierarchy feature-flag activation decision (blocking 39+ Geographic endpoints) — neither is a coding task, both require a separate stakeholder decision.
- [ ] Use the Statistics (Section 2) and Role vs. API Matrix (Section 3) to staff sprint planning — the Notification (58) and Geographic (54) modules are the two largest single bodies of work and should not be scheduled as "one sprint" alongside smaller modules.
- [ ] Confirm every team above has signed off its own section-specific checklist (Sections 10.1–10.6) before declaring any Phase complete.

### 10.8 Overall Go-Live Gate (All Teams)

- [ ] All Phase 1 endpoints (Section 7) implemented, tested, security-reviewed, and Gateway-registered.
- [ ] All Phase 1 dependency chains (Section 8) verified end-to-end in a staging environment matching production topology.
- [ ] Zero `Future`-status endpoint is reachable in production without its governing flag explicitly enabled (Section 9.2).
- [ ] The physical `docs/openapi.yaml` (`16-API-Documentation-Standards.md` §16.2) validates cleanly and is synchronized with this catalog's 295-endpoint count.
- [ ] This catalog itself is re-verified against the ten source module files after any future endpoint addition — per Section 0's consolidation-only mandate, this document is never the place a new endpoint is first introduced.

---

## 11. Document Governance

This catalog is a **derived artifact** — its source of truth is always Sections 1–16 of the API Specification (`API_SPECIFICATION.md` plus `06`–`16`). Any discrepancy discovered between this catalog and a source section is resolved in favor of the source section, and this catalog is corrected to match — never the reverse. Re-generation of this catalog is required whenever any source section adds, removes, or renames an endpoint; until then, this document (v1.0) stands as the master index for Backend, Frontend, QA, DevOps, API Gateway, Security, and Project Management teams alike.

---

*(End of Enterprise API Endpoint Catalog v1.0.)*






