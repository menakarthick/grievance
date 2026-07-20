# API Specification Document — Section 8

## AI Powered Enterprise Citizen Service & Grievance Management Platform

> **Continuation note**: This file continues the API Specification from the end of the approved Section 7 (Geographic APIs, `docs/07-Geographic-APIs.md`). Sections 1–7 are not reproduced, summarized, or modified here. This file contains **only** Section 8 (Notification APIs) and is otherwise governed by the same design principles, error envelope, HTTP status code table, and security model already defined in `docs/API_SPECIFICATION.md` Sections 1, 12, 13, 14. No SQL, no Express routes, no controllers, no services, no database queries, no implementation code.

---

## 8. Notification APIs

Backed by the **Notification Service** (`ARCHITECTURE.md` §3.1 #10; §10 Notification Architecture; §16 Redis Architecture for queue mechanics). This section is fully compatible with — and introduces no change to — the Business Requirements, `SRS.md`, `ARCHITECTURE.md`, `INFRASTRUCTURE_DEVOPS.md`, `DATABASE_DESIGN.md` v1.1, the AI Agent architecture, and API Specification Sections 1–7. Every endpoint below maps onto the existing `notification_event`, `notification_dispatch`, `notification_preference`, `notification_template_config`, and `provider_config` entities (`DATABASE_DESIGN.md` §7, §11) — no new table is introduced. Where an operational concept (queue depth, dead-letter state, live provider reachability) is inherently Redis-resident rather than a MySQL row (`ARCHITECTURE.md` §16, `DATABASE_DESIGN.md` §13's refresh-token precedent for "Redis-only by design"), this document says so explicitly rather than inventing a table for it.

---

### 8.1 Notification Overview

This subsection is the shared reference for every endpoint in 8.2–8.16 — channels, providers, template features, queue mechanics, preference model, delivery-status lifecycle, analytics metrics, and health checks are defined once here rather than repeated per endpoint.

#### 8.1.1 Design Principle — One Pipeline, Channel-Typed Views

Consistent with `API_SPECIFICATION.md` §8's original design (and unchanged by this expansion): there is **one generic notification pipeline** — one `notification_event` fans out to one-or-more `notification_dispatch` rows, one per (recipient, channel) — not a separate pipeline per channel. Sections 8.2–8.6 (SMS/Email/WhatsApp/Push/In-App) are **channel-typed convenience views** over this single pipeline, matching the same pattern already used for Corporation/Region/Division in `07-Geographic-APIs.md` §7.0: a dedicated URL per channel for documentation ergonomics and channel-specific request/response shaping, while the underlying mechanism, tables, and provider-abstraction layer remain exactly the ones already approved in `ARCHITECTURE.md` §10.2 and `DATABASE_DESIGN.md` §11. **Provider-specific logic is never exposed through any API in this section** — every request/response body is expressed in channel-abstracted terms (recipient, template, variables, status); a provider's own field names, authentication scheme, or wire format never leak into the contract.

#### 8.1.2 Supported Notification Channels

| Channel | `channel` value | Phase | Notes |
|---|---|---|---|
| SMS | `sms` | Phase-1 | DLT-registered Indian SMS gateway (SRS §5) |
| Email | `email` | Phase-1 | SMTP, configurable (SRS §5) |
| WhatsApp | `whatsapp` | Phase-1 | Official WhatsApp Business Platform (SRS §5) |
| Mobile Push | `push_mobile` | Phase-1 | Firebase Cloud Messaging (SRS §5) |
| Web Push | `push_web` | Phase-1/2 | Browser-subscription push via the same FCM/OneSignal abstraction |
| Browser Notification | `push_browser` | Phase-1/2 | In-tab/desktop browser notification, same push provider abstraction |
| In-App Notification | `in_app` | Phase-1 | No external provider — written directly to `notification_dispatch`, surfaced via the portal's own notification inbox |
| Voice Call | `voice_call` | **Future** | Not built in Phase-1; reserved channel value, returns `501 NOT_ENABLED` |
| IVRS | `ivrs` | **Future** | Not built in Phase-1; reserved channel value, returns `501 NOT_ENABLED` |

#### 8.1.3 Supported Providers (Abstracted)

Provider selection is managed exclusively through the Provider Configuration APIs already approved in `06-Administration-APIs.md` §6.11 (`GET/PUT /api/v1/providers/{providerType}`) — this section's 8.12 Notification Provider APIs are a **read-oriented, notification-scoped view** of that same `provider_config` table, never a duplicate mutation path. Example provider adapters behind the abstraction (illustrative, not exhaustive, and never named in any request/response body other than the configuration endpoints themselves): government SMS gateway / NIC Services, WhatsApp Business Platform (Meta Cloud API, Gupshup, Karix, Twilio), SMTP relay, Firebase Cloud Messaging, OneSignal. Future providers are added by inserting a `provider_config` row (Principle 2, config-driven) — never by adding a new API.

#### 8.1.4 Template Features

| Feature | Description |
|---|---|
| Multi-language | Tamil and English at Phase-1 (SRS §4.4), extensible via `reference_value` (`DATABASE_DESIGN.md` §29) without a schema change |
| Parameterized Templates | `{{variable}}` placeholders validated against the event type's known variable set |
| Rich Text | Supported for Email/In-App body content |
| HTML Email | A template may carry an HTML body variant alongside its plain-text body |
| Attachments | Email templates may reference a `file_asset` (`DATABASE_DESIGN.md` §12) to attach |
| Versioning | Every edit creates a new version, never an overwrite (`DATABASE_DESIGN.md` §22) |
| Approval Workflow | `draft → pending_approval → approved / rejected`, carried as a conceptual attribute of the already-versioned `notification_template_config` row |
| Preview | Render a template against sample variables without dispatching |
| Test Send | Dispatch a real message to a designated test recipient only |

#### 8.1.5 Queue Features

| Feature | Description |
|---|---|
| Asynchronous Delivery | Every dispatch is queued (Redis, `ARCHITECTURE.md` §16, §18) and processed by the `notification-service` PM2 process group (`ARCHITECTURE.md` §3.2) |
| Retry Queue | Failed dispatches are retried with backoff; `notification_dispatch.retry_count` is the durable, queryable mirror of retry state |
| Dead Letter Queue | A dispatch exhausting its retry budget moves to `status = dead_letter` — visible and requeueable via 8.9 |
| Priority Queue | SLA-breach and emergency-override notifications (8.8.4) are dispatched ahead of routine notifications |
| Scheduled Notifications | A dispatch may carry a future `scheduledAt`; the Scheduler (`ARCHITECTURE.md` §17) releases it into the active queue at that time |
| Delayed Delivery | Same mechanism as Scheduled Notifications, expressed as a relative delay rather than an absolute time |
| Cancellation | A queued-but-not-yet-sent dispatch may be cancelled (8.9.4) |
| Status Tracking | Every dispatch's lifecycle is queryable via 8.10 Notification History APIs |

**Queue state itself is Redis-resident** (`ARCHITECTURE.md` §16, "Queues — High persistence need, AOF enabled") — the same "operational, not a system-of-record table" pattern already established for refresh tokens and OTP (`DATABASE_DESIGN.md` §13). `notification_dispatch.status`/`retry_count` in MySQL is the durable, auditable mirror the APIs in 8.9–8.11 read from; Redis remains the real-time enforcement point.

#### 8.1.6 Notification Preferences

| Concern | Description |
|---|---|
| Citizen Preferences | Per-channel enable/disable (already established in `API_SPECIFICATION.md` §3.5 / `03-...` — unchanged); this section's 8.8 generalizes the same shape to every user type |
| Officer Preferences | Officers may independently configure channel/quiet-hours/category preferences for their own account |
| Department Preferences | A Department Admin may set a department-wide default preference profile that new Officer accounts inherit |
| Enable/Disable Channels | Per-channel boolean toggle |
| Quiet Hours | A daily time window during which only emergency-override notifications are delivered |
| Language Preference | Drives which `notification_template_config` language variant is rendered |
| Category Preference | Per-event-type opt-out (e.g. a citizen may disable "weekly digest" but keep "status change" alerts) |
| Emergency Override | An Admin-triggered forced delivery that bypasses all of the above — reserved for SLA-critical or public-safety alerts (8.8.4) |

#### 8.1.7 Delivery Status Lifecycle

`Queued → Accepted → Sent → Delivered → Read → [Failed | Expired | Cancelled | Retried]` — sourced from the tenant-configurable `reference_value` domain `NOTIFICATION_STATUS` (`DATABASE_DESIGN.md` §29), never a native `ENUM` (Principle 2):

| Status | Meaning |
|---|---|
| `Queued` | Accepted by the Notification Service, waiting in the Redis queue |
| `Accepted` | Provider has accepted the message for delivery |
| `Sent` | Provider confirms transmission |
| `Delivered` | Provider confirms receipt at the recipient's device/handset |
| `Read` | Recipient opened/viewed the message (where the channel supports read receipts — Email open-tracking, In-App, WhatsApp blue-tick) |
| `Failed` | Provider reported a terminal failure |
| `Expired` | A scheduled/delayed dispatch whose delivery window passed unactioned |
| `Cancelled` | Explicitly cancelled before dispatch (8.9.4) |
| `Retried` | A prior `Failed` attempt that has been resubmitted (8.11) |

#### 8.1.8 Notification Analytics Metrics

Delivery Rate, Failure Rate, Provider Performance, Read Rate, Open Rate, Click Rate, Retry Statistics, Queue Size, Average Delivery Time — all pre-aggregated from `notification_dispatch`, following the same denormalized-reporting-table rationale already fixed in `DATABASE_DESIGN.md` §14/§17 (computed by a scheduled job, not live-aggregated on every dashboard load). Detailed in 8.15.

#### 8.1.9 Health Check Categories

Provider Health, Queue Health, SMS Gateway Status, Email Server Status, WhatsApp Status, Push Provider Status — surfaced via 8.16, consistent with the `/healthz` pattern and Prometheus-style metrics already defined in `ARCHITECTURE.md` §15.

#### 8.1.10 Cross-Cutting Requirements Applied Throughout Section 8

- **Versioning**: every endpoint below is `/api/v1/...` (`API_SPECIFICATION.md` §15.1).
- **Filtering, sorting, pagination**: every list endpoint supports the query conventions defined in `API_SPECIFICATION.md` §1.8–§1.10; keyset/cursor pagination for high-volume collections (history, queue), offset pagination for small bounded ones (templates, providers).
- **Bulk operations**: 8.11.2 (bulk retry) and all of 8.14 (Bulk Notification APIs).
- **Correlation ID / Request ID**: every request/response pair carries `X-Correlation-Id`/`X-Request-Id` per `API_SPECIFICATION.md` §1.14–§1.15; not repeated as a per-endpoint row below except where an endpoint has channel-specific header behavior worth calling out.
- **Localization**: every send/template endpoint honors `Accept-Language` (`API_SPECIFICATION.md` §1.13).
- **Optimistic concurrency**: applied where a resource can be concurrently edited by two Admin sessions — Template Update (8.7.4, via the template's existing `version`), Notification Preference Update (8.8.2), and Broadcast/Bulk Job Cancel (8.13.4, 8.14.3) — each documented per-endpoint below under Validation Rules/Business Rules.

---

### 8.2 SMS APIs

Channel-typed convenience view over the generic dispatch pipeline (Section 8.1.1), abstracted from the underlying SMS gateway (Section 8.1.3).

#### 8.2.1 Send SMS Notification

| | |
|---|---|
| **Endpoint Name** | Send SMS Notification |
| **Purpose** | Dispatch an SMS to a recipient using a configured, approved template |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/notifications/sms` |
| **Authentication Required** | Yes |
| **Authorization** | Internal service token (event-driven dispatch from Complaint/Officer Workflow/Assignment services) or Corporation Admin/Super Admin (manual/test send) |
| **Request Parameters** | None |
| **Request Headers** | `Authorization: Bearer <jwt>`; `X-Correlation-Id` (optional, generated at Gateway if absent); `X-Request-Id` (server-assigned, echoed); `Idempotency-Key` (recommended); `Accept-Language` (drives template language selection) |
| **Request Body** | `{ "recipientUserId": "id", "templateKey": "string", "languageCode"?: "ta" \| "en", "variables": { "key": "value" }, "priority"?: "normal" \| "high" \| "emergency" }` |
| **Response Body** | `{ "notificationDispatchId", "channel": "sms", "status": "queued", "providerMessageId"?: "string" }` |
| **Validation Rules** | `recipientUserId`: required, must resolve to a user with a registered mobile number; `templateKey`: required, must exist, be `approved` (Section 8.1.4), and active for channel `sms`/`languageCode`; `variables`: must satisfy the template's declared placeholder set |
| **Business Rules** | Blocked if the recipient has disabled the SMS channel (`notification_preference`) unless `priority = emergency` (Emergency Override, 8.8.4); SMS body is truncated/segmented per the 160-character-per-segment convention noted in template length ceilings (`API_SPECIFICATION.md` §8.3 precedent) |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 TEMPLATE_NOT_FOUND`, `409 TEMPLATE_NOT_APPROVED`, `422 CHANNEL_DISABLED_BY_RECIPIENT`, `503 PROVIDER_UNAVAILABLE` |
| **HTTP Status Codes** | `202 Accepted` (queued), `400`, `401`, `403`, `404`, `409`, `422`, `429`, `503`, `500` |
| **Rate Limiting** | Per-tenant SMS dispatch throttle (Redis token bucket, `ARCHITECTURE.md` §16), tuned below the DLT gateway's own throughput ceiling |
| **Idempotency** | `Idempotency-Key` honored — a repeated key within 24 hours replays the original `notificationDispatchId` rather than sending twice (`API_SPECIFICATION.md` §1.5) |
| **Related Database Entities** | `notification_event`, `notification_dispatch`, `notification_template_config`, `notification_preference` |
| **Related Functional Module** | SRS §5 External Interface Requirements — SMS |
| **Related AI Agent** | Notification Agent (deterministic, rule-driven dispatch orchestration, `ARCHITECTURE.md` §3.1 design note) |
| **Audit Requirements** | An `audit_log` entry is written for every manual/test send (Admin-triggered); event-driven sends emit only the standard `notification_event`/`notification_dispatch` trail, per `ARCHITECTURE.md` §11.5 |
| **Security Considerations** | Mobile number is never echoed in full in logs (masked, `ARCHITECTURE.md` §8.2 masking principle applied to PII in logs); template content is sanitized against injection before variable interpolation (OWASP A03) |

#### 8.2.2 Get SMS Notification Status

| | |
|---|---|
| **Endpoint Name** | Get SMS Notification Status |
| **Purpose** | Retrieve the current delivery status of a specific SMS dispatch |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/notifications/sms/{notificationDispatchId}` |
| **Authentication Required** | Yes |
| **Authorization** | Recipient (own notification) or Officer/Admin within scope |
| **Request Parameters** | Path: `notificationDispatchId` |
| **Request Headers** | `Authorization: Bearer <jwt>`; `X-Correlation-Id` (optional) |
| **Request Body** | None |
| **Response Body** | `{ "notificationDispatchId", "channel": "sms", "status", "providerMessageId", "sentAt", "deliveredAt" }` |
| **Validation Rules** | `notificationDispatchId`: must exist and be channel `sms` |
| **Business Rules** | None beyond ownership/scope check |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOTIFICATION_NOT_FOUND` |
| **HTTP Status Codes** | `200`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable (`GET` is inherently idempotent) |
| **Related Database Entities** | `notification_dispatch` |
| **Related Functional Module** | SRS §5 External Interface Requirements — SMS |
| **Related AI Agent** | None |
| **Audit Requirements** | Read access is not separately audited (read-only, non-sensitive status) |
| **Security Considerations** | Response never includes the SMS body content, only status metadata, limiting exposure if a token is compromised |

#### 8.2.3 Test Send SMS Notification

| | |
|---|---|
| **Endpoint Name** | Test Send SMS Notification |
| **Purpose** | Send a real SMS to a designated test recipient to validate a template/provider before production use |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/notifications/sms/test` |
| **Authentication Required** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Parameters** | None |
| **Request Headers** | `Authorization: Bearer <jwt>`; `X-Correlation-Id` (optional) |
| **Request Body** | `{ "templateKey": "string", "languageCode": "ta" \| "en", "testMobileNumber": "string", "variables": { "key": "value" } }` |
| **Response Body** | `{ "notificationDispatchId", "channel": "sms", "status": "queued", "isTestSend": true }` |
| **Validation Rules** | `testMobileNumber`: required, valid Indian mobile format; `templateKey`: required, may be `draft` or `pending_approval` (test sends are exempt from the approval gate that blocks Section 8.2.1) |
| **Business Rules** | Test sends are flagged `isTestSend = true` and excluded from Notification Analytics (8.15) delivery-rate calculations |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 TEMPLATE_NOT_FOUND`, `503 PROVIDER_UNAVAILABLE` |
| **HTTP Status Codes** | `202`, `400`, `401`, `403`, `404`, `429`, `503` |
| **Rate Limiting** | Tightly throttled (e.g. 10/hour per Admin) to prevent test-send abuse of a paid SMS gateway |
| **Idempotency** | Not required — a test send is intentionally repeatable |
| **Related Database Entities** | `notification_dispatch`, `notification_template_config` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §7 Configuration Tables — Notification Template Config |
| **Related AI Agent** | None |
| **Audit Requirements** | `audit_log` entry recording which Admin test-sent which template to which masked test number |
| **Security Considerations** | `testMobileNumber` is validated against an Admin-configured allow-list where the tenant chooses to restrict test sends to known numbers |

---

### 8.3 Email APIs

Channel-typed convenience view supporting Rich Text/HTML body and attachments (Section 8.1.4).

#### 8.3.1 Send Email Notification

| | |
|---|---|
| **Endpoint Name** | Send Email Notification |
| **Purpose** | Dispatch an email to a recipient using a configured, approved template, optionally with attachments |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/notifications/email` |
| **Authentication Required** | Yes |
| **Authorization** | Internal service token or Corporation Admin/Super Admin (manual/test send) |
| **Request Parameters** | None |
| **Request Headers** | `Authorization: Bearer <jwt>`; `X-Correlation-Id`; `Idempotency-Key` (recommended); `Accept-Language` |
| **Request Body** | `{ "recipientUserId": "id", "templateKey": "string", "languageCode"?: "ta" \| "en", "variables": { "key": "value" }, "attachmentFileAssetIds"?: ["id"], "priority"?: "normal" \| "high" \| "emergency" }` |
| **Response Body** | `{ "notificationDispatchId", "channel": "email", "status": "queued", "providerMessageId"?: "string" }` |
| **Validation Rules** | `recipientUserId`: required, must resolve to a user with a registered email address; `templateKey`: required, `approved`, active for channel `email`; `attachmentFileAssetIds`, if present: each must reference a virus-scanned, `clean` `file_asset` (`DATABASE_DESIGN.md` §12) |
| **Business Rules** | Blocked if the recipient has disabled the Email channel unless `priority = emergency`; HTML body is rendered from the template's HTML variant, falling back to the plain-text variant for clients that reject HTML |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 TEMPLATE_NOT_FOUND`, `409 TEMPLATE_NOT_APPROVED`, `422 CHANNEL_DISABLED_BY_RECIPIENT`, `422 ATTACHMENT_NOT_SCANNED`, `503 PROVIDER_UNAVAILABLE` |
| **HTTP Status Codes** | `202`, `400`, `401`, `403`, `404`, `409`, `422`, `429`, `503`, `500` |
| **Rate Limiting** | Per-tenant SMTP relay throttle |
| **Idempotency** | `Idempotency-Key` honored (24-hour TTL) |
| **Related Database Entities** | `notification_event`, `notification_dispatch`, `notification_template_config`, `notification_preference`, `file_asset` |
| **Related Functional Module** | SRS §5 External Interface Requirements — Email |
| **Related AI Agent** | Notification Agent |
| **Audit Requirements** | `audit_log` entry for manual/test sends; standard dispatch trail otherwise |
| **Security Considerations** | HTML body is sanitized against script injection before rendering (OWASP A03); attachments must already be virus-scanned `clean` — this endpoint never bypasses the File API's scanning pipeline (`API_SPECIFICATION.md` §11) |

#### 8.3.2 Get Email Notification Status

| | |
|---|---|
| **Endpoint Name** | Get Email Notification Status |
| **Purpose** | Retrieve the current delivery/open status of a specific email dispatch |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/notifications/email/{notificationDispatchId}` |
| **Authentication Required** | Yes |
| **Authorization** | Recipient (own notification) or Officer/Admin within scope |
| **Request Parameters** | Path: `notificationDispatchId` |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Body** | None |
| **Response Body** | `{ "notificationDispatchId", "channel": "email", "status", "providerMessageId", "sentAt", "deliveredAt", "openedAt"? }` |
| **Validation Rules** | `notificationDispatchId`: must exist and be channel `email` |
| **Business Rules** | `openedAt` populated only if the tenant's SMTP provider supports open-tracking pixels (a provider capability, not guaranteed) |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOTIFICATION_NOT_FOUND` |
| **HTTP Status Codes** | `200`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `notification_dispatch` |
| **Related Functional Module** | SRS §5 External Interface Requirements — Email |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited (read-only) |
| **Security Considerations** | Response never includes email body/attachment content, only status metadata |

#### 8.3.3 Test Send Email Notification

| | |
|---|---|
| **Endpoint Name** | Test Send Email Notification |
| **Purpose** | Send a real email to a designated test address to validate a template/provider before production use |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/notifications/email/test` |
| **Authentication Required** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Parameters** | None |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Body** | `{ "templateKey": "string", "languageCode": "ta" \| "en", "testEmailAddress": "string", "variables": { "key": "value" } }` |
| **Response Body** | `{ "notificationDispatchId", "channel": "email", "status": "queued", "isTestSend": true }` |
| **Validation Rules** | `testEmailAddress`: required, valid RFC 5322 format; `templateKey`: required, may be `draft` or `pending_approval` |
| **Business Rules** | Test sends flagged `isTestSend = true`, excluded from Section 8.15 analytics |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 TEMPLATE_NOT_FOUND`, `503 PROVIDER_UNAVAILABLE` |
| **HTTP Status Codes** | `202`, `400`, `401`, `403`, `404`, `429`, `503` |
| **Rate Limiting** | Throttled (e.g. 20/hour per Admin) |
| **Idempotency** | Not required |
| **Related Database Entities** | `notification_dispatch`, `notification_template_config` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §7 Configuration Tables — Notification Template Config |
| **Related AI Agent** | None |
| **Audit Requirements** | `audit_log` entry recording Admin, template, masked test address |
| **Security Considerations** | Rendered HTML preview is sanitized identically to production sends |

---
### 8.4 WhatsApp APIs

Channel-typed convenience view over the Official WhatsApp Business Platform abstraction (SRS §5).

#### 8.4.1 Send WhatsApp Notification

| | |
|---|---|
| **Endpoint Name** | Send WhatsApp Notification |
| **Purpose** | Dispatch a WhatsApp message to a recipient using a configured, approved template |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/notifications/whatsapp` |
| **Authentication Required** | Yes |
| **Authorization** | Internal service token or Corporation Admin/Super Admin (manual/test send) |
| **Request Parameters** | None |
| **Request Headers** | `Authorization: Bearer <jwt>`; `X-Correlation-Id`; `Idempotency-Key` (recommended); `Accept-Language` |
| **Request Body** | `{ "recipientUserId": "id", "templateKey": "string", "languageCode"?: "ta" \| "en", "variables": { "key": "value" }, "priority"?: "normal" \| "high" \| "emergency" }` |
| **Response Body** | `{ "notificationDispatchId", "channel": "whatsapp", "status": "queued", "providerMessageId"?: "string" }` |
| **Validation Rules** | `recipientUserId`: required, must resolve to a user with a registered mobile number opted into WhatsApp; `templateKey`: required, must be a pre-approved WhatsApp Business template (a provider-mandated constraint reflected here as a business rule, not a provider-specific field) |
| **Business Rules** | Blocked if the recipient has disabled the WhatsApp channel unless `priority = emergency`; WhatsApp Business Platform policy requires templates used outside the 24-hour customer-service window to be independently pre-approved by the provider — this pre-approval status is tracked as part of the template's `approval_status` (Section 8.7) so the API never needs provider-specific template-category fields |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 TEMPLATE_NOT_FOUND`, `409 TEMPLATE_NOT_APPROVED`, `422 CHANNEL_DISABLED_BY_RECIPIENT`, `422 RECIPIENT_NOT_OPTED_IN`, `503 PROVIDER_UNAVAILABLE` |
| **HTTP Status Codes** | `202`, `400`, `401`, `403`, `404`, `409`, `422`, `429`, `503`, `500` |
| **Rate Limiting** | Per-tenant WhatsApp Business Platform throughput throttle |
| **Idempotency** | `Idempotency-Key` honored (24-hour TTL) |
| **Related Database Entities** | `notification_event`, `notification_dispatch`, `notification_template_config`, `notification_preference` |
| **Related Functional Module** | SRS §5 External Interface Requirements — WhatsApp |
| **Related AI Agent** | Notification Agent |
| **Audit Requirements** | `audit_log` entry for manual/test sends; standard dispatch trail otherwise |
| **Security Considerations** | Mobile number masked in logs; no WhatsApp Business Account credentials or webhook secrets are ever present in request/response bodies (`INFRASTRUCTURE_DEVOPS.md` §7 — secrets-manager reference only, via `provider_config`) |

#### 8.4.2 Get WhatsApp Notification Status

| | |
|---|---|
| **Endpoint Name** | Get WhatsApp Notification Status |
| **Purpose** | Retrieve the current delivery/read status of a specific WhatsApp dispatch |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/notifications/whatsapp/{notificationDispatchId}` |
| **Authentication Required** | Yes |
| **Authorization** | Recipient (own notification) or Officer/Admin within scope |
| **Request Parameters** | Path: `notificationDispatchId` |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Body** | None |
| **Response Body** | `{ "notificationDispatchId", "channel": "whatsapp", "status", "providerMessageId", "sentAt", "deliveredAt", "readAt"? }` |
| **Validation Rules** | `notificationDispatchId`: must exist and be channel `whatsapp` |
| **Business Rules** | `readAt` reflects the WhatsApp "blue tick" read receipt where the provider surfaces it |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOTIFICATION_NOT_FOUND` |
| **HTTP Status Codes** | `200`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `notification_dispatch` |
| **Related Functional Module** | SRS §5 External Interface Requirements — WhatsApp |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited (read-only) |
| **Security Considerations** | Response never includes message body content, only status metadata |

#### 8.4.3 Test Send WhatsApp Notification

| | |
|---|---|
| **Endpoint Name** | Test Send WhatsApp Notification |
| **Purpose** | Send a real WhatsApp message to a designated test number to validate a template/provider before production use |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/notifications/whatsapp/test` |
| **Authentication Required** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Parameters** | None |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Body** | `{ "templateKey": "string", "languageCode": "ta" \| "en", "testMobileNumber": "string", "variables": { "key": "value" } }` |
| **Response Body** | `{ "notificationDispatchId", "channel": "whatsapp", "status": "queued", "isTestSend": true }` |
| **Validation Rules** | `testMobileNumber`: required, valid Indian mobile format, must be opted-in with the provider's test/sandbox number registry where applicable |
| **Business Rules** | Test sends flagged `isTestSend = true`, excluded from Section 8.15 analytics |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 TEMPLATE_NOT_FOUND`, `503 PROVIDER_UNAVAILABLE` |
| **HTTP Status Codes** | `202`, `400`, `401`, `403`, `404`, `429`, `503` |
| **Rate Limiting** | Throttled (e.g. 10/hour per Admin) |
| **Idempotency** | Not required |
| **Related Database Entities** | `notification_dispatch`, `notification_template_config` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §7 Configuration Tables — Notification Template Config |
| **Related AI Agent** | None |
| **Audit Requirements** | `audit_log` entry recording Admin, template, masked test number |
| **Security Considerations** | Same masking/sanitization posture as Section 8.4.1 |

---

### 8.5 Push Notification APIs

Covers Mobile Push, Web Push, and Browser Notification (Section 8.1.2) as a single channel-typed view, differentiated by the `channel` value in the request body — one FCM/OneSignal-abstracted pipeline, not three.

#### 8.5.1 Send Push Notification

| | |
|---|---|
| **Endpoint Name** | Send Push Notification |
| **Purpose** | Dispatch a push notification (mobile, web, or browser) to a recipient |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/notifications/push` |
| **Authentication Required** | Yes |
| **Authorization** | Internal service token or Corporation Admin/Super Admin (manual/test send) |
| **Request Parameters** | None |
| **Request Body** | `{ "recipientUserId": "id", "channel": "push_mobile" \| "push_web" \| "push_browser", "templateKey": "string", "languageCode"?: "ta" \| "en", "variables": { "key": "value" }, "deepLinkUrl"?: "string", "priority"?: "normal" \| "high" \| "emergency" }` |
| **Request Headers** | `Authorization: Bearer <jwt>`; `X-Correlation-Id`; `Idempotency-Key` (recommended); `Accept-Language` |
| **Response Body** | `{ "notificationDispatchId", "channel", "status": "queued", "providerMessageId"?: "string" }` |
| **Validation Rules** | `recipientUserId`: required, must have at least one registered push subscription/device token for the requested `channel`; `templateKey`: required, `approved`, active for the requested push channel |
| **Business Rules** | Blocked if the recipient has disabled the requested push channel unless `priority = emergency`; if the recipient has multiple registered devices for `push_mobile`, the dispatch fans out to all of them under one `notificationDispatchId` (device fan-out is a delivery-mechanics detail, not a new API concept) |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 TEMPLATE_NOT_FOUND`, `409 TEMPLATE_NOT_APPROVED`, `422 CHANNEL_DISABLED_BY_RECIPIENT`, `422 NO_REGISTERED_DEVICE`, `503 PROVIDER_UNAVAILABLE` |
| **HTTP Status Codes** | `202`, `400`, `401`, `403`, `404`, `409`, `422`, `429`, `503`, `500` |
| **Rate Limiting** | Per-tenant FCM/OneSignal throughput throttle |
| **Idempotency** | `Idempotency-Key` honored (24-hour TTL) |
| **Related Database Entities** | `notification_event`, `notification_dispatch`, `notification_template_config`, `notification_preference` |
| **Related Functional Module** | SRS §5 External Interface Requirements — Push Notifications |
| **Related AI Agent** | Notification Agent |
| **Audit Requirements** | `audit_log` entry for manual/test sends; standard dispatch trail otherwise |
| **Security Considerations** | Device tokens are never returned in any response body; `deepLinkUrl`, if present, is validated against an allow-listed internal path pattern to prevent open-redirect abuse (OWASP A01 adjacent) |

#### 8.5.2 Get Push Notification Status

| | |
|---|---|
| **Endpoint Name** | Get Push Notification Status |
| **Purpose** | Retrieve the current delivery/click status of a specific push dispatch |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/notifications/push/{notificationDispatchId}` |
| **Authentication Required** | Yes |
| **Authorization** | Recipient (own notification) or Officer/Admin within scope |
| **Request Parameters** | Path: `notificationDispatchId` |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Body** | None |
| **Response Body** | `{ "notificationDispatchId", "channel", "status", "providerMessageId", "sentAt", "deliveredAt", "clickedAt"? }` |
| **Validation Rules** | `notificationDispatchId`: must exist and be one of the push channel values |
| **Business Rules** | `clickedAt` populated if the recipient tapped/clicked the notification and the provider surfaces that event |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOTIFICATION_NOT_FOUND` |
| **HTTP Status Codes** | `200`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `notification_dispatch` |
| **Related Functional Module** | SRS §5 External Interface Requirements — Push Notifications |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited (read-only) |
| **Security Considerations** | Response never includes push payload content beyond status metadata |

#### 8.5.3 Test Send Push Notification

| | |
|---|---|
| **Endpoint Name** | Test Send Push Notification |
| **Purpose** | Send a real push notification to a designated test device/subscription to validate a template/provider |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/notifications/push/test` |
| **Authentication Required** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Parameters** | None |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Body** | `{ "templateKey": "string", "languageCode": "ta" \| "en", "testDeviceToken": "string", "channel": "push_mobile" \| "push_web" \| "push_browser", "variables": { "key": "value" } }` |
| **Response Body** | `{ "notificationDispatchId", "channel", "status": "queued", "isTestSend": true }` |
| **Validation Rules** | `testDeviceToken`: required, must be a registered test device/subscription token |
| **Business Rules** | Test sends flagged `isTestSend = true`, excluded from Section 8.15 analytics |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 TEMPLATE_NOT_FOUND`, `503 PROVIDER_UNAVAILABLE` |
| **HTTP Status Codes** | `202`, `400`, `401`, `403`, `404`, `429`, `503` |
| **Rate Limiting** | Throttled (e.g. 20/hour per Admin) |
| **Idempotency** | Not required |
| **Related Database Entities** | `notification_dispatch`, `notification_template_config` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §7 Configuration Tables — Notification Template Config |
| **Related AI Agent** | None |
| **Audit Requirements** | `audit_log` entry recording Admin, template, test device identifier (hashed/truncated) |
| **Security Considerations** | Test device tokens are stored only for the duration of validation, not persisted long-term |

---

### 8.6 In-App Notification APIs

The one channel with no external provider (Section 8.1.2) — written directly to `notification_dispatch` and surfaced as the portal's own notification inbox. Operations here favor inbox semantics (list/read/unread-count) over the send/status/test pattern of 8.2–8.5, since In-App notifications are created as a side effect of the same domain events that drive every other channel, not independently composed per recipient.

#### 8.6.1 List In-App Notifications

| | |
|---|---|
| **Endpoint Name** | List In-App Notifications |
| **Purpose** | Retrieve the authenticated user's notification inbox |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/notifications/in-app` |
| **Authentication Required** | Yes |
| **Authorization** | Any authenticated role — scoped to `req.user.id` |
| **Request Parameters** | `?status=unread\|read\|all` (default `all`), `?sort=-createdAt` (default), `?cursor=`, `?limit=` |
| **Request Headers** | `Authorization: Bearer <jwt>`; `Accept-Language` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "notificationDispatchId", "templateKey", "renderedTitle", "renderedBody", "status", "createdAt", "readAt"? } ], "meta": { "pagination": { "nextCursor", "hasMore" } } }` |
| **Validation Rules** | `limit`: max 100, default 20 |
| **Business Rules** | Only the authenticated user's own dispatches are ever returned — no `userId` override, even for Admin roles (In-App inbox is always self-scoped; Admin visibility into another user's notifications is via 8.10 Notification History, not this inbox endpoint) |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED` |
| **HTTP Status Codes** | `200`, `400`, `401` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `notification_dispatch` |
| **Related Functional Module** | SRS §3.2 Citizen Module — Notifications; §3.3 Officer Module |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited (read-only, self-scoped) |
| **Security Considerations** | Self-scoping is enforced server-side from the JWT, never from a client-supplied parameter (OWASP A01) |

