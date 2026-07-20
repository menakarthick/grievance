# API Specification Document — Section 6

## AI Powered Enterprise Citizen Service & Grievance Management Platform

> **Continuation note**: This file continues `docs/API_SPECIFICATION.md` from the end of the approved Section 5 (AI APIs). Sections 1–5 are not reproduced or modified here. This file contains **only** Section 6 (Administration APIs), split out to its own document per request, and is otherwise governed by the same design principles, error envelope, HTTP status code table, and security model already defined in `docs/API_SPECIFICATION.md` Sections 1, 12, 13, 14. No SQL, no Express routes, no controllers, no services, no database queries, no implementation code.

---

## 6. Administration APIs

Backed by the **Tenant & Admin Config Service** (`ARCHITECTURE.md` §3.1 #3). SRS §3.4 groups these under the Admin Module, RBAC-scoped by role: **Department Admin** (own department only), **Corporation Admin** (whole tenant), **Super Admin** (cross-tenant, via an explicit `tenantId` query parameter per `API_SPECIFICATION.md` §1.1). Every state-changing endpoint below emits an audit event (`API_SPECIFICATION.md` §14.5) and every configuration change that feeds a versioned `*_config` table (SLA, Escalation, Approval Workflow) creates a **new version** rather than overwriting, per `DATABASE_DESIGN.md` §22 — a complaint already in flight keeps the rule version that was active when it was assigned. No AI Agent is involved in any Administration API — these are deterministic configuration operations, consistent with the Section 5 note that only the Complaint, Officer AI, Analytics, and Voice Agents invoke Claude.

---

### 6.1 Department Management APIs

Manages the tenant's configurable department list (SRS §3.4, §6.2) — the routing target for every complaint category.

#### 6.1.1 List Departments

| | |
|---|---|
| **Purpose** | Retrieve the tenant's department list, for Admin Portal department screens and dropdowns platform-wide |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/departments` |
| **Authentication** | Yes — any authenticated Officer/Admin role (read-only; used to populate routing/assignment UI) |
| **Request** | Query: `?isActive=true` (default), `?page=`, `?size=` (offset pagination, `API_SPECIFICATION.md` §1.8 — small, bounded config collection) |
| **Response** | `{ "data": [ { "id", "code", "name", "isActive", "createdAt" } ], "meta": { "pagination": { "page", "size", "totalCount", "totalPages" } } }` |
| **Validation** | `size`: max 100 |
| **Errors** | `401 UNAUTHORIZED` |
| **Related Database Entities** | `department` |
| **Related Functional Module** | SRS §3.4 Admin Module — Departments (CRUD) |
| **Related AI Agent** | None |

#### 6.1.2 Create Department

| | |
|---|---|
| **Purpose** | Add a new department to the tenant's configurable department list |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/departments` |
| **Authentication** | Yes — Corporation Admin / Super Admin |
| **Request** | Body: `{ "code": "string", "name": "string" }` |
| **Response** | `{ "id", "code", "name", "isActive": true, "createdAt" }` |
| **Validation** | `code`: required, unique within tenant (`(tenant_id, code)` composite, `DATABASE_DESIGN.md` §3), 2–10 uppercase alphanumeric chars; `name`: required, 2–100 chars |
| **Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `409 DEPARTMENT_CODE_ALREADY_EXISTS` |
| **Related Database Entities** | `department` |
| **Related Functional Module** | SRS §3.4 Admin Module — Departments (CRUD) |
| **Related AI Agent** | None |

#### 6.1.3 Get Department

| | |
|---|---|
| **Purpose** | Retrieve a single department's detail |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/departments/{departmentId}` |
| **Authentication** | Yes — any authenticated Officer/Admin role |
| **Request** | Path: `departmentId` |
| **Response** | `{ "id", "code", "name", "isActive", "createdAt", "updatedAt" }` |
| **Validation** | None (read-only) |
| **Errors** | `401 UNAUTHORIZED`, `404 DEPARTMENT_NOT_FOUND` |
| **Related Database Entities** | `department` |
| **Related Functional Module** | SRS §3.4 Admin Module — Departments (CRUD) |
| **Related AI Agent** | None |

#### 6.1.4 Update Department

| | |
|---|---|
| **Purpose** | Rename a department or toggle its active state |
| **HTTP Method** | `PATCH` |
| **URL** | `/api/v1/departments/{departmentId}` |
| **Authentication** | Yes — Corporation Admin / Super Admin |
| **Request** | Path: `departmentId`; Body (JSON Merge Patch): `{ "name"?: "string", "isActive"?: "boolean" }` — `code` is immutable once created, since it is embedded in every already-issued Complaint Tracking ID (SRS §3.8) |
| **Response** | Updated department object (Section 6.1.3 shape) |
| **Validation** | `name`: 2–100 chars if present |
| **Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 DEPARTMENT_NOT_FOUND` |
| **Related Database Entities** | `department`, `audit_log` |
| **Related Functional Module** | SRS §3.4 Admin Module — Departments (CRUD) |
| **Related AI Agent** | None |

#### 6.1.5 Delete Department (Deactivate)

| | |
|---|---|
| **Purpose** | Soft-delete (deactivate) a department |
| **HTTP Method** | `DELETE` |
| **URL** | `/api/v1/departments/{departmentId}` |
| **Authentication** | Yes — Corporation Admin / Super Admin |
| **Request** | Path: `departmentId` |
| **Response** | `204 No Content` |
| **Validation** | A department with active, unresolved complaints is deactivated (not blocked) — historical complaints keep referencing the department row regardless of `isActive`, preserving referential integrity (`DATABASE_DESIGN.md` §21) |
| **Errors** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 DEPARTMENT_NOT_FOUND` |
| **Related Database Entities** | `department`, `audit_log` |
| **Related Functional Module** | SRS §3.4 Admin Module — Departments (CRUD) |
| **Related AI Agent** | None |

---

### 6.2 Category Management APIs

Manages complaint categories under a department (SRS §3.4 — configurable, never a hardcoded enum, `DATABASE_DESIGN.md` Principle 2).

#### 6.2.1 List Categories

| | |
|---|---|
| **Purpose** | Retrieve complaint categories, optionally scoped to one department |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/complaint-categories` |
| **Authentication** | Yes — any authenticated Officer/Admin role |
| **Request** | Query: `?departmentId=`, `?isActive=true` (default), `?page=`, `?size=` |
| **Response** | `{ "data": [ { "id", "departmentId", "name", "defaultPriority", "isActive" } ], "meta": { "pagination" } }` |
| **Validation** | `size`: max 100 |
| **Errors** | `401 UNAUTHORIZED` |
| **Related Database Entities** | `complaint_category` |
| **Related Functional Module** | SRS §3.4 Admin Module — Complaint Categories (CRUD) |
| **Related AI Agent** | None |

#### 6.2.2 Create Category

| | |
|---|---|
| **Purpose** | Add a complaint category under a department |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/complaint-categories` |
| **Authentication** | Yes — Department Admin (own department) / Corporation Admin (any department) |
| **Request** | Body: `{ "departmentId": "id", "name": "string", "defaultPriority": "low" \| "medium" \| "high" \| "critical" }` |
| **Response** | `{ "id", "departmentId", "name", "defaultPriority", "isActive": true, "createdAt" }` |
| **Validation** | `departmentId`: required, must be active and within the caller's scope; `name`: required, unique within `(tenant_id, department_id)`; `defaultPriority`: required, one of the four supported values |
| **Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 DEPARTMENT_NOT_FOUND`, `409 CATEGORY_NAME_ALREADY_EXISTS` |
| **Related Database Entities** | `complaint_category`, `department` |
| **Related Functional Module** | SRS §3.4 Admin Module — Complaint Categories (CRUD) |
| **Related AI Agent** | None |

#### 6.2.3 Get Category

| | |
|---|---|
| **Purpose** | Retrieve a single complaint category's detail |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/complaint-categories/{categoryId}` |
| **Authentication** | Yes — any authenticated Officer/Admin role |
| **Request** | Path: `categoryId` |
| **Response** | `{ "id", "departmentId", "name", "defaultPriority", "isActive", "createdAt", "updatedAt" }` |
| **Validation** | None (read-only) |
| **Errors** | `401 UNAUTHORIZED`, `404 CATEGORY_NOT_FOUND` |
| **Related Database Entities** | `complaint_category` |
| **Related Functional Module** | SRS §3.4 Admin Module — Complaint Categories (CRUD) |
| **Related AI Agent** | None |

#### 6.2.4 Update Category

| | |
|---|---|
| **Purpose** | Rename a category, change its default priority, or toggle its active state |
| **HTTP Method** | `PATCH` |
| **URL** | `/api/v1/complaint-categories/{categoryId}` |
| **Authentication** | Yes — Department Admin (own department) / Corporation Admin (any) |
| **Request** | Path: `categoryId`; Body (JSON Merge Patch): `{ "name"?: "string", "defaultPriority"?: "string", "isActive"?: "boolean" }` |
| **Response** | Updated category object (Section 6.2.3 shape) |
| **Validation** | `name`: unique within `(tenant_id, department_id)` if changed; `defaultPriority`: one of the four supported values if present — a change here only affects **future** complaints, never retroactively re-prioritizing complaints already registered |
| **Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 CATEGORY_NOT_FOUND`, `409 CATEGORY_NAME_ALREADY_EXISTS` |
| **Related Database Entities** | `complaint_category`, `audit_log` |
| **Related Functional Module** | SRS §3.4 Admin Module — Complaint Categories (CRUD) |
| **Related AI Agent** | None |

#### 6.2.5 Delete Category (Deactivate)

| | |
|---|---|
| **Purpose** | Soft-delete (deactivate) a complaint category |
| **HTTP Method** | `DELETE` |
| **URL** | `/api/v1/complaint-categories/{categoryId}` |
| **Authentication** | Yes — Department Admin (own department) / Corporation Admin (any) |
| **Request** | Path: `categoryId` |
| **Response** | `204 No Content` |
| **Validation** | A deactivated category is excluded from new-complaint category pickers but remains referenced by historical complaints (`DATABASE_DESIGN.md` §21) |
| **Errors** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 CATEGORY_NOT_FOUND` |
| **Related Database Entities** | `complaint_category`, `audit_log` |
| **Related Functional Module** | SRS §3.4 Admin Module — Complaint Categories (CRUD) |
| **Related AI Agent** | None |

---

### 6.3 User Management APIs

Provisions and manages Officer/Admin-tier accounts. Citizen accounts are never created here — they self-register via the Citizen OTP Verify endpoint (`API_SPECIFICATION.md` §2.2).

#### 6.3.1 List Users

| | |
|---|---|
| **Purpose** | List Officer/Admin-tier accounts for the Admin Portal's user management screen |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/users` |
| **Authentication** | Yes — Department Admin (own department's users) / Corporation Admin (tenant-wide) / Super Admin (cross-tenant via `?tenantId=`) |
| **Request** | Query: `?userType=officer\|department_admin\|corporation_admin`, `?departmentId=`, `?isActive=true` (default), `?page=`, `?size=` |
| **Response** | `{ "data": [ { "id", "username", "name", "userType", "departmentId", "isActive" } ], "meta": { "pagination" } }` |
| **Validation** | `size`: max 100 |
| **Errors** | `401 UNAUTHORIZED`, `403 FORBIDDEN` (scope) |
| **Related Database Entities** | `user`, `staff_profile` |
| **Related Functional Module** | SRS §3.4 Admin Module — Officers (CRUD) |
| **Related AI Agent** | None |

#### 6.3.2 Create User

| | |
|---|---|
| **Purpose** | Provision an Officer, Department Admin, or Corporation Admin account |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/users` |
| **Authentication** | Yes — Department Admin (Officers within own department only) / Corporation Admin (any staff within tenant) / Super Admin (any tenant) |
| **Request** | Body: `{ "username": "string", "name": "string", "email": "string", "userType": "officer" \| "department_admin" \| "corporation_admin", "departmentId"?: "id", "hierarchyLevelId"?: "id", "roleIds": ["id"], "initialPassword"?: "string (omit to trigger a set-password invite email)" }` |
| **Response** | `{ "id", "username", "userType", "employeeId", "createdAt" }` |
| **Validation** | `username`: required, unique within tenant; `userType`: required, must be within the caller's provisioning authority (a Department Admin cannot create a Corporation Admin — OWASP A01 privilege-escalation guard); `roleIds`: required, at least one, all must be roles the caller is permitted to grant |
| **Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` (privilege escalation attempt), `409 USERNAME_ALREADY_EXISTS` |
| **Related Database Entities** | `user`, `staff_profile`, `user_role_assignment` |
| **Related Functional Module** | SRS §3.4 Admin Module — Officers (CRUD) |
| **Related AI Agent** | None |

#### 6.3.3 Get User

| | |
|---|---|
| **Purpose** | Retrieve a single Officer/Admin account's detail |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/users/{userId}` |
| **Authentication** | Yes — Department Admin (within department) / Corporation Admin / Super Admin |
| **Request** | Path: `userId` |
| **Response** | `{ "id", "username", "name", "email", "userType", "departmentId", "hierarchyLevelId", "roles": ["string"], "isActive", "createdAt" }` |
| **Validation** | None (read-only) |
| **Errors** | `401 UNAUTHORIZED`, `403 FORBIDDEN` (scope), `404 USER_NOT_FOUND` |
| **Related Database Entities** | `user`, `staff_profile`, `user_role_assignment` |
| **Related Functional Module** | SRS §3.4 Admin Module — Officers (CRUD) |
| **Related AI Agent** | None |

#### 6.3.4 Update User

| | |
|---|---|
| **Purpose** | Update an Officer/Admin's profile fields, department/hierarchy assignment, roles, or active state |
| **HTTP Method** | `PATCH` |
| **URL** | `/api/v1/users/{userId}` |
| **Authentication** | Yes — Department Admin (own department's Officers) / Corporation Admin / Super Admin |
| **Request** | Path: `userId`; Body (JSON Merge Patch): `{ "name"?: "string", "email"?: "string", "departmentId"?: "id", "hierarchyLevelId"?: "id", "roleIds"?: ["id"], "isActive"?: "boolean" }` — `username` is immutable |
| **Response** | Updated user object (Section 6.3.3 shape) |
| **Validation** | `roleIds`, if present: all must be roles the caller is permitted to grant (same privilege-escalation guard as Create); reassigning `departmentId` does not retroactively move that officer's already-assigned complaints |
| **Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 USER_NOT_FOUND` |
| **Related Database Entities** | `user`, `staff_profile`, `user_role_assignment`, `audit_log` |
| **Related Functional Module** | SRS §3.4 Admin Module — Officers (CRUD) |
| **Related AI Agent** | None |

#### 6.3.5 Delete User (Deactivate)

| | |
|---|---|
| **Purpose** | Soft-delete (deactivate) an Officer/Admin account, immediately revoking all active sessions |
| **HTTP Method** | `DELETE` |
| **URL** | `/api/v1/users/{userId}` |
| **Authentication** | Yes — Department Admin (own department) / Corporation Admin / Super Admin |
| **Request** | Path: `userId` |
| **Response** | `204 No Content` |
| **Validation** | Deactivation triggers an `allDevices` logout (`API_SPECIFICATION.md` §2.8) and denylists any live JWT/refresh token for this user; a deactivated officer with active complaint assignments must be reassigned first (`409`) or the reassignment is prompted in the same operation, per tenant policy |
| **Errors** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 USER_NOT_FOUND`, `409 OFFICER_HAS_ACTIVE_ASSIGNMENTS` |
| **Related Database Entities** | `user`, `staff_profile`, `auth_event_log`, `audit_log` |
| **Related Functional Module** | SRS §3.4 Admin Module — Officers (CRUD) |
| **Related AI Agent** | None |

---

### 6.4 Role Management APIs

Composes tenant-scoped custom roles from the global Permission catalog (Section 6.5). System roles (Citizen, Officer, Department Admin, Corporation Admin, Super Admin, SRS §6.3) are seeded, not created through this API.

#### 6.4.1 List Roles

| | |
|---|---|
| **Purpose** | List system-defined and tenant-defined roles |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/roles` |
| **Authentication** | Yes — Corporation Admin / Super Admin |
| **Request** | Query: `?isSystemRole=boolean`, `?page=`, `?size=` |
| **Response** | `{ "data": [ { "id", "name", "isSystemRole", "permissionCount" } ], "meta": { "pagination" } }` |
| **Validation** | None (read-only) |
| **Errors** | `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **Related Database Entities** | `role` |
| **Related Functional Module** | SRS §3.1 Authentication Module — Permission management |
| **Related AI Agent** | None |

#### 6.4.2 Create Role

| | |
|---|---|
| **Purpose** | Define a new tenant-scoped custom role |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/roles` |
| **Authentication** | Yes — Corporation Admin / Super Admin |
| **Request** | Body: `{ "name": "string", "permissionIds": ["id"] }` |
| **Response** | `{ "id", "name", "isSystemRole": false, "createdAt" }` |
| **Validation** | `name`: required, unique within tenant; `permissionIds`: required, at least one, all must exist in the global permission catalog (Section 6.5) |
| **Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `409 ROLE_NAME_ALREADY_EXISTS` |
| **Related Database Entities** | `role`, `role_permission`, `permission` |
| **Related Functional Module** | SRS §3.1 Authentication Module — Permission management |
| **Related AI Agent** | None |

#### 6.4.3 Get Role

| | |
|---|---|
| **Purpose** | Retrieve a role's detail, including its assigned permissions |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/roles/{roleId}` |
| **Authentication** | Yes — Corporation Admin / Super Admin |
| **Request** | Path: `roleId` |
| **Response** | `{ "id", "name", "isSystemRole", "permissions": [ { "id", "resource", "action" } ], "createdAt" }` |
| **Validation** | None (read-only) |
| **Errors** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 ROLE_NOT_FOUND` |
| **Related Database Entities** | `role`, `role_permission`, `permission` |
| **Related Functional Module** | SRS §3.1 Authentication Module — Permission management |
| **Related AI Agent** | None |

#### 6.4.4 Update Role

| | |
|---|---|
| **Purpose** | Rename a tenant-defined role or change its permission set |
| **HTTP Method** | `PATCH` |
| **URL** | `/api/v1/roles/{roleId}` |
| **Authentication** | Yes — Corporation Admin / Super Admin |
| **Request** | Path: `roleId`; Body (JSON Merge Patch): `{ "name"?: "string", "permissionIds"?: ["id"] }` |
| **Response** | Updated role object (Section 6.4.3 shape) |
| **Validation** | Rejected outright (`403`) when `role.isSystemRole = true` — system roles are never editable via this endpoint; `permissionIds`, if present: all must exist in the global catalog |
| **Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` (including attempts on a system role), `404 ROLE_NOT_FOUND`, `409 ROLE_NAME_ALREADY_EXISTS` |
| **Related Database Entities** | `role`, `role_permission`, `audit_log` |
| **Related Functional Module** | SRS §3.1 Authentication Module — Permission management |
| **Related AI Agent** | None |

#### 6.4.5 Delete Role (Deactivate)

| | |
|---|---|
| **Purpose** | Soft-delete (deactivate) a tenant-defined role |
| **HTTP Method** | `DELETE` |
| **URL** | `/api/v1/roles/{roleId}` |
| **Authentication** | Yes — Corporation Admin / Super Admin |
| **Request** | Path: `roleId` |
| **Response** | `204 No Content` |
| **Validation** | Rejected (`403`) for system roles; a role still held by an active `user_role_assignment` may be deactivated (assignment history is preserved) but no longer grantable to new users |
| **Errors** | `401 UNAUTHORIZED`, `403 FORBIDDEN` (including attempts on a system role), `404 ROLE_NOT_FOUND` |
| **Related Database Entities** | `role`, `user_role_assignment`, `audit_log` |
| **Related Functional Module** | SRS §3.1 Authentication Module — Permission management |
| **Related AI Agent** | None |

---

### 6.5 Permission Management APIs

Permissions are a **global, system-defined catalog** (`DATABASE_DESIGN.md` §5 `permission`) — (resource, action) pairs such as `complaint:read:own`, `complaint:assign`, `config:department:write`, `audit:read` (`ARCHITECTURE.md` §11.2). They are never tenant-created, so this catalog is **read-only**: a tenant composes Roles (Section 6.4) from this fixed set rather than defining new permissions.

#### 6.5.1 List Permissions

| | |
|---|---|
| **Purpose** | Retrieve the full (resource, action) permission catalog, for use when composing a Role |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/permissions` |
| **Authentication** | Yes — Corporation Admin / Super Admin |
| **Request** | Query: `?resource=complaint` (optional filter) |
| **Response** | `{ "data": [ { "id", "resource", "action", "description" } ] }` |
| **Validation** | None (read-only) |
| **Errors** | `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **Related Database Entities** | `permission` |
| **Related Functional Module** | SRS §3.1 Authentication Module |
| **Related AI Agent** | None |

#### 6.5.2 Get Permission

| | |
|---|---|
| **Purpose** | Retrieve a single permission's detail |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/permissions/{permissionId}` |
| **Authentication** | Yes — Corporation Admin / Super Admin |
| **Request** | Path: `permissionId` |
| **Response** | `{ "id", "resource", "action", "description" }` |
| **Validation** | None (read-only) |
| **Errors** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 PERMISSION_NOT_FOUND` |
| **Related Database Entities** | `permission` |
| **Related Functional Module** | SRS §3.1 Authentication Module |
| **Related AI Agent** | None |

---

### 6.6 Workflow Management APIs

Manages the Approval Workflow configuration — which categories/departments require multi-level approval, and at which hierarchy level (SRS §3.4, §3.3). Governs the existing `approval_request`/`approval_action` runtime tables (`DATABASE_DESIGN.md` §8) unchanged; a future Generic Workflow Engine (`DATABASE_DESIGN.md` §27) would expose an analogous `/api/v1/workflow-definitions` resource for new modules without altering this API.

#### 6.6.1 List Approval Workflow Rules

| | |
|---|---|
| **Purpose** | List the tenant's configured approval-workflow rules |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/approval-workflows` |
| **Authentication** | Yes — Department Admin (own department) / Corporation Admin / Super Admin |
| **Request** | Query: `?categoryId=`, `?departmentId=`, `?page=`, `?size=` |
| **Response** | `{ "data": [ { "id", "categoryId", "requiredLevelId", "version", "effectiveFrom", "effectiveTo" } ], "meta": { "pagination" } }` |
| **Validation** | None (read-only) |
| **Errors** | `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **Related Database Entities** | `approval_workflow_config` |
| **Related Functional Module** | SRS §3.4 Admin Module — Approval Workflow |
| **Related AI Agent** | None |

#### 6.6.2 Create Approval Workflow Rule

| | |
|---|---|
| **Purpose** | Define which category requires multi-level approval, and at which hierarchy level |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/approval-workflows` |
| **Authentication** | Yes — Corporation Admin / Super Admin |
| **Request** | Body: `{ "categoryId": "id", "requiredLevelId": "id", "effectiveFrom": "ISO-8601" }` |
| **Response** | `{ "id", "categoryId", "requiredLevelId", "version": 1, "effectiveFrom" }` |
| **Validation** | `categoryId`/`requiredLevelId`: required, must exist within tenant; `effectiveFrom`: required, must not be in the past |
| **Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 CATEGORY_NOT_FOUND` |
| **Related Database Entities** | `approval_workflow_config` |
| **Related Functional Module** | SRS §3.4 Admin Module — Approval Workflow |
| **Related AI Agent** | None |

#### 6.6.3 Get Approval Workflow Rule

| | |
|---|---|
| **Purpose** | Retrieve a single approval-workflow rule's current detail |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/approval-workflows/{workflowConfigId}` |
| **Authentication** | Yes — Department Admin (own department) / Corporation Admin / Super Admin |
| **Request** | Path: `workflowConfigId` |
| **Response** | `{ "id", "categoryId", "requiredLevelId", "version", "effectiveFrom", "effectiveTo" }` |
| **Validation** | None (read-only) |
| **Errors** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 WORKFLOW_CONFIG_NOT_FOUND` |
| **Related Database Entities** | `approval_workflow_config` |
| **Related Functional Module** | SRS §3.4 Admin Module — Approval Workflow |
| **Related AI Agent** | None |

#### 6.6.4 Update Approval Workflow Rule (New Version)

| | |
|---|---|
| **Purpose** | Change the required approval level for a category — creates a new version rather than overwriting the existing row |
| **HTTP Method** | `PATCH` |
| **URL** | `/api/v1/approval-workflows/{workflowConfigId}` |
| **Authentication** | Yes — Corporation Admin / Super Admin |
| **Request** | Path: `workflowConfigId`; Body: `{ "requiredLevelId": "id", "effectiveFrom": "ISO-8601" }` |
| **Response** | `{ "id", "categoryId", "requiredLevelId", "version": "int (incremented)", "effectiveFrom" }` — the prior version's `effectiveTo` is set to the new version's `effectiveFrom` (`DATABASE_DESIGN.md` §22) |
| **Validation** | `effectiveFrom`: required, must not be in the past; an in-flight `approval_request` remains governed by the version that was active when it was created |
| **Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 WORKFLOW_CONFIG_NOT_FOUND` |
| **Related Database Entities** | `approval_workflow_config`, `config_change_history` |
| **Related Functional Module** | SRS §3.4 Admin Module — Approval Workflow; `DATABASE_DESIGN.md` §22 Versioning Strategy |
| **Related AI Agent** | None |

#### 6.6.5 Delete Approval Workflow Rule (Deactivate)

| | |
|---|---|
| **Purpose** | Soft-delete (deactivate) an approval-workflow rule, removing the approval requirement for future complaints in that category |
| **HTTP Method** | `DELETE` |
| **URL** | `/api/v1/approval-workflows/{workflowConfigId}` |
| **Authentication** | Yes — Corporation Admin / Super Admin |
| **Request** | Path: `workflowConfigId` |
| **Response** | `204 No Content` |
| **Validation** | Does not affect any `approval_request` already in progress under this rule |
| **Errors** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 WORKFLOW_CONFIG_NOT_FOUND` |
| **Related Database Entities** | `approval_workflow_config`, `audit_log` |
| **Related Functional Module** | SRS §3.4 Admin Module — Approval Workflow |
| **Related AI Agent** | None |

---

### 6.7 SLA Management APIs

Manages resolution-time targets per department/category/priority (SRS §3.4). Every rule is versioned (`DATABASE_DESIGN.md` §22); `sla_tracking` on a live complaint pins the specific version active at assignment time, so a rule change never retroactively alters a promise already made to a citizen.

#### 6.7.1 List SLA Rules

| | |
|---|---|
| **Purpose** | List the tenant's configured SLA rules |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/sla-rules` |
| **Authentication** | Yes — Department Admin (own department) / Corporation Admin / Super Admin |
| **Request** | Query: `?departmentId=`, `?categoryId=`, `?priority=`, `?page=`, `?size=` |
| **Response** | `{ "data": [ { "id", "departmentId", "categoryId", "priority", "resolutionHours", "version", "effectiveFrom" } ], "meta": { "pagination" } }` |
| **Validation** | None (read-only) |
| **Errors** | `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **Related Database Entities** | `sla_rule_config` |
| **Related Functional Module** | SRS §3.4 Admin Module — SLA Settings |
| **Related AI Agent** | None |

#### 6.7.2 Create SLA Rule

| | |
|---|---|
| **Purpose** | Define the resolution-time target for a department/category/priority combination |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/sla-rules` |
| **Authentication** | Yes — Department Admin (own department) / Corporation Admin |
| **Request** | Body: `{ "departmentId": "id", "categoryId": "id", "priority": "string", "resolutionHours": "integer", "effectiveFrom": "ISO-8601" }` |
| **Response** | `{ "id", "departmentId", "categoryId", "priority", "resolutionHours", "version": 1, "effectiveFrom" }` |
| **Validation** | `resolutionHours`: required, positive integer, ≤8760 (1-year ceiling); `departmentId`/`categoryId`: must exist within tenant |
| **Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 DEPARTMENT_OR_CATEGORY_NOT_FOUND` |
| **Related Database Entities** | `sla_rule_config` |
| **Related Functional Module** | SRS §3.4 Admin Module — SLA Settings |
| **Related AI Agent** | None |

#### 6.7.3 Get SLA Rule

| | |
|---|---|
| **Purpose** | Retrieve a single SLA rule's current detail |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/sla-rules/{slaRuleId}` |
| **Authentication** | Yes — Department Admin (own department) / Corporation Admin / Super Admin |
| **Request** | Path: `slaRuleId` |
| **Response** | `{ "id", "departmentId", "categoryId", "priority", "resolutionHours", "version", "effectiveFrom", "effectiveTo" }` |
| **Validation** | None (read-only) |
| **Errors** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 SLA_RULE_NOT_FOUND` |
| **Related Database Entities** | `sla_rule_config` |
| **Related Functional Module** | SRS §3.4 Admin Module — SLA Settings |
| **Related AI Agent** | None |

#### 6.7.4 Update SLA Rule (New Version)

| | |
|---|---|
| **Purpose** | Change the resolution-hours target — creates a new version rather than overwriting the existing row |
| **HTTP Method** | `PATCH` |
| **URL** | `/api/v1/sla-rules/{slaRuleId}` |
| **Authentication** | Yes — Department Admin (own department) / Corporation Admin |
| **Request** | Path: `slaRuleId`; Body: `{ "resolutionHours": "integer", "effectiveFrom": "ISO-8601" }` |
| **Response** | `{ "id", "departmentId", "categoryId", "priority", "resolutionHours", "version": "int (incremented)", "effectiveFrom" }` |
| **Validation** | `resolutionHours`: required, positive integer, ≤8760; a complaint already assigned keeps its **originally-pinned** `sla_rule_config` version (`DATABASE_DESIGN.md` §22) — this endpoint never retroactively changes an active complaint's due date |
| **Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 SLA_RULE_NOT_FOUND` |
| **Related Database Entities** | `sla_rule_config`, `config_change_history` |
| **Related Functional Module** | SRS §3.4 Admin Module — SLA Settings; `DATABASE_DESIGN.md` §22 Versioning Strategy |
| **Related AI Agent** | None |

#### 6.7.5 Delete SLA Rule (Deactivate)

| | |
|---|---|
| **Purpose** | Soft-delete (deactivate) an SLA rule |
| **HTTP Method** | `DELETE` |
| **URL** | `/api/v1/sla-rules/{slaRuleId}` |
| **Authentication** | Yes — Department Admin (own department) / Corporation Admin |
| **Request** | Path: `slaRuleId` |
| **Response** | `204 No Content` |
| **Validation** | Does not affect `sla_tracking` rows already pinned to this rule's prior versions |
| **Errors** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 SLA_RULE_NOT_FOUND` |
| **Related Database Entities** | `sla_rule_config`, `audit_log` |
| **Related Functional Module** | SRS §3.4 Admin Module — SLA Settings |
| **Related AI Agent** | None |

---

### 6.8 Escalation Management APIs

Manages the Escalation Matrix — from/to hierarchy level, and the condition/timer that fires an escalation (SRS §3.4). Rule *definitions* here are deterministic configuration; the SLA Agent (SRS §3.5) is what evaluates and fires them at runtime against `escalation_instance` (`DATABASE_DESIGN.md` §8).

#### 6.8.1 List Escalation Rules

| | |
|---|---|
| **Purpose** | List the tenant's configured escalation rules |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/escalation-rules` |
| **Authentication** | Yes — Corporation Admin / Super Admin |
| **Request** | Query: `?departmentId=`, `?page=`, `?size=` |
| **Response** | `{ "data": [ { "id", "departmentId", "fromLevelId", "toLevelId", "triggerCondition", "escalateAfterHours", "version" } ], "meta": { "pagination" } }` |
| **Validation** | None (read-only) |
| **Errors** | `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **Related Database Entities** | `escalation_matrix_config` |
| **Related Functional Module** | SRS §3.4 Admin Module — Escalation Matrix |
| **Related AI Agent** | None |

#### 6.8.2 Create Escalation Rule

| | |
|---|---|
| **Purpose** | Define an escalation trigger — from/to hierarchy level, and the condition/timer that fires it |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/escalation-rules` |
| **Authentication** | Yes — Corporation Admin / Super Admin |
| **Request** | Body: `{ "departmentId": "id", "fromLevelId": "id", "toLevelId": "id", "triggerCondition": "sla_breach" \| "no_action_after_hours", "escalateAfterHours": "integer" }` |
| **Response** | `{ "id", "departmentId", "fromLevelId", "toLevelId", "triggerCondition", "escalateAfterHours", "version": 1 }` |
| **Validation** | `fromLevelId`/`toLevelId`: required, `toLevelId` must be a higher hierarchy level than `fromLevelId`; `escalateAfterHours`: positive integer |
| **Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `422 INVALID_LEVEL_ORDER` |
| **Related Database Entities** | `escalation_matrix_config` |
| **Related Functional Module** | SRS §3.4 Admin Module — Escalation Matrix |
| **Related AI Agent** | None |

#### 6.8.3 Get Escalation Rule

| | |
|---|---|
| **Purpose** | Retrieve a single escalation rule's current detail |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/escalation-rules/{escalationRuleId}` |
| **Authentication** | Yes — Corporation Admin / Super Admin |
| **Request** | Path: `escalationRuleId` |
| **Response** | `{ "id", "departmentId", "fromLevelId", "toLevelId", "triggerCondition", "escalateAfterHours", "version", "effectiveFrom" }` |
| **Validation** | None (read-only) |
| **Errors** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 ESCALATION_RULE_NOT_FOUND` |
| **Related Database Entities** | `escalation_matrix_config` |
| **Related Functional Module** | SRS §3.4 Admin Module — Escalation Matrix |
| **Related AI Agent** | None |

#### 6.8.4 Update Escalation Rule (New Version)

| | |
|---|---|
| **Purpose** | Change an escalation rule's timer/target level — creates a new version rather than overwriting the existing row |
| **HTTP Method** | `PATCH` |
| **URL** | `/api/v1/escalation-rules/{escalationRuleId}` |
| **Authentication** | Yes — Corporation Admin / Super Admin |
| **Request** | Path: `escalationRuleId`; Body: `{ "toLevelId"?: "id", "escalateAfterHours"?: "integer" }` |
| **Response** | `{ "id", "departmentId", "fromLevelId", "toLevelId", "triggerCondition", "escalateAfterHours", "version": "int (incremented)" }` |
| **Validation** | `toLevelId`, if present: must remain a higher hierarchy level than `fromLevelId`; `escalateAfterHours`, if present: positive integer |
| **Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 ESCALATION_RULE_NOT_FOUND`, `422 INVALID_LEVEL_ORDER` |
| **Related Database Entities** | `escalation_matrix_config`, `config_change_history` |
| **Related Functional Module** | SRS §3.4 Admin Module — Escalation Matrix; `DATABASE_DESIGN.md` §22 Versioning Strategy |
| **Related AI Agent** | None |

#### 6.8.5 Delete Escalation Rule (Deactivate)

| | |
|---|---|
| **Purpose** | Soft-delete (deactivate) an escalation rule |
| **HTTP Method** | `DELETE` |
| **URL** | `/api/v1/escalation-rules/{escalationRuleId}` |
| **Authentication** | Yes — Corporation Admin / Super Admin |
| **Request** | Path: `escalationRuleId` |
| **Response** | `204 No Content` |
| **Validation** | Does not affect any `escalation_instance` already triggered under this rule |
| **Errors** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 ESCALATION_RULE_NOT_FOUND` |
| **Related Database Entities** | `escalation_matrix_config`, `audit_log` |
| **Related Functional Module** | SRS §3.4 Admin Module — Escalation Matrix |
| **Related AI Agent** | None |

---

### 6.9 Configuration APIs

Manages the tenant's aggregate configuration — session timeouts, password policy thresholds, reopen window, and similar tenant-level settings (SRS §7, §8.1). This is a **singleton** resource per tenant (no list/create/delete — a tenant has exactly one configuration record), unlike the collection-shaped resources in Sections 6.1–6.4 and 6.6–6.8.

#### 6.9.1 Get Tenant Configuration

| | |
|---|---|
| **Purpose** | Retrieve the current tenant's aggregate configuration — the single read the Admin Portal's Settings screens use to hydrate their forms |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/tenant-config` |
| **Authentication** | Yes — Corporation Admin / Super Admin |
| **Request** | None |
| **Response** | `{ "tenantCode", "tenantName", "defaultLanguage", "sessionTimeouts": { "citizen", "officer", "admin" }, "passwordPolicy": { "minLength", "rotationDays" }, "reopenWindowDays" }` |
| **Validation** | None (read-only) |
| **Errors** | `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **Related Database Entities** | `tenant` |
| **Related Functional Module** | SRS §7 Multi-Tenancy & Configurability Requirements |
| **Related AI Agent** | None |

#### 6.9.2 Update Tenant Configuration

| | |
|---|---|
| **Purpose** | Partially update tenant-level settings (session timeouts, password policy thresholds, reopen window, etc.) |
| **HTTP Method** | `PATCH` |
| **URL** | `/api/v1/tenant-config` |
| **Authentication** | Yes — Corporation Admin / Super Admin |
| **Request** | Body (JSON Merge Patch): `{ "defaultLanguage"?: "ta" \| "en", "sessionTimeouts"?: { "citizen"?, "officer"?, "admin"? }, "passwordPolicy"?: { "minLength"?, "rotationDays"? }, "reopenWindowDays"? }` |
| **Response** | Updated configuration object (Section 6.9.1 shape) |
| **Validation** | `sessionTimeouts.*`/`passwordPolicy.*`: bounded by the system-enforced ceiling/floor documented in SRS §8.1 (e.g. `passwordPolicy.minLength` cannot be set below 12); `reopenWindowDays`: positive integer |
| **Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **Related Database Entities** | `tenant`, `config_change_history` |
| **Related Functional Module** | SRS §7 Multi-Tenancy & Configurability Requirements; §8.1 Authentication & Session Security Policy |
| **Related AI Agent** | None |

---

### 6.10 Feature Flag APIs

Manages the tenant's feature-flag state (e.g. `use_generic_org_hierarchy`, `DATABASE_DESIGN.md` §28). Flags are **system-defined toggles**, not admin-creatable entities — the set of available flag keys ships with the platform, so there is no Create/Delete here, only List and Toggle (the same read-only-catalog rationale as Permissions, Section 6.5).

#### 6.10.1 List Feature Flags

| | |
|---|---|
| **Purpose** | Retrieve the tenant's feature-flag state |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/feature-flags` |
| **Authentication** | Yes — Corporation Admin / Super Admin |
| **Request** | None |
| **Response** | `{ "data": [ { "flagKey", "isEnabled", "flagType" } ] }` |
| **Validation** | None (read-only) |
| **Errors** | `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **Related Database Entities** | `feature_flag_config` |
| **Related Functional Module** | `INFRASTRUCTURE_DEVOPS.md` §16 |
| **Related AI Agent** | None |

#### 6.10.2 Toggle Feature Flag

| | |
|---|---|
| **Purpose** | Enable or disable a specific feature flag for the tenant |
| **HTTP Method** | `PATCH` |
| **URL** | `/api/v1/feature-flags/{flagKey}` |
| **Authentication** | Yes — Corporation Admin / Super Admin |
| **Request** | Path: `flagKey`; Body: `{ "isEnabled": "boolean" }` |
| **Response** | `{ "flagKey", "isEnabled", "flagType", "updatedAt" }` |
| **Validation** | `flagKey`: must be a recognized, system-shipped flag key; `isEnabled`: required boolean |
| **Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 FLAG_NOT_FOUND` |
| **Related Database Entities** | `feature_flag_config`, `audit_log` |
| **Related Functional Module** | `INFRASTRUCTURE_DEVOPS.md` §16 |
| **Related AI Agent** | None |

---

### 6.11 Provider Configuration APIs

Manages which pluggable provider (AI / Voice / WhatsApp / SMS / SMTP / Maps) is active for the tenant (SRS §3.4, §5). Like Feature Flags, the set of **supported adapters** per `providerType` is system-shipped, not tenant-creatable — Provider Configuration selects among them and stores only a secrets-manager reference, never a raw credential (`INFRASTRUCTURE_DEVOPS.md` §7).

#### 6.11.1 List Providers

| | |
|---|---|
| **Purpose** | Retrieve the tenant's currently configured provider per capability |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/providers` |
| **Authentication** | Yes — Corporation Admin / Super Admin |
| **Request** | Query: `?providerType=ai\|voice\|sms\|whatsapp\|email\|maps` |
| **Response** | `{ "data": [ { "providerType", "providerName", "isActive", "updatedAt" } ] }` |
| **Validation** | None (read-only) |
| **Errors** | `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **Related Database Entities** | `provider_config` |
| **Related Functional Module** | SRS §3.4 Admin Module — AI/Voice/Notification Provider configuration |
| **Related AI Agent** | None |

#### 6.11.2 Set Active Provider

| | |
|---|---|
| **Purpose** | Select which pluggable provider is active for a given capability |
| **HTTP Method** | `PUT` |
| **URL** | `/api/v1/providers/{providerType}` |
| **Authentication** | Yes — Super Admin only (provider selection is a platform-level, higher-trust action; not delegated to Corporation Admin by default) |
| **Request** | Path: `providerType`; Body: `{ "providerName": "string", "secretReference": "string (secrets-manager reference, never a raw credential)" }` |
| **Response** | `{ "providerType", "providerName", "isActive": true, "updatedAt" }` |
| **Validation** | `providerName`: required, must be one of the system-supported adapters for `providerType`; `secretReference`: required, rejected outright if it looks like a raw secret rather than a reference (pattern check, OWASP A02) |
| **Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `422 UNSUPPORTED_PROVIDER` |
| **Related Database Entities** | `provider_config`, `audit_log` |
| **Related Functional Module** | SRS §3.4 Admin Module — AI/Voice/Notification Provider configuration |
| **Related AI Agent** | None |

---

*(End of Section 6. Continuation into Section 7 — Geographic APIs — is a separate file per the same splitting request.)*
