'use strict';

// BullMQ Worker definitions. Started from worker.js (a separate PM2 process
// group, per ecosystem.config.js — HTTP and worker concerns stay
// independently scalable/restartable), never from server.js itself.
const { startNotificationDispatchWorker } = require('./notificationDispatch.job');
const { startEventConsumerJob } = require('./eventConsumer.job');

function startAllWorkers() {
  const notificationDispatchWorker = startNotificationDispatchWorker();
  const eventConsumer = startEventConsumerJob();
  return { notificationDispatchWorker, eventConsumer };
}

module.exports = { startAllWorkers };