#### 8.6.2 Get In-App Notification

| | |
|---|---|
| **Endpoint Name** | Get In-App Notification |
| **Purpose** | Retrieve a single in-app notification's full detail |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/notifications/in-app/{notificationDispatchId}` |
| **Authentication Required** | Yes |
| **Authorization** | Owning user only |
| **Request Parameters** | Path: `notificationDispatchId` |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Body** | None |
| **Response Body** | `{ "notificationDispatchId", "templateKey", "renderedTitle", "renderedBody", "status", "createdAt", "readAt"?, "linkedEntityType"?, "linkedEntityId"? }` |
| **Validation Rules** | `notificationDispatchId`: must exist, be channel `in_app`, and belong to the caller |
| **Business Rules** | None beyond ownership check |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOTIFICATION_NOT_FOUND` |
| **HTTP Status Codes** | `200`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `notification_dispatch` |
| **Related Functional Module** | SRS §3.2 Citizen Module — Notifications |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | Ownership check performed server-side against the JWT |

#### 8.6.3 Mark In-App Notification as Read

| | |
|---|---|
| **Endpoint Name** | Mark In-App Notification as Read |
| **Purpose** | Record that the authenticated user has read a specific in-app notification |
| **HTTP Method** | `PATCH` |
| **URL** | `/api/v1/notifications/in-app/{notificationDispatchId}/read` |
| **Authentication Required** | Yes |
| **Authorization** | Owning user only |
| **Request Parameters** | Path: `notificationDispatchId` |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Body** | None |
| **Response Body** | `{ "notificationDispatchId", "status": "read", "readAt" }` |
| **Validation Rules** | `notificationDispatchId`: must exist, be channel `in_app`, and belong to the caller |
| **Business Rules** | Idempotent by nature — marking an already-read notification as read again returns the existing `readAt` unchanged rather than erroring |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOTIFICATION_NOT_FOUND` |
| **HTTP Status Codes** | `200`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user write-endpoint throttle |
| **Idempotency** | Naturally idempotent (`PATCH` semantics, `API_SPECIFICATION.md` §1.4); no `Idempotency-Key` required |
| **Related Database Entities** | `notification_dispatch` |
| **Related Functional Module** | SRS §3.2 Citizen Module — Notifications |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited (routine, low-sensitivity user action) |
| **Security Considerations** | Ownership check performed server-side |

