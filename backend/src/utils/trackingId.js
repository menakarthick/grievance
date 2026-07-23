'use strict';

// Citizen-facing Tracking ID: {TenantCode}-{DeptCode}-{YYYYMM}-{SequenceNumber}
// (SRS §3.8, DATABASE_DESIGN.md Section 4). Format locked by
// docs/complaint.yaml's `trackingId` path pattern:
// ^[A-Z]{2,10}-[A-Z]{2,10}-\d{6}-\d{6}$

function currentYearMonth(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}${month}`;
}

function buildTrackingId({ tenantCode, departmentCode, sequenceNumber, date }) {
  const yyyymm = currentYearMonth(date);
  const seq = String(sequenceNumber).padStart(6, '0');
  return `${tenantCode}-${departmentCode}-${yyyymm}-${seq}`;
}

module.exports = { buildTrackingId, currentYearMonth };
