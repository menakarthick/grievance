'use strict';

const { Queue } = require('bullmq');
const { bullConnection } = require('./connection');

// One queue per async workload identified in the API contract:
// notification dispatch (08-Notification-APIs.md), AI classification
// (Section 5), report/audit export (09/10), file virus scanning
// (11-File-Management-APIs.md). Workers/processors are added under
// src/jobs/ in the implementation phase — this registry only declares the
// queues so producers have somewhere to enqueue to.
const QUEUE_NAMES = Object.freeze({
  NOTIFICATION_DISPATCH: 'notification-dispatch',
  AI_CLASSIFICATION: 'ai-classification',
  REPORT_EXPORT: 'report-export',
  AUDIT_EXPORT: 'audit-export',
  FILE_SCAN: 'file-scan',
});

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

const queues = Object.fromEntries(
  Object.values(QUEUE_NAMES).map((name) => [name, new Queue(name, { connection: bullConnection, defaultJobOptions })]),
);

module.exports = { QUEUE_NAMES, queues };