#### 8.6.4 Mark All In-App Notifications as Read

| | |
|---|---|
| **Endpoint Name** | Mark All In-App Notifications as Read |
| **Purpose** | Bulk-mark every unread in-app notification for the authenticated user as read |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/notifications/in-app/read-all` |
| **Authentication Required** | Yes |
| **Authorization** | Any authenticated role — self-scoped |
| **Request Parameters** | None |
| **Request Headers** | `Authorization: Bearer <jwt>`; `Idempotency-Key` (optional) |
| **Request Body** | None |
| **Response Body** | `{ "markedCount": "integer", "readAt" }` |
| **Validation Rules** | None |
| **Business Rules** | Only affects the caller's own unread notifications; a repeated call with zero remaining unread items returns `markedCount: 0`, not an error |
| **Error Responses** | `401 UNAUTHORIZED` |
| **HTTP Status Codes** | `200`, `401` |
| **Rate Limiting** | Standard per-user write-endpoint throttle |
| **Idempotency** | Naturally idempotent — repeated calls are harmless |
| **Related Database Entities** | `notification_dispatch` |
| **Related Functional Module** | SRS §3.2 Citizen Module — Notifications |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | Self-scoping enforced server-side |

#### 8.6.5 Get Unread Notification Count

| | |
|---|---|
| **Endpoint Name** | Get Unread Notification Count |
| **Purpose** | Retrieve the authenticated user's unread in-app notification count, for a portal notification-bell badge |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/notifications/in-app/unread-count` |
| **Authentication Required** | Yes |
| **Authorization** | Any authenticated role — self-scoped |
| **Request Parameters** | None |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Body** | None |
| **Response Body** | `{ "unreadCount": "integer" }` |
| **Validation Rules** | None |
| **Business Rules** | None |
| **Error Responses** | `401 UNAUTHORIZED` |
| **HTTP Status Codes** | `200`, `401` |
| **Rate Limiting** | Standard per-user read-endpoint throttle; expected to be polled frequently by portal clients, so this endpoint is deliberately lightweight (a `COUNT`, not a list fetch) |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `notification_dispatch` |
| **Related Functional Module** | SRS §3.2 Citizen Module — Notifications |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | Self-scoping enforced server-side |

