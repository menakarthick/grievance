'use strict';

const { Worker } = require('bullmq');
const { bullConnection } = require('../queues/connection');
const { QUEUE_NAMES } = require('../queues');
const logger = require('../config/logger');
const { getChannelProvider } = require('../providers/notification');

// Processes src/queues/index.js's NOTIFICATION_DISPATCH queue: loads the
// notification_dispatch row, renders its template, calls the channel's
// provider adapter (mock this phase — src/providers/notification), and
// updates the row's durable status (§8.1.5's "MySQL is the durable,
// auditable mirror"). Retry/backoff itself is BullMQ's own mechanism
// (src/queues/index.js's defaultJobOptions: attempts 3, exponential
// 5000ms) — this worker only needs to throw on failure to trigger it, and
// flip the row to 'dead_letter' once BullMQ's attempts are exhausted.
function buildNotificationDispatchWorker() {
  return new Worker(
    QUEUE_NAMES.NOTIFICATION_DISPATCH,
    async (job) => {
      // Required lazily — src/services/notification.service.js and this
      // file would otherwise require each other at module-load time
      // (service enqueues jobs; worker processes them).
      const repo = require('../repositories/notification.repository');
      const notificationService = require('../services/notification.service');

      const { dispatchId } = job.data;
      const dispatch = await repo.findDispatchById(dispatchId);
      if (!dispatch) return; // already deleted/unreachable — nothing to do
      if (dispatch.status === 'cancelled') return; // cancelled before this attempt ran

      const provider = getChannelProvider(dispatch.channel);
      if (!provider) throw new Error(`No provider registered for channel "${dispatch.channel}".`);

      const event = await repo.findEventById(dispatch.notificationEventId);
      const rendered = dispatch.templateConfig
        ? notificationService.renderForDispatch(dispatch.templateConfig, event?.payloadSummary?.variables || {})
        : { body: '' };

      const recipient = await repo.findUserById(dispatch.recipientUserId);
      const recipientAddress =
        dispatch.channel === 'email' ? recipient?.email : recipient?.mobileNumber;

      const result = await provider.send({ recipient: recipientAddress, subject: rendered.subject, body: rendered.body });

      await repo.updateDispatch(dispatch, {
        status: 'sent',
        providerMessageId: result.providerMessageId,
        sentAt: new Date(),
        // The mock adapter never fails, so 'delivered' is set immediately
        // rather than waiting on a separate provider delivery-receipt
        // webhook (out of scope — no real gateway is integrated this
        // phase, see src/providers/notification/*.provider.js).
        deliveredAt: dispatch.channel === 'in_app' ? null : new Date(),
      });
    },
    { connection: bullConnection, concurrency: 5 },
  );
}

let worker;

function startNotificationDispatchWorker() {
  if (worker) return worker;
  worker = buildNotificationDispatchWorker();
  worker.on('failed', async (job, err) => {
    logger.error('notification-dispatch job failed', { jobId: job?.id, error: err.message, attemptsMade: job?.attemptsMade });
    if (!job || job.attemptsMade < job.opts.attempts) return; // BullMQ will retry again itself
    try {
      const repo = require('../repositories/notification.repository');
      const dispatch = await repo.findDispatchById(job.data.dispatchId);
      if (dispatch && dispatch.status !== 'cancelled') {
        await repo.updateDispatch(dispatch, { status: 'dead_letter' });
      }
    } catch (updateErr) {
      logger.error('Failed to mark notification_dispatch as dead_letter', { error: updateErr.message });
    }
  });
  return worker;
}

module.exports = { startNotificationDispatchWorker };
