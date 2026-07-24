'use strict';

// Declarative authorization rules for the File Management module
// (docs/11-File-Management-APIs.md §11.1-11.14, per this task's explicit
// 12-item scope — Preview/Virus-Scan-status-API/Image-Processing/OCR/Audit-
// Trail (§11.3, 11.8-11.10, 11.15) are not requested this round). Most
// operations are "Owner, or Officer/Admin within scope" — ownership/scope
// is an entity-level check the service layer performs (mirrors
// src/services/complaint.service.js#assertAccess), not a role list, so
// every authenticated role reaches the handler and the service decides.

const ALL_ROLES = ['citizen', 'officer', 'department_admin', 'corporation_admin', 'super_admin'];
const CORP_ADMIN_UP = ['corporation_admin', 'super_admin'];

module.exports = {
  ALL_ROLES,
  CORP_ADMIN_UP,

  upload: ALL_ROLES,
  multipart: ALL_ROLES,
  download: ALL_ROLES,
  metadataRead: ALL_ROLES,
  metadataWrite: ALL_ROLES,
  versions: ALL_ROLES,
  restoreVersion: ALL_ROLES,
  sharing: ALL_ROLES,
  access: ALL_ROLES,
  search: ALL_ROLES,
  archive: CORP_ADMIN_UP,
  storageUsage: CORP_ADMIN_UP,
  deleteFile: ALL_ROLES,
};