---
### 8.7 Notification Template APIs

Manages `notification_template_config` (`DATABASE_DESIGN.md` §7) — versioned per-tenant, per-channel, per-language message templates. Covers every feature listed in Section 8.1.4: multi-language, parameterized templates, rich text/HTML, attachments, versioning, approval workflow, preview, and test send (test send itself is documented per-channel in 8.2.3/8.3.3/8.4.3/8.5.3; this subsection covers the template lifecycle and the generic 8.7.8 test-send convenience wrapper).

#### 8.7.1 List Notification Templates

| | |
|---|---|
| **Endpoint Name** | List Notification Templates |
| **Purpose** | Retrieve the tenant's configured message templates |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/notification-templates` |
| **Authentication Required** | Yes |
| **Authorization** | Department Admin / Corporation Admin |
| **Request Parameters** | `?eventType=`, `?channel=`, `?languageCode=`, `?approvalStatus=draft\|pending_approval\|approved\|rejected`, `?page=`, `?size=` |
| **Request Headers** | `Authorization: Bearer <jwt>`; `Accept-Language` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "id", "eventType", "channel", "languageCode", "version", "approvalStatus", "isActive" } ], "meta": { "pagination": { "page", "size", "totalCount", "totalPages" } } }` |
| **Validation Rules** | `size`: max 100 |
| **Business Rules** | None (read-only) |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `notification_template_config` |
| **Related Functional Module** | SRS §3.4 Admin Module — Notification Templates |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited (read-only) |
| **Security Considerations** | None beyond standard RBAC |

#### 8.7.2 Create Notification Template

| | |
|---|---|
| **Endpoint Name** | Create Notification Template |
| **Purpose** | Define a new versioned message template for an event/channel/language combination |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/notification-templates` |
| **Authentication Required** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Parameters** | None |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Body** | `{ "eventType": "string", "channel": "sms" \| "email" \| "whatsapp" \| "push_mobile" \| "push_web" \| "push_browser" \| "in_app", "languageCode": "ta" \| "en", "bodyTemplate": "string", "htmlBodyTemplate"?: "string (email only)", "subjectTemplate"?: "string (email only)" }` |
| **Response Body** | `{ "id", "eventType", "channel", "languageCode", "version": 1, "approvalStatus": "draft", "createdAt" }` |
| **Validation Rules** | `bodyTemplate`: required; placeholder variables validated against the event type's known variable set; `htmlBodyTemplate`/`subjectTemplate`: only accepted when `channel = email`; channel length ceilings enforced (e.g. SMS ≤160 chars/segment, a UX warning not a hard block) |
| **Business Rules** | A newly created template starts `approvalStatus = draft` and cannot be used for a production send (Sections 8.2.1/8.3.1/8.4.1/8.5.1) until it passes through 8.7.9/8.7.10 |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `201`, `400`, `401`, `403` |
| **Rate Limiting** | Standard per-user write-endpoint throttle |
| **Idempotency** | `Idempotency-Key` accepted (optional) — protects against duplicate template creation on a retried submit |
| **Related Database Entities** | `notification_template_config` |
| **Related Functional Module** | SRS §3.4 Admin Module — Notification Templates |
| **Related AI Agent** | None |
| **Audit Requirements** | `audit_log` entry recording the creating Admin and initial template content |
| **Security Considerations** | `bodyTemplate`/`htmlBodyTemplate` are sanitized on input to strip executable script content before storage (defense-in-depth, in addition to sanitization at render time in Section 8.3.1) |

#### 8.7.3 Get Notification Template

| | |
|---|---|
| **Endpoint Name** | Get Notification Template |
| **Purpose** | Retrieve a single template's current version detail |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/notification-templates/{templateId}` |
| **Authentication Required** | Yes |
| **Authorization** | Department Admin / Corporation Admin |
| **Request Parameters** | Path: `templateId` |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Body** | None |
| **Response Body** | `{ "id", "eventType", "channel", "languageCode", "bodyTemplate", "htmlBodyTemplate"?, "subjectTemplate"?, "version", "approvalStatus", "isActive", "createdAt", "updatedAt" }` |
| **Validation Rules** | None (read-only) |
| **Business Rules** | None |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 TEMPLATE_NOT_FOUND` |
| **HTTP Status Codes** | `200`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `notification_template_config` |
| **Related Functional Module** | SRS §3.4 Admin Module — Notification Templates |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | None beyond standard RBAC |

#### 8.7.4 Update Notification Template (New Version)

| | |
|---|---|
| **Endpoint Name** | Update Notification Template |
| **Purpose** | Change a template's body/subject content — creates a new version rather than overwriting, and resets approval status to `draft` |
| **HTTP Method** | `PATCH` |
| **URL** | `/api/v1/notification-templates/{templateId}` |
| **Authentication Required** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Parameters** | Path: `templateId` |
| **Request Headers** | `Authorization: Bearer <jwt>`; `If-Match: "<current version>"` (optimistic concurrency) |
| **Request Body** | `{ "bodyTemplate"?: "string", "htmlBodyTemplate"?: "string", "subjectTemplate"?: "string", "expectedVersion": "integer" }` |
| **Response Body** | `{ "id", "eventType", "channel", "languageCode", "version": "int (incremented)", "approvalStatus": "draft", "updatedAt" }` |
| **Validation Rules** | `expectedVersion`: required, must match the template's current `version` — a mismatch indicates a concurrent edit by another Admin session |
| **Business Rules** | **Optimistic concurrency**: if `expectedVersion` does not match the current stored version, the update is rejected rather than silently overwriting a concurrent change; a fresh `PATCH` re-supplying the now-current version is required (`API_SPECIFICATION.md` §15's backward-compatibility discipline extended here to concurrent-edit safety); any content change re-enters the approval workflow at `draft`, even if the prior version was `approved` |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 TEMPLATE_NOT_FOUND`, `409 CONCURRENT_MODIFICATION` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403`, `404`, `409` |
| **Rate Limiting** | Standard per-user write-endpoint throttle |
| **Idempotency** | Not applicable in the retry sense (`PATCH` is idempotent by HTTP semantics, but the optimistic-concurrency check makes a stale retry fail fast rather than double-apply) |
| **Related Database Entities** | `notification_template_config`, `config_change_history` |
| **Related Functional Module** | SRS §3.4 Admin Module — Notification Templates; `DATABASE_DESIGN.md` §22 Versioning Strategy |
| **Related AI Agent** | None |
| **Audit Requirements** | `audit_log`/`config_change_history` entry recording previous version, new version, and the editing Admin |
| **Security Considerations** | Same input-sanitization posture as Section 8.7.2 |

#### 8.7.5 Delete Notification Template (Deactivate)

| | |
|---|---|
| **Endpoint Name** | Delete Notification Template |
| **Purpose** | Soft-delete (deactivate) a template |
| **HTTP Method** | `DELETE` |
| **URL** | `/api/v1/notification-templates/{templateId}` |
| **Authentication Required** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Parameters** | Path: `templateId` |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Body** | None |
| **Response Body** | `204 No Content` |
| **Validation Rules** | None beyond existence check |
| **Business Rules** | Deactivating a template in active use by a not-yet-fully-dispatched Broadcast/Bulk job (Sections 8.13/8.14) does not cancel that job — already-queued dispatches complete using the version pinned at queue time |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 TEMPLATE_NOT_FOUND` |
| **HTTP Status Codes** | `204`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user write-endpoint throttle |
| **Idempotency** | Naturally idempotent (`DELETE` semantics) |
| **Related Database Entities** | `notification_template_config`, `audit_log` |
| **Related Functional Module** | SRS §3.4 Admin Module — Notification Templates |
| **Related AI Agent** | None |
| **Audit Requirements** | `audit_log` entry recording deactivation and the acting Admin |
| **Security Considerations** | None beyond standard RBAC |

#### 8.7.6 List Notification Template Versions

