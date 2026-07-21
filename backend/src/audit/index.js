'use strict';

// Cross-cutting audit log writer (10-Audit-APIs.md) — called from every
// module's service layer wherever an action is documented as auditable, not
// just the audit module's own read endpoints. docs/14-API-Security.md
// §14.24: "audit logging is not bypassable by any client-facing API call".
//
// Writes are best-effort and never throw into the caller — an audit-log
// failure must not fail the business operation it is recording (the write
// itself going missing is a monitoring/alerting concern, not a reason to
// reject a login or a complaint submission).

const { AuthEventLog, AuditLog } = require('../models');
const logger = require('../config/logger');

// docs/DATABASE_DESIGN.md Section 10: "the persisted, auditable mirror of
// the ephemeral Redis lockout counter" — every login/OTP/MFA/refresh/logout
// outcome recorded here regardless of success, per 13-HTTP-Status-Codes.md
// §13.8's "every row above is logged to auth_event_log ... regardless of
// outcome".
async function recordAuthEvent({ userId = null, eventType, ipAddress = null, success }) {
  try {
    await AuthEventLog.create({ userId, eventType, ipAddress, success });
  } catch (err) {
    logger.error('Failed to write auth_event_log', { error: err.message, eventType });
  }
}

// Generic state-change audit trail (ARCHITECTURE.md §11.5), polymorphic via
// entityType/entityId.
async function recordAuditLog({ tenantId, actorUserId = null, action, entityType, entityId, changeSummary = null }) {
  try {
    await AuditLog.create({ tenantId, actorUserId, action, entityType, entityId, changeSummary });
  } catch (err) {
    logger.error('Failed to write audit_log', { error: err.message, action, entityType });
  }
}

module.exports = { recordAuthEvent, recordAuditLog };
