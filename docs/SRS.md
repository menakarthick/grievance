# Software Requirements Specification (SRS)

## AI Powered Enterprise Citizen Service & Grievance Management Platform

| | |
|---|---|
| **Document Status** | DRAFT — Pending Client Approval |
| **Version** | 0.2 |
| **Date** | 2026-07-19 |
| **Pilot Deployment** | Tambaram City Municipal Corporation, Tamil Nadu, India |
| **Prepared For** | Government of Tamil Nadu — Urban Local Body Digitization |

> This document consolidates all requirements provided by the stakeholder to date. No requirement has been invented or assumed beyond what was explicitly requested. Section 12 previously listed 8 open items; all 8 have now been resolved using enterprise-grade, government-system best practice, each explicitly marked **Recommended Default**. Where a decision is inherently variable across tenants, it is additionally defined as an **Admin Portal configuration** rather than a fixed value. See **Section 12 — Resolved Decisions** for the full record, including where each is implemented in this document.

---

## 1. Introduction

### 1.1 Purpose
This SRS defines the functional and non-functional requirements for a government-grade, AI-assisted Citizen Service & Grievance Management Platform. It is the baseline for all subsequent architecture, database, API, and deployment design.

### 1.2 Product Name
**AI Powered Enterprise Citizen Service & Grievance Management Platform** (internal working name; no product/brand name specified yet).

### 1.3 Pilot vs. Product
- **Pilot implementation**: Tambaram City Municipal Corporation, Tamil Nadu.
- **Product intent**: A single, configurable, multi-tenant codebase reusable — without major code changes — for:
  - Other Municipal Corporations
  - Municipalities
  - Town Panchayats
  - Village Panchayats
  - District Administrations
  - State Government Departments

This distinction is architecturally significant: every entity that is specific to Tambaram (departments, officer hierarchy, wards, SLA values, escalation rules) must be treated as **tenant configuration data**, not as fixed schema/business logic.

### 1.4 Definitions & Abbreviations
| Term | Meaning |
|---|---|
| ULB | Urban Local Body |
| SLA | Service Level Agreement (time-bound resolution target) |
| RBAC | Role-Based Access Control |
| RTO / RPO | Recovery Time Objective / Recovery Point Objective |
| PII | Personally Identifiable Information |
| DPDP Act | Digital Personal Data Protection Act (India) |
| GIGW | Guidelines for Indian Government Websites |
| STQC | Standardisation Testing and Quality Certification (MeitY) |
| CERT-In | Indian Computer Emergency Response Team |
| BSP | Business Solution Provider (WhatsApp) |
| DLT | Distributed Ledger Technology-based SMS registration (TRAI/Indian telecom compliance) |

### 1.5 References
- Tamil Nadu Urban Local Bodies governance model
- Tambaram City Municipal Corporation administrative structure
- CERT-In Guidelines, GIGW Guidelines, OWASP Top 10, DPDP Act (as compliance baselines — see Section 9)

---

## 2. Overall Description

### 2.1 Product Perspective
Greenfield system. Not a replacement or integration target for any existing portal (no integration with CPGRAMS or other external grievance systems has been specified).

### 2.2 Core Design Principles (Mandatory)
1. Enterprise Government Platform — not a single-municipality product.
2. No hardcoded departments, hierarchy, workflow, SLA, escalation, notification providers, AI providers, voice providers, districts, zones, wards, or languages — **all configurable via Admin Portal**.
3. Configurable multi-level officer hierarchy (tenant-defined depth and titles).
4. Configurable multi-tenant model to onboard new ULBs/districts/state departments without code change.
5. Real Tamil Nadu ULB governance structure and Tambaram's actual hierarchy used as the reference model — not generic placeholder examples.
6. Cloud-ready architecture: Phase-1 runs on 2 VMs with PM2/NGINX, but must support Docker, Kubernetes, load balancers, and NIC MeghRaj / State Data Centre deployment later **without redesign**.

### 2.3 User Classes

**Phase-1 active roles:**
| Role | Description |
|---|---|
| Citizen | Registers/logs in via Mobile OTP; files and tracks complaints |
| Officer | Handles assigned complaints (field-level up to supervisory levels per hierarchy) |
| Department Administrator | Manages a single department's configuration and staff |
| Corporation Administrator | Manages department administration, officer management, SLA config, escalation rules, notification config, reports — corporation-wide |
| Super Administrator | Full system administration across the platform |