| | |
|---|---|
| **Endpoint Name** | List Notification Template Versions |
| **Purpose** | Retrieve the full version history of a template — "show every past version of this message" |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/notification-templates/{templateId}/versions` |
| **Authentication Required** | Yes |
| **Authorization** | Department Admin / Corporation Admin |
| **Request Parameters** | Path: `templateId`; `?page=`, `?size=` |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "version", "approvalStatus", "changedBy": { "id", "name" }, "effectiveFrom", "effectiveTo"? } ], "meta": { "pagination" } }` |
| **Validation Rules** | None (read-only) |
| **Business Rules** | None |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 TEMPLATE_NOT_FOUND` |
| **HTTP Status Codes** | `200`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `notification_template_config`, `config_change_history` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §22 Versioning Strategy |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited (read-only) |
| **Security Considerations** | None beyond standard RBAC |

#### 8.7.7 Preview Notification Template

| | |
|---|---|
| **Endpoint Name** | Preview Notification Template |
| **Purpose** | Render a template against sample variables without dispatching anything, for Admin Portal WYSIWYG preview |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/notification-templates/{templateId}/preview` |
| **Authentication Required** | Yes |
| **Authorization** | Department Admin / Corporation Admin |
| **Request Parameters** | Path: `templateId` |
| **Request Headers** | `Authorization: Bearer <jwt>`; `Accept-Language` |
| **Request Body** | `{ "sampleVariables": { "key": "value" } }` |
| **Response Body** | `{ "renderedSubject"?, "renderedBody", "renderedHtmlBody"? }` |
| **Validation Rules** | `sampleVariables`: must satisfy the template's declared placeholder set, or missing placeholders render as a visibly flagged `[[missing:variableName]]` token rather than failing, so an Admin can spot an incomplete sample payload |
| **Business Rules** | No `notification_event`/`notification_dispatch` row is created — this is a pure render, not a queued action |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 TEMPLATE_NOT_FOUND` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user write-endpoint throttle |
| **Idempotency** | Naturally idempotent — a pure, side-effect-free render |
| **Related Database Entities** | `notification_template_config` |
| **Related Functional Module** | SRS §3.4 Admin Module — Notification Templates |
| **Related AI Agent** | None |
| **Audit Requirements** | Not audited (no state change, no dispatch) |
| **Security Considerations** | Rendered output is sanitized identically to a production render, so a preview cannot be used to smuggle unsanitized script content into an Admin's browser |

#### 8.7.8 Test Send Notification Template

| | |
|---|---|
| **Endpoint Name** | Test Send Notification Template |
| **Purpose** | Generic, channel-agnostic test-send entry point that dispatches a real message using this specific template — a convenience wrapper equivalent to calling the channel-specific test-send endpoint (Sections 8.2.3/8.3.3/8.4.3/8.5.3) for this template's own channel |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/notification-templates/{templateId}/test-send` |
| **Authentication Required** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Parameters** | Path: `templateId` |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Body** | `{ "testRecipient": "string (mobile number, email address, or device token, matching the template's channel)", "variables": { "key": "value" } }` |
| **Response Body** | `{ "notificationDispatchId", "channel", "status": "queued", "isTestSend": true }` |
| **Validation Rules** | `testRecipient`: required, format validated against the template's own `channel` |
| **Business Rules** | Delegates internally to the same pipeline as the channel-specific test-send endpoints — this endpoint exists purely so an Admin Portal template-editing screen can trigger a test send without knowing which channel-specific URL to call |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 TEMPLATE_NOT_FOUND`, `503 PROVIDER_UNAVAILABLE` |
| **HTTP Status Codes** | `202`, `400`, `401`, `403`, `404`, `429`, `503` |
| **Rate Limiting** | Same per-channel throttle as the underlying channel-specific test-send endpoint |
| **Idempotency** | Not required — a test send is intentionally repeatable |
| **Related Database Entities** | `notification_dispatch`, `notification_template_config` |
| **Related Functional Module** | SRS §3.4 Admin Module — Notification Templates |
| **Related AI Agent** | None |
| **Audit Requirements** | `audit_log` entry recording Admin, template, masked test recipient |
| **Security Considerations** | Identical sanitization/masking posture as the underlying channel-specific test-send endpoint |

#### 8.7.9 Submit Notification Template for Approval

| | |
|---|---|
| **Endpoint Name** | Submit Notification Template for Approval |
| **Purpose** | Move a `draft` template into `pending_approval`, making it visible to an approving Admin |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/notification-templates/{templateId}/submit-for-approval` |
| **Authentication Required** | Yes |
| **Authorization** | Department Admin / Corporation Admin (the template's author or delegate) |
| **Request Parameters** | Path: `templateId` |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Body** | `{ "submissionNote"?: "string" }` |
| **Response Body** | `{ "id", "approvalStatus": "pending_approval", "submittedAt" }` |
| **Validation Rules** | Template must currently be `draft` or `rejected` |
| **Business Rules** | A template already `pending_approval` or `approved` cannot be resubmitted without first being edited (Section 8.7.4), which itself resets it to `draft` |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 TEMPLATE_NOT_FOUND`, `409 INVALID_APPROVAL_STATE_TRANSITION` |
| **HTTP Status Codes** | `200`, `401`, `403`, `404`, `409` |
| **Rate Limiting** | Standard per-user write-endpoint throttle |
| **Idempotency** | Naturally idempotent — resubmitting an already-`pending_approval` template is a no-op success, not a duplicate submission |
| **Related Database Entities** | `notification_template_config` |
| **Related Functional Module** | SRS §3.4 Admin Module — Notification Templates |
| **Related AI Agent** | None |
| **Audit Requirements** | `audit_log` entry recording the submission |
| **Security Considerations** | None beyond standard RBAC |

#### 8.7.10 Record Notification Template Approval Decision

| | |
|---|---|
| **Endpoint Name** | Record Notification Template Approval Decision |
| **Purpose** | Approve or reject a `pending_approval` template, completing the Approval Workflow feature (Section 8.1.4) |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/notification-templates/{templateId}/approval-decision` |
| **Authentication Required** | Yes |
| **Authorization** | Corporation Admin / Super Admin — must be a different individual from the template's submitter where the tenant enforces segregation of duties (a configurable policy, not hardcoded) |
| **Request Parameters** | Path: `templateId` |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Body** | `{ "decision": "approved" \| "rejected", "reviewNote"?: "string" }` |
| **Response Body** | `{ "id", "approvalStatus": "approved" \| "rejected", "decidedBy": { "id", "name" }, "decidedAt" }` |
| **Validation Rules** | Template must currently be `pending_approval`; `decision`: required, one of the two values |
| **Business Rules** | Only an `approved` template may be used by the production send endpoints (Sections 8.2.1/8.3.1/8.4.1/8.5.1); a `rejected` template returns to author control and must be edited (re-entering `draft`) before resubmission |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 TEMPLATE_NOT_FOUND`, `409 TEMPLATE_NOT_PENDING_APPROVAL` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403`, `404`, `409` |
| **Rate Limiting** | Standard per-user write-endpoint throttle |
| **Idempotency** | Not naturally idempotent (a second call after the state has moved on returns `409`) — `Idempotency-Key` accepted for safe retry of a genuinely duplicate request |
| **Related Database Entities** | `notification_template_config`, `config_change_history` |
| **Related Functional Module** | SRS §3.4 Admin Module — Notification Templates |
| **Related AI Agent** | None |
| **Audit Requirements** | `audit_log`/`config_change_history` entry recording the decision, reviewer identity, and note — this is a compliance-relevant action for a government platform (evidence of who approved citizen-facing message content) |
| **Security Considerations** | Segregation-of-duties check (submitter ≠ approver) enforced server-side where the tenant's policy requires it |

---
### 8.8 Notification Preference APIs

Generalizes the citizen-only notification-preference shortcut already approved in `API_SPECIFICATION.md` §3.5 (`PUT /citizens/me/notification-preference`, unchanged and still valid) to every user type, and adds Quiet Hours, Category Preference, and Emergency Override (Section 8.1.6) — none of which existed in the Section 3 shortcut. Section 3.5 remains the citizen-specific path; this subsection is the cross-role superset used by Officer/Department preference management and by Admin support tooling.

#### 8.8.1 Get My Notification Preferences

| | |
|---|---|
| **Endpoint Name** | Get My Notification Preferences |
| **Purpose** | Retrieve the authenticated user's full notification preference profile (channels, quiet hours, language, category opt-outs) |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/notification-preferences/me` |
| **Authentication Required** | Yes |
| **Authorization** | Any authenticated role — self-scoped |
| **Request Parameters** | None |
| **Request Headers** | `Authorization: Bearer <jwt>`; `Accept-Language` |
| **Request Body** | None |
| **Response Body** | `{ "channels": [ { "channel", "isEnabled" } ], "quietHours": { "startTime", "endTime", "timezone" }, "languageCode", "categoryOptOuts": ["eventType"], "version" }` |
| **Validation Rules** | None (read-only) |
| **Business Rules** | None |
| **Error Responses** | `401 UNAUTHORIZED` |
| **HTTP Status Codes** | `200`, `401` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `notification_preference` |
| **Related Functional Module** | SRS §3.2 Citizen Module — Notifications; §3.3 Officer Module |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited (read-only, self-scoped) |
| **Security Considerations** | Self-scoping enforced server-side from the JWT |

#### 8.8.2 Update My Notification Preferences

| | |
|---|---|
| **Endpoint Name** | Update My Notification Preferences |
| **Purpose** | Partially update the authenticated user's channels, quiet hours, language, or category opt-outs |
| **HTTP Method** | `PATCH` |
| **URL** | `/api/v1/notification-preferences/me` |
| **Authentication Required** | Yes |
| **Authorization** | Any authenticated role — self-scoped |
| **Request Parameters** | None |
| **Request Headers** | `Authorization: Bearer <jwt>`; `If-Match: "<current version>"` (optimistic concurrency, e.g. two open browser tabs editing preferences) |
| **Request Body** | `{ "channels"?: [ { "channel", "isEnabled" } ], "quietHours"?: { "startTime", "endTime", "timezone" }, "languageCode"?: "ta" \| "en", "categoryOptOuts"?: ["eventType"], "expectedVersion": "integer" }` |
| **Response Body** | Updated preference object (Section 8.8.1 shape), `version` incremented |
| **Validation Rules** | `expectedVersion`: required, must match the stored version; at least one channel must remain enabled for SLA-breach/status-change notifications critical to complaint resolution (mirrors the rule already fixed in `API_SPECIFICATION.md` §3.5); `quietHours`, if present: `startTime`/`endTime` valid `HH:mm`, `timezone` a valid IANA zone |
| **Business Rules** | **Optimistic concurrency**: a version mismatch is rejected (`409`) rather than silently overwritten, since two sessions (e.g. mobile app and web portal) may edit preferences concurrently; category opt-outs never suppress an Emergency Override notification (Section 8.8.4) |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `409 CONCURRENT_MODIFICATION`, `422 ALL_CHANNELS_DISABLED` |
| **HTTP Status Codes** | `200`, `400`, `401`, `409`, `422` |
| **Rate Limiting** | Standard per-user write-endpoint throttle |
| **Idempotency** | `PATCH` is idempotent by HTTP semantics; the optimistic-concurrency check additionally guards against lost updates |
| **Related Database Entities** | `notification_preference` |
| **Related Functional Module** | SRS §3.2 Citizen Module — Notifications; §3.3 Officer Module |
| **Related AI Agent** | None |
| **Audit Requirements** | `audit_log` entry when an Admin edits another user's preferences (Section 8.8.3 path); not audited for a user's own edit of their own preferences (routine, low-sensitivity) |
| **Security Considerations** | Self-scoping enforced server-side |

#### 8.8.3 Get User Notification Preferences (Admin View)

| | |
|---|---|
| **Endpoint Name** | Get User Notification Preferences (Admin View) |
| **Purpose** | Allow an Admin to view another user's notification preference profile, for support/troubleshooting ("why isn't this citizen receiving SMS updates") |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/notification-preferences/{userId}` |
| **Authentication Required** | Yes |
| **Authorization** | Department Admin (own department's users) / Corporation Admin / Super Admin |
| **Request Parameters** | Path: `userId` |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Body** | None |
| **Response Body** | Preference object (Section 8.8.1 shape) for the target user |
| **Validation Rules** | `userId`: must resolve to a user within the Admin's scope |
| **Business Rules** | Read-only — this endpoint does not permit an Admin to modify another user's preferences directly (the only Admin-initiated write against another user's preferences is the scoped Emergency Override in 8.8.4, which does not alter stored preferences, only bypasses them for one dispatch) |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 USER_NOT_FOUND` |
| **HTTP Status Codes** | `200`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `notification_preference`, `user` |
| **Related Functional Module** | SRS §3.4 Admin Module |
| **Related AI Agent** | None |
| **Audit Requirements** | `audit_log` entry recording which Admin viewed which user's preferences (a citizen-PII-adjacent access, logged per `ARCHITECTURE.md` §11.5) |
| **Security Considerations** | Scope check enforced server-side; response never includes the target user's raw contact details, only channel/preference metadata |

#### 8.8.4 Set Emergency Override

| | |
|---|---|
| **Endpoint Name** | Set Emergency Override |
| **Purpose** | Force-deliver a specific notification to a recipient (or a scope of recipients, via 8.13 Broadcast) bypassing their channel/category/quiet-hours preferences — reserved for SLA-critical or public-safety alerts |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/notification-preferences/{userId}/emergency-override` |
| **Authentication Required** | Yes |
| **Authorization** | Corporation Admin / Super Admin only |
| **Request Parameters** | Path: `userId` |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Body** | `{ "templateKey": "string", "channel": "sms" \| "email" \| "whatsapp" \| "push_mobile" \| "push_web" \| "push_browser", "variables": { "key": "value" }, "justification": "string" }` |
| **Response Body** | `{ "notificationDispatchId", "channel", "status": "queued", "overrideApplied": true }` |
| **Validation Rules** | `justification`: required, minimum 10 characters — an override is never a silent action; `templateKey`: required, `approved` |
| **Business Rules** | Does **not** modify the recipient's stored `notification_preference` row — this is a one-time bypass for this specific dispatch, not a permanent preference change; dispatched at the highest priority queue tier (Section 8.1.5) |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 USER_NOT_FOUND`, `404 TEMPLATE_NOT_FOUND` |
| **HTTP Status Codes** | `202`, `400`, `401`, `403`, `404` |
| **Rate Limiting** | Tightly throttled and monitored (an override is an exceptional, not routine, action) |
| **Idempotency** | `Idempotency-Key` recommended |
| **Related Database Entities** | `notification_dispatch`, `notification_preference`, `notification_template_config` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §11 Notification Tables |
| **Related AI Agent** | Notification Agent |
| **Audit Requirements** | Mandatory `audit_log` entry recording the acting Admin, recipient, template, and `justification` — this is the single most audit-sensitive endpoint in Section 8, since it deliberately overrides a citizen's stated preference |
| **Security Considerations** | Restricted to the two highest Admin tiers; every use is expected to be reviewable in a compliance audit (SRS §9 Compliance Requirements) |

---

### 8.9 Notification Queue APIs

Surfaces the Redis-backed asynchronous delivery queue (`ARCHITECTURE.md` §16, §18) through `notification_dispatch` as the durable status mirror — the queue itself is operational, ephemeral, AOF-persisted Redis state, not a MySQL system-of-record table, consistent with the same pattern already fixed for refresh tokens and OTP (`DATABASE_DESIGN.md` §13 note).

#### 8.9.1 List Queued Notifications

| | |
|---|---|
| **Endpoint Name** | List Queued Notifications |
| **Purpose** | Retrieve notifications currently in the `Queued`/`Accepted` state, for Admin operational visibility |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/notifications/queue` |
| **Authentication Required** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Parameters** | `?channel=`, `?priority=normal\|high\|emergency`, `?sort=-createdAt`, `?cursor=`, `?limit=` |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "notificationDispatchId", "channel", "priority", "status", "queuedAt", "scheduledAt"? } ], "meta": { "pagination": { "nextCursor", "hasMore" } } }` |
| **Validation Rules** | `limit`: max 200 |
| **Business Rules** | Reflects the durable MySQL mirror of queue state; a small, expected lag exists between the live Redis queue and this read view |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `notification_dispatch` (durable mirror); Redis queue (`ARCHITECTURE.md` §16) is the live operational store, not a database entity |
| **Related Functional Module** | `ARCHITECTURE.md` §16 Redis Architecture — Queues |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited (read-only operational visibility) |
| **Security Considerations** | Response never includes rendered message body content |

#### 8.9.2 Get Queue Item Detail

| | |
|---|---|
| **Endpoint Name** | Get Queue Item Detail |
| **Purpose** | Retrieve the detail of a single queued notification |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/notifications/queue/{notificationDispatchId}` |
| **Authentication Required** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Parameters** | Path: `notificationDispatchId` |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Body** | None |
| **Response Body** | `{ "notificationDispatchId", "channel", "priority", "status", "queuedAt", "scheduledAt"?, "retryCount" }` |
| **Validation Rules** | `notificationDispatchId`: must exist and currently be in a queue-eligible status |
| **Business Rules** | None beyond scope check |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOTIFICATION_NOT_FOUND` |
| **HTTP Status Codes** | `200`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `notification_dispatch` |
| **Related Functional Module** | `ARCHITECTURE.md` §16 Redis Architecture — Queues |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | None beyond standard RBAC |

#### 8.9.3 Schedule Notification

| | |
|---|---|
| **Endpoint Name** | Schedule Notification |
| **Purpose** | Queue a notification for delivery at a future time or after a relative delay (Scheduled Notifications / Delayed Delivery, Section 8.1.5) |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/notifications/schedule` |
| **Authentication Required** | Yes |
| **Authorization** | Internal service token or Corporation Admin/Super Admin |
| **Request Parameters** | None |
| **Request Headers** | `Authorization: Bearer <jwt>`; `Idempotency-Key` (recommended) |
| **Request Body** | `{ "recipientUserId": "id", "channel": "string", "templateKey": "string", "variables": { "key": "value" }, "scheduledAt"?: "ISO-8601", "delaySeconds"?: "integer" }` — exactly one of `scheduledAt`/`delaySeconds` |
| **Response Body** | `{ "notificationDispatchId", "channel", "status": "queued", "scheduledAt" }` |
| **Validation Rules** | Exactly one of `scheduledAt`/`delaySeconds` required; `scheduledAt`: must be in the future; `delaySeconds`: positive integer, capped at a system maximum (e.g. 30 days) to bound Scheduler workload |
| **Business Rules** | The Scheduler (`ARCHITECTURE.md` §17) releases the item into the active delivery queue at `scheduledAt`; a template that becomes deactivated between scheduling and release causes the release attempt to fail with `TEMPLATE_NOT_FOUND`, moving the item to `Failed` rather than silently dropping it |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 TEMPLATE_NOT_FOUND` |
| **HTTP Status Codes** | `202`, `400`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-tenant dispatch throttle |
| **Idempotency** | `Idempotency-Key` honored (24-hour TTL) |
| **Related Database Entities** | `notification_event`, `notification_dispatch`, `notification_template_config` |
| **Related Functional Module** | `ARCHITECTURE.md` §17 Scheduler Architecture |
| **Related AI Agent** | Notification Agent |
| **Audit Requirements** | Standard dispatch trail; `audit_log` entry if Admin-initiated |
| **Security Considerations** | Same masking/sanitization posture as the underlying channel send endpoint |

#### 8.9.4 Cancel Queued Notification

| | |
|---|---|
| **Endpoint Name** | Cancel Queued Notification |
| **Purpose** | Cancel a notification that has not yet been sent |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/notifications/queue/{notificationDispatchId}/cancel` |
| **Authentication Required** | Yes |
| **Authorization** | Internal service token or Corporation Admin/Super Admin |
| **Request Parameters** | Path: `notificationDispatchId` |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Body** | `{ "reason"?: "string" }` |
| **Response Body** | `{ "notificationDispatchId", "status": "cancelled", "cancelledAt" }` |
| **Validation Rules** | Notification must currently be `Queued`, `Accepted`, or scheduled-but-not-yet-released; a notification already `Sent` cannot be cancelled (`409`) |
| **Business Rules** | Cancellation is a terminal state transition — a cancelled notification cannot later be un-cancelled; a new dispatch must be created instead |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOTIFICATION_NOT_FOUND`, `409 NOTIFICATION_ALREADY_SENT` |
| **HTTP Status Codes** | `200`, `401`, `403`, `404`, `409` |
| **Rate Limiting** | Standard per-user write-endpoint throttle |
| **Idempotency** | Naturally idempotent — cancelling an already-cancelled item returns the existing `cancelledAt` rather than erroring |
| **Related Database Entities** | `notification_dispatch` |
| **Related Functional Module** | `ARCHITECTURE.md` §16 Redis Architecture — Queues |
| **Related AI Agent** | None |
| **Audit Requirements** | `audit_log` entry recording the cancellation and acting user/service |
| **Security Considerations** | None beyond standard RBAC |

#### 8.9.5 List Dead Letter Queue Items

| | |
|---|---|
| **Endpoint Name** | List Dead Letter Queue Items |
| **Purpose** | Retrieve notifications that exhausted their retry budget and moved to the Dead Letter Queue (Section 8.1.5), for operational triage |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/notifications/queue/dead-letter` |
| **Authentication Required** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Parameters** | `?channel=`, `?sort=-lastAttemptAt`, `?cursor=`, `?limit=` |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "notificationDispatchId", "channel", "retryCount", "lastFailureReason", "lastAttemptAt" } ], "meta": { "pagination" } }` |
| **Validation Rules** | `limit`: max 200 |
| **Business Rules** | None (read-only) |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `notification_dispatch` |
| **Related Functional Module** | `ARCHITECTURE.md` §16 Redis Architecture — Queues |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited (read-only) |
| **Security Considerations** | Response never includes message body content |

---

### 8.10 Notification History APIs

Delivery status tracking across the full lifecycle (Section 8.1.7). Supersedes and extends the light `GET /notifications/history` sketch from the original `API_SPECIFICATION.md` §8 draft, which this dedicated Section 8 document now fully supersedes per this conversation's scope.

#### 8.10.1 List Notification History

| | |
|---|---|
| **Endpoint Name** | List Notification History |
| **Purpose** | View delivery history/status for notifications sent to a user or related to a complaint |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/notifications/history` |
| **Authentication Required** | Yes |
| **Authorization** | Citizen (own notifications only) / Officer/Admin (tenant-wide with filters, scoped per role) |
| **Request Parameters** | `?recipientUserId=` (Admin only), `?complaintId=`, `?channel=`, `?status=`, `?filter[sentAt][gte]=`, `?filter[sentAt][lte]=`, `?sort=-sentAt` (default), `?cursor=`, `?limit=` |
| **Request Headers** | `Authorization: Bearer <jwt>`; `Accept-Language` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "id", "channel", "templateKey", "status", "providerMessageId", "sentAt", "deliveredAt" } ], "meta": { "pagination": { "nextCursor", "hasMore" } } }` |
| **Validation Rules** | Citizen callers are always scoped to their own `userId` server-side, regardless of any `recipientUserId` supplied; `limit`: max 100 |
| **Business Rules** | None beyond scope enforcement |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `notification_dispatch`, `notification_event` |
| **Related Functional Module** | SRS §3.2 Citizen Module — Notifications |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited (read-only) |
| **Security Considerations** | Response never includes rendered message body content, only status/metadata |

#### 8.10.2 Get Notification History Detail

| | |
|---|---|
| **Endpoint Name** | Get Notification History Detail |
| **Purpose** | Retrieve full detail (including the fully rendered content) for a single historical notification |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/notifications/history/{notificationDispatchId}` |
| **Authentication Required** | Yes |
| **Authorization** | Recipient (own notification) or Officer/Admin within scope |
| **Request Parameters** | Path: `notificationDispatchId` |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Body** | None |
| **Response Body** | `{ "id", "channel", "templateKey", "renderedSubject"?, "renderedBody", "status", "retryCount", "sentAt", "deliveredAt", "readAt"?, "linkedComplaintId"? }` |
| **Validation Rules** | `notificationDispatchId`: must exist |
| **Business Rules** | Full rendered content is only returned to the recipient or an Admin explicitly permitted to view citizen-facing message content (a scoped permission, `ARCHITECTURE.md` §11.2) |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOTIFICATION_NOT_FOUND` |
| **HTTP Status Codes** | `200`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `notification_dispatch`, `notification_event` |
| **Related Functional Module** | SRS §3.2 Citizen Module — Notifications |
| **Related AI Agent** | None |
| **Audit Requirements** | `audit_log` entry when an Admin views another user's full rendered message content (PII-adjacent access) |
| **Security Considerations** | Content-visibility permission checked server-side, independent of the general read-access check |

#### 8.10.3 Export Notification History

| | |
|---|---|
| **Endpoint Name** | Export Notification History |
| **Purpose** | Export notification delivery history as CSV/PDF for offline/compliance use, following the same asynchronous export pattern already fixed for Reports (`API_SPECIFICATION.md` §9.8) |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/notifications/history/export` |
| **Authentication Required** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Parameters** | `?format=csv\|pdf` (required), plus the same filters as Section 8.10.1 |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Body** | None |
| **Response Body** | `202 Accepted`: `{ "exportJobId", "status": "queued" }` — delivered via a signed, short-lived download URL once ready (`API_SPECIFICATION.md` §11.2) |
| **Validation Rules** | `format`: required, one of the two supported values |
| **Business Rules** | Large exports are generated asynchronously via the Scheduler (`ARCHITECTURE.md` §17), identical mechanics to Section 9.8 |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `429 RATE_LIMITED` |
| **HTTP Status Codes** | `202`, `400`, `401`, `403`, `429` |
| **Rate Limiting** | Export-generation throttling (matches `API_SPECIFICATION.md` §9.8) |
| **Idempotency** | `Idempotency-Key` accepted (optional) |
| **Related Database Entities** | `notification_dispatch`, `file_asset` (the generated export artifact) |
| **Related Functional Module** | SRS §3.4 Admin Module — Reports |
| **Related AI Agent** | None |
| **Audit Requirements** | `audit_log` entry recording the export request, filters applied, and the requesting Admin |
| **Security Considerations** | Export artifact inherits the same signed-URL, virus-scan, and retention rules as any other `file_asset` (`API_SPECIFICATION.md` §11) |

---

### 8.11 Notification Retry APIs

Surfaces `notification_dispatch.retry_count` (`DATABASE_DESIGN.md` §11) as an explicit, queryable, and manually triggerable capability, on top of the automatic retry-with-backoff the Notification Service already performs (`ARCHITECTURE.md` §10.3).

#### 8.11.1 Retry Failed Notification

| | |
|---|---|
| **Endpoint Name** | Retry Failed Notification |
| **Purpose** | Manually re-queue a single `Failed` (or Dead-Lettered) notification for another delivery attempt |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/notifications/{notificationDispatchId}/retry` |
| **Authentication Required** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Parameters** | Path: `notificationDispatchId` |
| **Request Headers** | `Authorization: Bearer <jwt>`; `Idempotency-Key` (recommended) |
| **Request Body** | None |
| **Response Body** | `{ "notificationDispatchId", "status": "retried", "retryCount": "integer (incremented)", "requeuedAt" }` |
| **Validation Rules** | Notification must currently be `Failed` or in the Dead Letter Queue; a notification in any other status returns `409` |
| **Business Rules** | A manual retry resets the automatic backoff schedule and re-attempts immediately at normal queue priority (not emergency priority, even if the original send was emergency — an operator-triggered retry does not silently escalate priority) |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOTIFICATION_NOT_FOUND`, `409 NOTIFICATION_NOT_RETRYABLE` |
| **HTTP Status Codes** | `202`, `401`, `403`, `404`, `409` |
| **Rate Limiting** | Standard per-user write-endpoint throttle |
| **Idempotency** | `Idempotency-Key` honored — protects against a double-click retry creating two in-flight attempts |
| **Related Database Entities** | `notification_dispatch` |
| **Related Functional Module** | `ARCHITECTURE.md` §10.3 Delivery Guarantees |
| **Related AI Agent** | Notification Agent |
| **Audit Requirements** | `audit_log` entry recording the manual retry and acting Admin |
| **Security Considerations** | None beyond standard RBAC |

#### 8.11.2 Bulk Retry Failed Notifications

| | |
|---|---|
| **Endpoint Name** | Bulk Retry Failed Notifications |
| **Purpose** | Re-queue every notification matching a filter (e.g. all `Failed` SMS in the last hour, after a gateway outage is resolved) |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/notifications/retry/bulk` |
| **Authentication Required** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Parameters** | None |
| **Request Headers** | `Authorization: Bearer <jwt>`; `Idempotency-Key` (recommended) |
| **Request Body** | `{ "channel"?: "string", "filter": { "createdAt": { "gte"?, "lte"? }, "status": "failed" \| "dead_letter" } }` |
| **Response Body** | `202 Accepted`: `{ "bulkRetryJobId", "matchedCount", "status": "queued" }` — processed asynchronously; final counts retrievable via Section 8.14.2's job-status shape |
| **Validation Rules** | `filter`: required; matched count capped at a system maximum per call (e.g. 10,000) to bound queue impact — a larger match must be paginated across multiple calls |
| **Business Rules** | Same priority/backoff-reset rules as Section 8.11.1, applied per matched item |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `422 MATCH_COUNT_EXCEEDS_LIMIT` |
| **HTTP Status Codes** | `202`, `400`, `401`, `403`, `422` |
| **Rate Limiting** | Tightly throttled (bulk re-dispatch is a significant queue-load event) |
| **Idempotency** | `Idempotency-Key` honored (24-hour TTL) |
| **Related Database Entities** | `notification_dispatch` |
| **Related Functional Module** | `ARCHITECTURE.md` §10.3 Delivery Guarantees |
| **Related AI Agent** | Notification Agent |
| **Audit Requirements** | `audit_log` entry recording the filter criteria, matched count, and acting Admin |
| **Security Considerations** | Matched-count cap prevents an accidental or malicious mass-redispatch from overwhelming a provider or a citizen with duplicate messages |

#### 8.11.3 Get Retry History for a Notification

| | |
|---|---|
| **Endpoint Name** | Get Retry History for a Notification |
| **Purpose** | Retrieve every retry attempt recorded against a specific notification, for troubleshooting a persistently failing dispatch |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/notifications/{notificationDispatchId}/retries` |
| **Authentication Required** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Parameters** | Path: `notificationDispatchId` |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "attemptNumber", "attemptedAt", "outcome", "failureReason"? } ] }` |
| **Validation Rules** | `notificationDispatchId`: must exist |
| **Business Rules** | None (read-only) |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOTIFICATION_NOT_FOUND` |
| **HTTP Status Codes** | `200`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `notification_dispatch` |
| **Related Functional Module** | `ARCHITECTURE.md` §10.3 Delivery Guarantees |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited (read-only) |
| **Security Considerations** | None beyond standard RBAC |

---
### 8.12 Notification Provider APIs

A **read-oriented, notification-scoped view** of `provider_config`, filtered to the four notification channel provider types (`sms`, `email`, `whatsapp`, `push`). The mutating "select active provider" operation is **not duplicated here** — it already exists at `PUT /api/v1/providers/{providerType}` (`06-Administration-APIs.md` §6.11.2) and remains the single path for that action, consistent with the cross-referencing pattern already used for Notification Templates in `06-Administration-APIs.md` §6.9. Per the explicit requirement that "provider-specific logic must NOT be exposed through APIs," every response body below is limited to `providerType`/`providerName`/`isActive`/status metadata — never a provider's own field names, credentials, or wire-protocol details.

#### 8.12.1 List Notification Providers

| | |
|---|---|
| **Endpoint Name** | List Notification Providers |
| **Purpose** | Retrieve the tenant's currently configured provider for each notification channel |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/notification-providers` |
| **Authentication Required** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Parameters** | `?channel=sms\|email\|whatsapp\|push` |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "providerType", "providerName", "isActive", "updatedAt" } ] }` |
| **Validation Rules** | None (read-only) |
| **Business Rules** | Only channel-relevant `providerType` values (`sms`/`email`/`whatsapp`/`push`) are returned here — `ai`/`voice`/`maps` provider types remain exclusively under `06-Administration-APIs.md` §6.11/§6.12 |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `provider_config` |
| **Related Functional Module** | SRS §3.4 Admin Module — Notification Provider configuration |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited (read-only) |
| **Security Considerations** | Response never includes `secretReference` or any credential material |

#### 8.12.2 Get Notification Provider Detail

| | |
|---|---|
| **Endpoint Name** | Get Notification Provider Detail |
| **Purpose** | Retrieve the configuration detail for a single notification channel's active provider |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/notification-providers/{providerType}` |
| **Authentication Required** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Parameters** | Path: `providerType` (`sms`/`email`/`whatsapp`/`push`) |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Body** | None |
| **Response Body** | `{ "providerType", "providerName", "isActive", "updatedAt" }` |
| **Validation Rules** | `providerType`: must be one of the four notification-channel values (a request for `ai`/`voice`/`maps` returns `404` here — use §6.11/§6.12 instead) |
| **Business Rules** | None |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 PROVIDER_NOT_FOUND` |
| **HTTP Status Codes** | `200`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `provider_config` |
| **Related Functional Module** | SRS §3.4 Admin Module — Notification Provider configuration |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited (read-only) |
| **Security Considerations** | Same credential-exclusion rule as Section 8.12.1 |

#### 8.12.3 Test Notification Provider Connectivity

| | |
|---|---|
| **Endpoint Name** | Test Notification Provider Connectivity |
| **Purpose** | Verify that the currently configured provider for a channel is reachable and correctly authenticated, without sending a real message to any citizen/officer recipient |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/notification-providers/{providerType}/test` |
| **Authentication Required** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Parameters** | Path: `providerType` |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Body** | None |
| **Response Body** | `{ "providerType", "providerName", "reachable": "boolean", "latencyMs"?: "integer", "checkedAt" }` |
| **Validation Rules** | `providerType`: must be one of `sms`/`email`/`whatsapp`/`push` |
| **Business Rules** | This is a connectivity/authentication probe only (e.g. an API handshake or account-status call), never a message send to an end recipient — distinct in intent from the channel-specific Test Send endpoints (Sections 8.2.3/8.3.3/8.4.3/8.5.3), which do send a real message to a designated test recipient |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 PROVIDER_NOT_FOUND`, `503 PROVIDER_UNAVAILABLE` |
| **HTTP Status Codes** | `200`, `401`, `403`, `404`, `503` |
| **Rate Limiting** | Throttled (e.g. 10/hour per Admin) to avoid excessive probing of an external provider's API |
| **Idempotency** | Naturally idempotent — a read-only probe with no persisted side effect beyond the health-check log |
| **Related Database Entities** | `provider_config` |
| **Related Functional Module** | `ARCHITECTURE.md` §15 Observability Architecture — Health Checks |
| **Related AI Agent** | None |
| **Audit Requirements** | Result logged to the operational metrics stream (`ARCHITECTURE.md` §15), not the citizen-facing `audit_log` |
| **Security Considerations** | Never returns the provider's raw credential/response payload — only a boolean reachability result and latency |

---

### 8.13 Broadcast Notification APIs

Sends one notification intent to a **scope** of recipients (e.g. every citizen in a ward, every officer in a department) — modeled as one `notification_event` (the broadcast) fanning out to many `notification_dispatch` rows (one per recipient/channel), exactly the "one event, many channels" relationship already approved in `DATABASE_DESIGN.md` §15/§16. No new table is required.

#### 8.13.1 Create Broadcast Notification

| | |
|---|---|
| **Endpoint Name** | Create Broadcast Notification |
| **Purpose** | Announce a scope-wide message (e.g. a water-supply disruption, a public-safety alert) to every recipient matching an administrative scope |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/notifications/broadcast` |
| **Authentication Required** | Yes |
| **Authorization** | Department Admin (own department's scope) / Corporation Admin / Super Admin |
| **Request Parameters** | None |
| **Request Headers** | `Authorization: Bearer <jwt>`; `Idempotency-Key` (recommended); `Accept-Language` |
| **Request Body** | `{ "scopeType": "ward" \| "zone" \| "district" \| "department" \| "tenant", "scopeId"?: "id (required unless scopeType=tenant)", "channels": ["sms", "email", "whatsapp", "push_mobile", "in_app"], "templateKey": "string", "variables": { "key": "value" }, "priority"?: "normal" \| "high" \| "emergency" }` |
| **Response Body** | `202 Accepted`: `{ "broadcastId", "status": "queued", "estimatedRecipientCount" }` |
| **Validation Rules** | `scopeType`/`scopeId`: required combination, must resolve to a real administrative unit within tenant (Section 7); `channels`: at least one, each must have an `approved` template for `templateKey`; `estimatedRecipientCount` is computed synchronously, actual fan-out is asynchronous |
| **Business Rules** | Respects each individual recipient's channel/category preference and quiet hours **unless** `priority = emergency`, in which case it behaves as a scope-wide Emergency Override (Section 8.8.4) and is logged with the same audit rigor; a broadcast is rate-governed independently of any single recipient's own throttle, since its purpose is precisely to reach many recipients at once |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 SCOPE_NOT_FOUND`, `404 TEMPLATE_NOT_FOUND`, `409 TEMPLATE_NOT_APPROVED` |
| **HTTP Status Codes** | `202`, `400`, `401`, `403`, `404`, `409`, `429` |
| **Rate Limiting** | Strict per-tenant broadcast-creation throttle (e.g. a small number per hour) to prevent notification fatigue and provider-cost runaway |
| **Idempotency** | `Idempotency-Key` honored (24-hour TTL) — critical here, since a duplicate broadcast would mass-spam every recipient in scope |
| **Related Database Entities** | `notification_event`, `notification_dispatch`, `notification_template_config`, `notification_preference`, `ward`/`zone`/`district`/`department` (scope resolution) |
| **Related Functional Module** | SRS §5 External Interface Requirements; `ARCHITECTURE.md` §10 Notification Architecture |
| **Related AI Agent** | Notification Agent |
| **Audit Requirements** | Mandatory `audit_log` entry recording the acting Admin, scope, template, channel set, and priority — a broadcast is inherently a high-visibility, high-blast-radius action |
| **Security Considerations** | Scope resolution is performed server-side against the caller's own tenant/department scope only — a Department Admin cannot broadcast to a scope outside their own department (OWASP A01) |

#### 8.13.2 List Broadcasts

| | |
|---|---|
| **Endpoint Name** | List Broadcasts |
| **Purpose** | Retrieve the tenant's broadcast history |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/notifications/broadcast` |
| **Authentication Required** | Yes |
| **Authorization** | Department Admin (own scope) / Corporation Admin / Super Admin |
| **Request Parameters** | `?scopeType=`, `?status=`, `?sort=-createdAt` (default), `?cursor=`, `?limit=` |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "broadcastId", "scopeType", "scopeId", "status", "recipientCount", "createdAt" } ], "meta": { "pagination" } }` |
| **Validation Rules** | `limit`: max 100 |
| **Business Rules** | None (read-only) |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `notification_event` |
| **Related Functional Module** | `ARCHITECTURE.md` §10 Notification Architecture |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited (read-only) |
| **Security Considerations** | Scoped to the caller's own department/tenant, same as create |

#### 8.13.3 Get Broadcast Status

| | |
|---|---|
| **Endpoint Name** | Get Broadcast Status |
| **Purpose** | Retrieve the fan-out progress and delivery summary of a specific broadcast |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/notifications/broadcast/{broadcastId}` |
| **Authentication Required** | Yes |
| **Authorization** | Department Admin (own scope) / Corporation Admin / Super Admin |
| **Request Parameters** | Path: `broadcastId` |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Body** | None |
| **Response Body** | `{ "broadcastId", "status": "queued" \| "in_progress" \| "completed" \| "cancelled", "recipientCount", "sentCount", "deliveredCount", "failedCount" }` |
| **Validation Rules** | `broadcastId`: must exist |
| **Business Rules** | Counts are eventually consistent while `status = in_progress` |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 BROADCAST_NOT_FOUND` |
| **HTTP Status Codes** | `200`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `notification_event`, `notification_dispatch` |
| **Related Functional Module** | `ARCHITECTURE.md` §10 Notification Architecture |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited (read-only) |
| **Security Considerations** | Scoped to the caller's own department/tenant |

#### 8.13.4 Cancel Broadcast

| | |
|---|---|
| **Endpoint Name** | Cancel Broadcast |
| **Purpose** | Stop a broadcast that has not yet fully fanned out — already-dispatched individual notifications are unaffected |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/notifications/broadcast/{broadcastId}/cancel` |
| **Authentication Required** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Parameters** | Path: `broadcastId` |
| **Request Headers** | `Authorization: Bearer <jwt>`; `If-Match: "<current status>"` (optimistic concurrency — guards against cancelling a broadcast that has just completed) |
| **Request Body** | `{ "reason": "string", "expectedStatus": "queued" \| "in_progress" }` |
| **Response Body** | `{ "broadcastId", "status": "cancelled", "recipientsNotYetDispatched": "integer" }` |
| **Validation Rules** | `expectedStatus`: required, must match the broadcast's current status; broadcast must be `queued` or `in_progress` |
| **Business Rules** | **Optimistic concurrency**: if the broadcast has already reached `completed` by the time this call is processed, the request is rejected (`409`) rather than silently no-op'ing, so the caller is explicitly told the cancel had no effect; individually already-dispatched notifications are never recalled |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 BROADCAST_NOT_FOUND`, `409 BROADCAST_ALREADY_COMPLETED`, `409 CONCURRENT_MODIFICATION` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403`, `404`, `409` |
| **Rate Limiting** | Standard per-user write-endpoint throttle |
| **Idempotency** | Naturally idempotent for a broadcast already `cancelled` (returns the existing state); guarded against stale-state cancellation via `expectedStatus` |
| **Related Database Entities** | `notification_event`, `notification_dispatch` |
| **Related Functional Module** | `ARCHITECTURE.md` §10 Notification Architecture |
| **Related AI Agent** | None |
| **Audit Requirements** | Mandatory `audit_log` entry recording the cancellation, reason, and acting Admin |
| **Security Considerations** | None beyond standard RBAC |

