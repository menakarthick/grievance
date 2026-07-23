'use strict';

const { Worker, Queue } = require('bullmq');
const { bullConnection } = require('../queues/connection');
const logger = require('../config/logger');

const EVENT_CONSUMER_QUEUE = 'notification-event-consumer';
const POLL_INTERVAL_MS = 5000;

// Fans out unconsumed notification_event rows (published by Complaint's
// src/repositories/complaint.repository.js#publishEvent, among any future
// publisher) into notification_dispatch rows — "Consume the domain events
// already published by the Complaint module... Create notification jobs
// from these events." A repeatable BullMQ job is the polling mechanism
// (ARCHITECTURE.md §17 Scheduler Architecture's pattern, applied here to a
// short interval rather than a daily/weekly cron); the actual fan-out logic
// lives in src/services/notification.service.js#consumeDomainEvents, which
// is idempotent and independently callable (tests call it directly rather
// than waiting on this interval).
function startEventConsumerJob() {
  const queue = new Queue(EVENT_CONSUMER_QUEUE, { connection: bullConnection });
  queue
    .add('poll', {}, { repeat: { every: POLL_INTERVAL_MS }, jobId: 'poll-unconsumed-events' })
    .catch((err) => logger.warn('Failed to schedule notification event-consumer repeat job', { error: err.message }));

  const worker = new Worker(
    EVENT_CONSUMER_QUEUE,
    async () => {
      const notificationService = require('../services/notification.service');
      const result = await notificationService.consumeDomainEvents();
      if (result.dispatchesCreated > 0) {
        logger.info('Notification event consumer fanned out domain events', result);
      }
    },
    { connection: bullConnection },
  );
  worker.on('failed', (job, err) => logger.error('notification-event-consumer job failed', { error: err.message }));
  return { queue, worker };
}

module.exports = { startEventConsumerJob, EVENT_CONSUMER_QUEUE };