**Phase-1, dashboard/reporting access only (no transactional workflow yet):**
Zone Administrator, Mayor, Deputy Mayor, Corporation Council Members, MLA Office, MP Office, District Collector, State Monitoring Cell, RTI Officer, Auditor.

> Note: Zone Administrator appears in both the Admin Roles list (Section 6.4) and is read-only/reporting in early rollout per stakeholder note; treated as a configurable admin role scoped to zonal complaints.

### 2.4 Operating Environment
- Server OS: Ubuntu
- Web/reverse proxy: NGINX
- Process manager: PM2
- Runtime: Node.js (backend + AI service)
- Database: MySQL
- Cache: Redis
- Voice-to-text: Whisper
- LLM: Claude API (with mandatory PII masking — see Section 10)
- Frontend: ReactJS + Tailwind CSS + Redux Toolkit, mobile-responsive (no native mobile app specified)
- Languages supported: Tamil, English

### 2.5 Constraints
- Phase-1 infrastructure fixed at **two VMs**: VM-1 (Application Server), VM-2 (Database Server).
- WhatsApp must use the **official WhatsApp Business Platform** (not unofficial/gray-route APIs); provider configurable (Meta Cloud API, Gupshup, Karix, Twilio as examples).
- SMS must use a **DLT-registered Indian SMS gateway**; provider configurable.
- Guest (unauthenticated) complaint registration is **explicitly out of scope for Phase-1**.
- Citizen AI provider is Claude API; architecture must allow swapping to an **on-premise LLM in future** without changing business logic (adapter/interface pattern required at design stage).

### 2.6 Assumptions & Dependencies
None assumed beyond what is stated in this document. Items not specified by the stakeholder are listed in Section 12, not silently assumed.

---

## 3. Functional Requirements

### 3.1 Authentication Module
- Login (role-aware: Citizen / Officer / Admin tiers)
- Forgot Password
- OTP-based verification (Mobile OTP is mandatory for citizen registration/login)
- JWT-based session tokens with Refresh Tokens
- RBAC — permissions enforced per role, per configurable hierarchy level
- Permission management (admin-configurable)