---

### 8.14 Bulk Notification APIs

Sends individually addressed notifications to an **explicit recipient list** — distinct from Broadcast (Section 8.13), which targets a resolved administrative scope rather than a caller-supplied list. Same underlying `notification_event`/`notification_dispatch` fan-out mechanism.

#### 8.14.1 Create Bulk Notification Job

| | |
|---|---|
| **Endpoint Name** | Create Bulk Notification Job |
| **Purpose** | Dispatch a notification to an explicit list of recipients (e.g. "every citizen with a complaint overdue by more than 15 days") as one asynchronous job |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/notifications/bulk` |
| **Authentication Required** | Yes |
| **Authorization** | Corporation Admin / Super Admin; internal service token (e.g. the SLA Agent triggering an overdue-complaint reminder batch) |
| **Request Parameters** | None |
| **Request Headers** | `Authorization: Bearer <jwt>`; `Idempotency-Key` (recommended) |
| **Request Body** | `{ "recipientUserIds": ["id"], "channel": "string", "templateKey": "string", "variables": { "key": "value" } }` (max 5,000 recipients per call — larger sets must be paginated across multiple calls) |
| **Response Body** | `202 Accepted`: `{ "bulkJobId", "status": "queued", "recipientCount" }` |
| **Validation Rules** | `recipientUserIds`: required, 1–5,000 entries, all must resolve within the caller's tenant/scope; `templateKey`: required, `approved` for `channel` |
| **Business Rules** | Each recipient's own channel/category preference is respected individually (unlike Broadcast's scope-wide emergency-override option, Bulk has no override mode — it is intended for routine, preference-respecting mass communication) |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 TEMPLATE_NOT_FOUND`, `409 TEMPLATE_NOT_APPROVED`, `422 RECIPIENT_LIST_EXCEEDS_LIMIT` |
| **HTTP Status Codes** | `202`, `400`, `401`, `403`, `404`, `409`, `422`, `429` |
| **Rate Limiting** | Per-tenant bulk-job creation throttle |
| **Idempotency** | `Idempotency-Key` honored (24-hour TTL) |
| **Related Database Entities** | `notification_event`, `notification_dispatch`, `notification_template_config`, `notification_preference` |
| **Related Functional Module** | SRS §3.5 AI Agent Layer — SLA Agent (reminder generation); `ARCHITECTURE.md` §10 Notification Architecture |
| **Related AI Agent** | Notification Agent |
| **Audit Requirements** | `audit_log` entry recording the acting Admin/service, recipient count, and template |
| **Security Considerations** | Recipient list validated to be within the caller's own tenant/scope — a Department Admin cannot bulk-notify users outside their department |

