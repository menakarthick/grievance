'use strict';

// Declarative authorization rules for the Complaint module
// (API_SPECIFICATION.md §4.1-4.13), mirroring the geo/admin policy
// convention. Citizen-facing endpoints are ownership-gated in the service
// layer (a citizen has no complaint:* permission by design — see
// src/seeders/20260101010004-seed-role-permissions.js — access is "is this
// my complaint", not a role/permission check), so this file only lists the
// Officer/Admin-tier role and permission requirements.

const OFFICER_UP = ['officer', 'department_admin', 'corporation_admin', 'super_admin'];
const DEPT_ADMIN_UP = ['department_admin', 'corporation_admin', 'super_admin'];
const CITIZEN = ['citizen'];

module.exports = {
  OFFICER_UP,
  DEPT_ADMIN_UP,
  CITIZEN,

  // Citizen-only, ownership-checked in the service layer.
  register: CITIZEN,
  registerVoice: CITIZEN,
  track: CITIZEN,
  feedback: CITIZEN,
  reopen: CITIZEN,

  // Shared read (Citizen — own; Officer — assigned/queue; Admin — scope;
  // all three roles need to reach the handler for the ownership/scope
  // check inside the service to run at all).
  read: [...CITIZEN, ...OFFICER_UP],

  // Attachment upload: Citizen (own complaint) or Officer (assigned).
  uploadAttachment: [...CITIZEN, ...OFFICER_UP],

  // Officer/Admin-tier actions. requirePermission('complaint', <action>)
  // is applied in the routes using these alongside requireRole, matching
  // the already-seeded catalog (src/seeders/20260101010002-seed-
  // permissions.js / ...004-seed-role-permissions.js): officer has
  // complaint:read/update; department_admin & corporation_admin have
  // complaint:read/assign/update/approve.
  list: OFFICER_UP,
  update: OFFICER_UP,
  assign: DEPT_ADMIN_UP,
  resolve: OFFICER_UP,
  close: OFFICER_UP,
};
