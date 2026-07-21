'use strict';

// Closed value sets that docs/DATABASE_DESIGN.md states explicitly in prose
// (not left open-ended), used for Sequelize-level `isIn` validation. Per
// Principle 2 these are deliberately NOT native MySQL ENUM columns — the
// column stays a plain VARCHAR so a future tenant-variable value never
// requires a schema change, only a validator update.

// Section 5 ("Citizen, Officer, all Admin tiers") and Section 17's
// consolidation note ("Officer, Department Admin, Corporation Admin, and
// Super Admin").
const USER_TYPES = Object.freeze(['citizen', 'officer', 'department_admin', 'corporation_admin', 'super_admin']);

// Section 12: "images, voice, documents, and audit attachments".
const FILE_ASSET_CATEGORIES = Object.freeze(['image', 'voice', 'document', 'audit_attachment']);

// Section 12: "lifecycle_state (quarantine / hot / archived)".
const FILE_LIFECYCLE_STATES = Object.freeze(['quarantine', 'hot', 'archived']);

// Section 13: scope_type "(tenant / department / ward)".
const ASSIGNMENT_SCOPE_TYPES = Object.freeze(['tenant', 'department', 'ward']);

module.exports = {
  USER_TYPES,
  FILE_ASSET_CATEGORIES,
  FILE_LIFECYCLE_STATES,
  ASSIGNMENT_SCOPE_TYPES,
};