#### 8.14.2 Get Bulk Notification Job Status

| | |
|---|---|
| **Endpoint Name** | Get Bulk Notification Job Status |
| **Purpose** | Retrieve the progress and outcome of an asynchronous bulk notification job |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/notifications/bulk/{bulkJobId}` |
| **Authentication Required** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Parameters** | Path: `bulkJobId` |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Body** | None |
| **Response Body** | `{ "bulkJobId", "status": "queued" \| "in_progress" \| "completed" \| "cancelled", "recipientCount", "sentCount", "failedCount" }` |
| **Validation Rules** | `bulkJobId`: must exist |
| **Business Rules** | Counts are eventually consistent while `status = in_progress` |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 BULK_JOB_NOT_FOUND` |
| **HTTP Status Codes** | `200`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `notification_event`, `notification_dispatch` |
| **Related Functional Module** | `ARCHITECTURE.md` §10 Notification Architecture |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited (read-only) |
| **Security Considerations** | Scoped to the caller's own tenant |

#### 8.14.3 Cancel Bulk Notification Job

| | |
|---|---|
| **Endpoint Name** | Cancel Bulk Notification Job |
| **Purpose** | Stop a bulk job that has not yet fully processed its recipient list |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/notifications/bulk/{bulkJobId}/cancel` |
| **Authentication Required** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Parameters** | Path: `bulkJobId` |
| **Request Headers** | `Authorization: Bearer <jwt>`; `If-Match: "<current status>"` (optimistic concurrency) |
| **Request Body** | `{ "reason": "string", "expectedStatus": "queued" \| "in_progress" }` |
| **Response Body** | `{ "bulkJobId", "status": "cancelled", "recipientsNotYetProcessed": "integer" }` |
| **Validation Rules** | `expectedStatus`: required, must match current status; job must be `queued` or `in_progress` |
| **Business Rules** | **Optimistic concurrency**: identical guard to Section 8.13.4 — a stale cancel against an already-`completed` job is rejected (`409`), not silently ignored |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 BULK_JOB_NOT_FOUND`, `409 JOB_ALREADY_COMPLETED`, `409 CONCURRENT_MODIFICATION` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403`, `404`, `409` |
| **Rate Limiting** | Standard per-user write-endpoint throttle |
| **Idempotency** | Naturally idempotent for an already-`cancelled` job |
| **Related Database Entities** | `notification_event`, `notification_dispatch` |
| **Related Functional Module** | `ARCHITECTURE.md` §10 Notification Architecture |
| **Related AI Agent** | None |
| **Audit Requirements** | `audit_log` entry recording the cancellation and acting Admin |
| **Security Considerations** | None beyond standard RBAC |

---

### 8.15 Notification Analytics APIs

Pre-aggregated metrics (Section 8.1.8), computed by a scheduled job over `notification_dispatch`, never live-aggregated on every dashboard load — the same denormalization rationale already fixed for the Reporting Tables (`DATABASE_DESIGN.md` §14/§17).

#### 8.15.1 Get Notification Analytics Summary

| | |
|---|---|
| **Endpoint Name** | Get Notification Analytics Summary |
| **Purpose** | Retrieve delivery rate, failure rate, read rate, open rate, click rate, and average delivery time for a period/channel |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/notifications/analytics` |
| **Authentication Required** | Yes |
| **Authorization** | Department Admin / Corporation Admin / Super Admin |
| **Request Parameters** | `?channel=`, `?departmentId=`, `?periodStart=` (required), `?periodEnd=` (required) |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Body** | None |
| **Response Body** | `{ "deliveryRatePercent", "failureRatePercent", "readRatePercent", "openRatePercent", "clickRatePercent", "averageDeliveryTimeSeconds", "totalDispatched" }` |
| **Validation Rules** | `periodStart`/`periodEnd`: required, `periodEnd` ≥ `periodStart`, max 12-month range per call |
| **Business Rules** | Test sends (Sections 8.2.3/8.3.3/8.4.3/8.5.3) and Preview renders (8.7.7) are excluded from every metric |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `notification_dispatch` (source), pre-aggregated via a scheduled job following the `DATABASE_DESIGN.md` §14 Reporting Tables pattern |
| **Related Functional Module** | `DATABASE_DESIGN.md` §14 Reporting Tables |
| **Related AI Agent** | None (structured source; a future AI-narrated notification-insight surface would reuse the Analytics Agent per the pattern already established in `API_SPECIFICATION.md` §5.6) |
| **Audit Requirements** | Not separately audited (read-only aggregate) |
| **Security Considerations** | Aggregate-only response — never includes individual recipient identities |