### 3.2 Citizen Module
- Register (Mobile OTP based — no guest flow in Phase-1)
- Login
- File Complaint (text)
- Voice Complaint (Tamil or English, via Whisper)
- Image Upload (attachment to complaint)
- Track Complaint (status + current owner)
- Timeline (full history of status changes/actions on a complaint)
- Notifications (in-app + external channels per Section 5)
- Feedback (post-resolution)
- Complaint History (citizen's own past complaints)

### 3.3 Officer Module
- Pending Complaints (queue view)
- Assigned Complaints
- Update Status
- Upload Documents (evidence/resolution proof)
- Approve Requests (multi-level approval workflow, configurable)
- Escalations (view/act on escalated items)
- Analytics (officer/department-level)
- Officer AI Agent conversational queries (see Section 4.6):
  - Show pending complaints
  - Show critical complaints
  - Show complaints pending more than 15 days
  - Generate weekly report
  - Generate officer performance report

### 3.4 Admin Module (Department / Corporation / Super Admin — scoped by role)
- Departments (CRUD, configurable — see Section 6.2 for Phase-1 seed list)
- Districts / Zones / Wards (CRUD, configurable hierarchy of geography)
- Officers (CRUD, assignment to hierarchy levels and departments)
- Complaint Categories (CRUD, configurable)
- Complaint Status values (CRUD, configurable — not a fixed enum)
- Officer Hierarchy (CRUD, configurable depth/titles — see Section 6.3 for Phase-1 seed hierarchy)
- Approval Workflow (configurable per category/department)
- SLA Settings (configurable per category/department/priority)
- Escalation Matrix (configurable rules, levels, timers)
- Notification Templates (configurable, per channel, per language)
- Notification Provider configuration (WhatsApp / SMS / Email / Push provider selection)
- AI Provider configuration (pluggable AI provider, default Claude)
- Voice Provider configuration (pluggable, default Whisper)
- Language configuration (Tamil, English at Phase-1)
- Audit Logs (view/search, immutable)
- Reports (operational + compliance)

### 3.5 AI Agent Layer
All agents are backend services orchestrated by the AI Service tier; none expose citizen PII externally without masking (Section 10).

| Agent | Responsibilities |
|---|---|
| **Complaint Agent** | Category detection, priority detection, department detection, location detection, severity detection, language detection |
| **Assignment Agent** | Assign officers, check workload, set SLA, send notifications |
| **SLA Agent** | Check pending complaints, generate reminders, auto-escalation, generate reports |
| **Voice Agent** | Speech-to-text (Whisper), Tamil detection, complaint analysis, generate summary, register complaint |
| **Officer AI Agent** | Natural-language query interface for officers (pending/critical/aging complaints, weekly report, performance report) |
| **Analytics Agent** | District-wise reports, department-wise reports, monthly reports, predictions, trends, AI summaries |
| **Notification Agent** | Email, SMS, WhatsApp, Push notifications, reminders |

### 3.6 Voice Complaint Flow (as specified)
Citizen speaks (Tamil) → Whisper (speech-to-text) → Tamil text → Complaint Agent → Language Detection → Category Detection → Priority Detection → Location Detection → Assignment Agent → SLA Agent → Officer Assignment → Notifications → Complaint Registered.

### 3.7 Portals
1. Citizen Portal
2. Officer Portal
3. Admin Portal (Department / Corporation Administrator)
4. Super Admin Portal
5. Mobile-responsive UI across all portals (no native app)

### 3.8 Complaint Tracking ID — **Recommended Default**

Resolves Open Item #8 (tracking ID format).

Format: `{TenantCode}-{DeptCode}-{YYYYMM}-{SequenceNumber}`
Example: `TMBM-ENG-202607-000123`

- `TenantCode`: short code identifying the ULB/tenant (e.g., `TMBM` for Tambaram Municipal Corporation) — set once per tenant during onboarding.
- `DeptCode`: short code for the assigned department (e.g., `ENG` for Engineering) — derived from Section 6.2 department configuration.
- `YYYYMM`: year and month of registration, for chronological sortability and easy manual reference.
- `SequenceNumber`: zero-padded, atomically generated per tenant per month (via a database sequence or Redis atomic counter) — guarantees uniqueness under concurrent registration load.

This ID is generated server-side at complaint creation, is immutable, human-readable, sortable, and safe to communicate over SMS/WhatsApp/voice callback. The ID **format** and `TenantCode` are Admin Portal configuration (per tenant, set at onboarding); the generation algorithm (atomic, gapless-per-tenant) is fixed system behavior.

### 3.9 External System Integration — **Recommended Default**

Resolves Open Item #1 (external system integration).

No integration with any external state/central grievance system (e.g., state ULB PGR systems, CPGRAMS, TNeGA services) or Aadhaar e-KYC is in scope for Phase-1 — confirmed greenfield, standalone deployment.

To avoid foreclosing future integration (a realistic need once other ULBs/state departments onboard), the API layer shall be designed as versioned, documented REST APIs from the outset, so that future integration can be added without breaking existing consumers. No integration-specific code or connectors are built in Phase-1.

---

## 4. Non-Functional Requirements

### 4.1 Scale
| Metric | Value |
|---|---|
| Citizen population (pilot) | ~10,00,000 (10 lakh) |
| Average complaint volume | 500–1000 / day |
| Peak complaint volume (monsoon/cyclone/floods/festivals) | up to 5000 / day |
| Concurrent citizen users | 2000+ |
| Concurrent officer users | 500+ |
| Concurrent admin users | 50+ |
| Scaling model | Horizontal scaling required |

### 4.2 Availability & Disaster Recovery
| Metric | Target |
|---|---|
| Availability | 99.9% |
| RTO | 30 minutes |
| RPO | 15 minutes |

### 4.3 Data Retention
| Data Type | Retention Period |
|---|---|
| Complaint Records | 10 years |
| Audit Logs | 10 years |
| Application Logs | 2 years |
| Voice Recordings | 5 years |
| Uploaded Documents | 10 years |

### 4.4 Localization
- Tamil and English supported at UI, voice input, and complaint content level.

### 4.5 Usability
- Mobile-responsive UI mandatory across all portals.

### 4.6 Accessibility — **Recommended Default**

Resolves Open Item #4 (accessibility standard).

The Citizen Portal (public-facing) shall conform to **WCAG 2.1 Level AA**, consistent with GIGW's accessibility guidance for Indian government digital services. This is treated as a fixed, testable acceptance criterion — not tenant-configurable — verified via automated tooling (e.g., axe-core in CI) plus manual audit before go-live. Officer and Admin portals (internal, trained-user tools) target the same standard as best practice but are not held to the same public-facing acceptance gate.

---

## 5. External Interface Requirements

| Channel | Requirement |
|---|---|
| WhatsApp | Official WhatsApp Business Platform only; provider configurable (Meta Cloud API, Gupshup, Karix, Twilio as examples) |
| SMS | DLT-registered Indian SMS gateway; provider configurable |
| Email | SMTP, configurable |
| Push Notifications | Firebase Cloud Messaging |
| Voice | Whisper (speech-to-text), pluggable/configurable voice provider |
| AI / LLM | Claude API, pluggable/configurable AI provider, replaceable with on-premise LLM in future |

---

## 6. Tenant Reference Configuration (Phase-1 Seed Data for Tambaram)

> These are configuration values for the Tambaram tenant, not hardcoded system requirements. The system must allow every item below to be redefined per tenant.

### 6.1 Officer Hierarchy (Tambaram, configurable per tenant)
1. Commissioner
2. Additional Commissioner
3. Deputy Commissioner
4. Assistant Commissioner
5. Executive Engineer
6. Assistant Executive Engineer
7. Assistant Engineer
8. Junior Engineer
9. Sanitary Officer
10. Health Inspector
11. Revenue Inspector
12. Ward Inspector
13. Field Staff

### 6.2 Departments (Tambaram, configurable per tenant)
Administration, Engineering, Roads, Storm Water Drain, Water Supply, Sewerage, Solid Waste Management, Public Health, Revenue, Town Planning, Electrical, Parks, Street Lighting, Building Approval, Disaster Management, IT Cell.

### 6.3 Admin Roles (Phase-1)
- **Super Administrator** — complete system administration.
- **Corporation Administrator** — department administration, officer management, SLA configuration, escalation rules, notification configuration, reports.
- **Department Administrator** — manages department-level activities.
- **Zone Administrator** — manages zonal complaints.

### 6.4 Future Roles (dashboard + reporting access only, Phase-1)
Mayor, Deputy Mayor, Corporation Council Members, MLA Office, MP Office, District Collector, State Monitoring Cell, RTI Officer, Auditor.

---

## 7. Multi-Tenancy & Configurability Requirements

The following must be admin-configurable, with no hardcoded values in business logic:
Departments, Complaint Categories, Complaint Status values, Officer Hierarchy, Approval Workflow, SLA Rules, Escalation Matrix, Notification Templates, WhatsApp Provider, SMS Provider, AI Provider, Voice Provider, Districts, Zones, Wards, Languages.

---

## 8. Security Requirements

1. RBAC
2. JWT with Refresh Tokens
3. API Rate Limiting
4. XSS Protection
5. SQL Injection Protection
6. File Upload Validation
7. Audit Logs (immutable, 10-year retention)
8. Encryption at Rest
9. Encryption in Transit
10. API Logging
11. Exception Handling
12. Activity Monitoring

### 8.1 Authentication & Session Security Policy — **Recommended Default**

Resolves Open Item #2 (Admin session/security policy).

| Control | Recommended Default | Configurable? |
|---|---|---|
| Citizen authentication | Mobile OTP only (per Section 3.1/2.5) | No — fixed per Constraints |
| Officer / Department Admin authentication | Username + password (Argon2id hashed) + OTP on login | MFA toggle configurable per role |
| Corporation Admin / Super Admin authentication | Username + password (Argon2id hashed) + **mandatory TOTP-based MFA** (e.g., authenticator app) | MFA enforcement toggle exists but recommended locked "on" for these two roles |
| Password policy | Minimum 12 characters, upper/lower/digit/special, no reuse of last 5 passwords, mandatory rotation every 90 days for Admin-tier roles | Policy thresholds configurable per tenant via Admin Portal → Security Settings |
| Account lockout | Lock after 5 consecutive failed attempts; exponential backoff, unlock after 15 minutes or admin reset | Threshold configurable |
| JWT access token | Short-lived, 15-minute expiry | Configurable per tenant, bounded by a system-enforced maximum |
| Refresh token | 7-day expiry, rotated on each use, single-use (old token invalidated), stored server-side in Redis for revocation capability | Expiry configurable per tenant |
| Idle session timeout | Citizen: 30 minutes · Officer: 30 minutes · Admin/Super Admin: 15 minutes | Configurable per role via Admin Portal |
| Token revocation | Redis-backed denylist for logout / forced revocation (e.g., role change, security incident) | N/A — mandatory |

### 8.2 File Upload Security Policy — **Recommended Default**

Resolves Open Item #3 (file upload constraints). Applies in addition to the general File Upload Validation control above.

| Asset Type | Allowed Formats | Max Size (per file) | Max Files per Complaint |
|---|---|---|---|
| Complaint Images | JPEG, PNG, WEBP | 5 MB | 5 |
| Voice Complaint | WAV, MP3, OGG | 10 MB / max 5 minutes duration | 1 |
| Officer Evidence Documents | PDF, JPEG, PNG | 10 MB | 5 |

Validation pipeline (OWASP-aligned, mandatory regardless of tenant config):
1. Extension allow-list check.
2. MIME-type verification against actual file content (magic-byte inspection, not just declared `Content-Type`).
3. Image re-encoding/normalization on ingest to strip embedded scripts/metadata (EXIF stripped for privacy).
4. Antivirus/malware scan (e.g., ClamAV) before the file is persisted.
5. Storage outside the web-served root, with randomized, non-guessable file names; access only via authenticated, signed short-lived URLs.

The specific size/format limits above are the **Recommended Default** and are exposed as Admin Portal configuration (per tenant), bounded by a hard system-wide ceiling to prevent storage-exhaustion abuse.

---

## 9. Compliance Requirements

The system shall be designed with the following compliance frameworks as guiding baselines:
- CERT-In Guidelines
- GIGW Guidelines (Guidelines for Indian Government Websites)
- OWASP Top 10
- Digital Personal Data Protection Act (DPDP Act)
- STQC Readiness (design for certifiability, not a claim of certification)

---

## 10. AI Data Privacy Requirements

**Mandatory pre-processing rule**: Citizen personal information shall never be exposed directly to external AI providers.

Before any complaint content is sent to the Claude API, the system shall automatically detect and mask:
- Aadhaar Number
- PAN Number
- Mobile Number
- Email Address
- Bank Account Number
- IFSC Code
- UPI ID
- Passport Number
- Driving Licence Number

Rules:
- Only sanitized (masked) complaint content is sent to Claude.
- The original, unmasked complaint always remains inside government infrastructure (MySQL, on VM-2).
- The AI provider integration must be an abstracted/pluggable layer so Claude can be replaced by an on-premise LLM in future without changes to business logic.

---

## 11. Hosting & Deployment Requirements

### 11.1 Phase-1
- Ubuntu Server, NGINX, PM2, Node.js, MySQL, Redis, Whisper, Claude API.
- Two VMs:
  - **VM-1**: Application Server
  - **VM-2**: Database Server

### 11.2 Future-Ready Requirements (no redesign allowed)
- Docker
- Kubernetes
- NIC MeghRaj
- State Data Centre
- Load Balancer

### 11.3 Environments & CI/CD — **Recommended Default**

Resolves Open Item #5 (environments/CI-CD).

| Environment | Purpose |
|---|---|
| Development | Active development, integration of feature branches |
| Staging / UAT | Government stakeholder acceptance testing, pre-production data-shaped rehearsal |
| Production | Live citizen-facing system |

A CI/CD pipeline (e.g., GitHub Actions/GitLab CI) is recommended to automate build, test (lint + unit + accessibility checks), and deployment via PM2 reload, with a rollback path. This is a **recommended default for the engagement**; pipeline construction is a build-phase activity, not part of this design document.

### 11.4 Backup, DR & Monitoring Tooling — **Recommended Default**

Resolves Open Item #6 (backup & monitoring tooling). No tools were mandated by the stakeholder; the following are recommended defaults to meet the RTO 30 min / RPO 15 min targets in Section 4.2, subject to approval in the Architecture phase:

- **Database backup**: MySQL daily full backup + continuous binary-log shipping to a secondary location, enabling point-in-time recovery within the 15-minute RPO. Operational backups retained on a rolling window (e.g., 90 days); long-term archival aligned to the retention periods in Section 4.3 is a separate, colder storage tier — operational backup ≠ statutory archive.
- **Application/config backup**: versioned in source control; environment configuration backed up separately (encrypted).
- **Monitoring**: PM2 process monitoring + system/application metrics (e.g., Prometheus-compatible exporters) with a dashboard (e.g., Grafana), plus external synthetic uptime checks against public endpoints.
- **Centralized logging**: structured JSON application logs (e.g., via Winston/Morgan) shipped to a central log store for the 2-year Application Log retention window and for audit/security investigation.

### 11.5 Domain & TLS — **Recommended Default**

Resolves Open Item #7 (domain/SSL). Recommended: a subdomain under the Tamil Nadu government namespace (e.g., in the pattern `grievance.tambaram.tn.gov.in`), with a certificate issued through NIC/state-recognized certificate issuance for production, consistent with STQC readiness. TLS 1.2+ only, strong cipher suites, HSTS enabled. For non-production environments, a standard CA-issued certificate (e.g., Let's Encrypt) is acceptable. **Final domain registration is a government/client-side administrative action**, not a technical decision this document can complete on its own — the pattern above is the recommendation to carry into that registration process.

---

## 12. Resolved Decisions (Formerly Open Items)

All 8 items previously listed as open have been resolved using enterprise-grade, government-system best practice, per stakeholder instruction. Each is marked **Recommended Default** at its point of definition, and made **Admin Portal configurable** wherever the decision is inherently tenant-variable rather than fixed compliance/security posture.

| # | Item | Resolution | Defined In | Configurable? |
|---|---|---|---|---|
| 1 | External system integration | No integration in Phase-1; API layer built integration-ready | §3.9 | N/A (future integration, not Phase-1 config) |
| 2 | Admin session/security policy | Mandatory MFA for Corporation/Super Admin, tiered idle timeouts, password policy, JWT/refresh token lifecycle with Redis-backed revocation | §8.1 | Thresholds configurable per tenant; MFA enforcement for top-tier admin roles recommended locked on |
| 3 | File upload constraints | Format/size ceilings per asset type + OWASP-aligned validation pipeline | §8.2 | Limits configurable per tenant within a hard system ceiling |
| 4 | Accessibility standard | WCAG 2.1 Level AA for Citizen Portal | §4.6 | Fixed (compliance gate, not tenant-configurable) |
| 5 | Environments / CI-CD | Dev / Staging-UAT / Production + recommended CI/CD pipeline | §11.3 | N/A (engagement-level decision) |
| 6 | Backup & monitoring tooling | MySQL PITR backup, PM2 + Prometheus/Grafana-style monitoring, centralized structured logging | §11.4 | Tooling is an ops decision, presented for Architecture-phase approval, not citizen/tenant-facing config |
| 7 | Domain/SSL | `*.tn.gov.in`-pattern subdomain, NIC/state-issued cert for production, TLS 1.2+/HSTS | §11.5 | Final domain string is a client/government registration action, not a technical config toggle |
| 8 | Tracking ID format | `{TenantCode}-{DeptCode}-{YYYYMM}-{SequenceNumber}`, atomically generated | §3.8 | `TenantCode` and format pattern configurable per tenant at onboarding |

No further open items remain in this SRS. Any new requirement discovered during architecture design will be raised explicitly for approval rather than assumed.

---

## 13. Out of Scope for Phase-1

- Guest (unauthenticated) complaint registration.
- Transactional workflow access for future roles listed in Section 6.4 (they receive dashboard/reporting access only).
- Native mobile applications (mobile-responsive web only).
- On-premise LLM (Claude API only for Phase-1; architecture must keep the door open).
- Integration with any external state/central grievance system, Aadhaar e-KYC, or TNeGA services (§3.9).
- CI/CD pipeline construction and backup/monitoring tool installation (recommended in §11.3/§11.4 for Architecture-phase approval; building them is a later build-phase activity, not part of this design engagement's SRS).

---

## 14. Approval

This SRS, including all resolved decisions in Section 12, must be reviewed and approved by the stakeholder before architecture design begins, per the stated instruction: *"After updating the SRS, wait for my approval before proceeding to the System Architecture."*
