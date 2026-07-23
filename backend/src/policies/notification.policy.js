'use strict';

// Declarative authorization rules for the Notification module
// (08-Notification-APIs.md §8.1-8.16). This codebase has no "internal
// service token" auth mechanism (grep confirms none exists anywhere) — the
// doc's "internal service token (event-driven dispatch) or Corporation
// Admin/Super Admin (manual/test send)" phrasing is satisfied here by the
// Admin half only; event-driven dispatch happens via
// src/services/notification.service.js#consumeDomainEvents, which calls
// the service layer directly (bypassing HTTP/RBAC entirely, same as any
// other in-process job), not through these routes.

const ALL_ROLES = ['citizen', 'officer', 'department_admin', 'corporation_admin', 'super_admin'];
const DEPT_ADMIN_UP = ['department_admin', 'corporation_admin', 'super_admin'];
const CORP_ADMIN_UP = ['corporation_admin', 'super_admin'];

module.exports = {
  ALL_ROLES,
  DEPT_ADMIN_UP,
  CORP_ADMIN_UP,

  // Channel send/status/test (§8.2-8.5)
  send: CORP_ADMIN_UP,
  getStatus: ALL_ROLES,
  testSend: CORP_ADMIN_UP,

  // In-App (§8.6) — self-scoped, any role
  inApp: ALL_ROLES,

  // Templates (§8.7)
  templateRead: DEPT_ADMIN_UP,
  templateWrite: CORP_ADMIN_UP,

  // Preferences (§8.8)
  preferenceSelf: ALL_ROLES,
  preferenceAdminView: DEPT_ADMIN_UP,
  emergencyOverride: CORP_ADMIN_UP,

  // Queue / Dead Letter / Schedule / Cancel (§8.9)
  queue: CORP_ADMIN_UP,

  // History (§8.10)
  historyRead: ALL_ROLES,
  historyExport: CORP_ADMIN_UP,

  // Retry (§8.11)
  retry: CORP_ADMIN_UP,

  // Providers (§8.12)
  providers: CORP_ADMIN_UP,

  // Broadcast (§8.13)
  broadcastCreate: DEPT_ADMIN_UP,
  broadcastRead: DEPT_ADMIN_UP,
  broadcastCancel: CORP_ADMIN_UP,

  // Bulk (§8.14)
  bulk: CORP_ADMIN_UP,

  // Analytics (§8.15)
  analyticsSummary: DEPT_ADMIN_UP,
  analyticsAdvanced: CORP_ADMIN_UP,

  // Health (§8.16)
  healthService: DEPT_ADMIN_UP,
  healthQueue: CORP_ADMIN_UP,
};