#### 8.15.2 Get Provider Performance Analytics

| | |
|---|---|
| **Endpoint Name** | Get Provider Performance Analytics |
| **Purpose** | Compare delivery performance across the providers configured for a channel over time (e.g. if a tenant has changed SMS gateway mid-period) |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/notifications/analytics/providers` |
| **Authentication Required** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Parameters** | `?channel=` (required), `?periodStart=` (required), `?periodEnd=` (required) |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "providerName", "deliveryRatePercent", "averageLatencyMs", "totalDispatched" } ] }` |
| **Validation Rules** | `channel`/`periodStart`/`periodEnd`: required |
| **Business Rules** | None beyond the abstraction rule already stated in Section 8.12 — `providerName` here is the configured label, never provider-internal diagnostic detail |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `notification_dispatch`, `provider_config` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §14 Reporting Tables |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited (read-only aggregate) |
| **Security Considerations** | Aggregate-only response |

#### 8.15.3 Get Retry Statistics

| | |
|---|---|
| **Endpoint Name** | Get Retry Statistics |
| **Purpose** | Retrieve retry-volume and eventual-success-rate statistics, for capacity planning and provider-reliability review |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/notifications/analytics/retries` |
| **Authentication Required** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Parameters** | `?channel=`, `?periodStart=` (required), `?periodEnd=` (required) |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Body** | None |
| **Response Body** | `{ "totalRetries", "eventualSuccessRatePercent", "deadLetterCount", "averageAttemptsToSuccess" }` |
| **Validation Rules** | `periodStart`/`periodEnd`: required |
| **Business Rules** | None (read-only) |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `notification_dispatch` |
| **Related Functional Module** | `ARCHITECTURE.md` §10.3 Delivery Guarantees |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited (read-only aggregate) |
| **Security Considerations** | Aggregate-only response |

---

### 8.16 Notification Health APIs

Composite and per-provider health, consistent with the `/healthz` and Prometheus-style metrics pattern already fixed in `ARCHITECTURE.md` §15. Health results are ephemeral operational state (the live check itself), not a persisted database entity — `provider_config` remains the only durable table involved, recording *what is configured*, not *whether it is currently reachable*.

#### 8.16.1 Get Notification Service Health

| | |
|---|---|
| **Endpoint Name** | Get Notification Service Health |
| **Purpose** | Composite health status of the Notification Service — provider reachability plus queue health rolled into one summary |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/notifications/health` |
| **Authentication Required** | Yes |
| **Authorization** | Department Admin / Corporation Admin / Super Admin |
| **Request Parameters** | None |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Body** | None |
| **Response Body** | `{ "overallStatus": "healthy" \| "degraded" \| "unhealthy", "providers": [ { "providerType", "reachable" } ], "queueDepth", "checkedAt" }` |
| **Validation Rules** | None (read-only) |
| **Business Rules** | `degraded` is reported when at least one non-critical channel provider is unreachable but core channels (SMS/Email) remain functional; `unhealthy` is reported when the queue itself is backed up beyond a configured threshold or a critical channel is down |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle; also polled by automated monitoring (`ARCHITECTURE.md` §15), which is exempt from the interactive-user throttle via a separate service-account rate bucket |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `provider_config` (configuration); live reachability/queue-depth are operational metrics, not database entities |
| **Related Functional Module** | `ARCHITECTURE.md` §15 Observability Architecture — Health Checks |
| **Related AI Agent** | None |
| **Audit Requirements** | Not audited (operational monitoring, not a business action) |
| **Security Considerations** | Response contains no credential or internal-diagnostic detail — status booleans and a queue-depth integer only |

#### 8.16.2 Get Provider Health Detail

| | |
|---|---|
| **Endpoint Name** | Get Provider Health Detail |
| **Purpose** | Per-provider reachability status for SMS Gateway, Email Server, WhatsApp, and Push, individually |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/notifications/health/providers` |
| **Authentication Required** | Yes |
| **Authorization** | Department Admin / Corporation Admin / Super Admin |
| **Request Parameters** | `?channel=` (optional filter) |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "channel", "providerName", "reachable": "boolean", "lastCheckedAt", "consecutiveFailureCount" } ] }` |
| **Validation Rules** | None (read-only) |
| **Business Rules** | `consecutiveFailureCount` drives the alerting threshold already defined in `ARCHITECTURE.md` §15 ("Claude API failure rate, notification delivery failure rate") |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `provider_config` |
| **Related Functional Module** | `ARCHITECTURE.md` §15 Observability Architecture — Health Checks, Alerting |
| **Related AI Agent** | None |
| **Audit Requirements** | Not audited (operational monitoring) |
| **Security Considerations** | No credential/internal-diagnostic detail exposed |

#### 8.16.3 Get Queue Health

| | |
|---|---|
| **Endpoint Name** | Get Queue Health |
| **Purpose** | Report the Redis-backed notification queue's depth, consumer lag, and dead-letter backlog |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/notifications/health/queue` |
| **Authentication Required** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Parameters** | None |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Body** | None |
| **Response Body** | `{ "queueDepth", "consumerLagSeconds", "deadLetterCount", "oldestQueuedItemAgeSeconds" }` |
| **Validation Rules** | None (read-only) |
| **Business Rules** | Feeds the same "queue backlog growth" alert threshold already defined in `ARCHITECTURE.md` §15 |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle; exempt service-account bucket for automated monitoring |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `notification_dispatch` (durable status mirror); the live queue itself is Redis-resident, not a database entity (`ARCHITECTURE.md` §16) |
| **Related Functional Module** | `ARCHITECTURE.md` §16 Redis Architecture — Queues; §15 Observability Architecture |
| **Related AI Agent** | None |
| **Audit Requirements** | Not audited (operational monitoring) |
| **Security Considerations** | Aggregate counters only — no message content or recipient identity exposed |

---

*(End of Section 8. No other sections were generated in this file, per instruction.)*




