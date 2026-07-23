'use strict';

// In-App has no external provider (08-Notification-APIs.md §8.1.2, §8.6) —
// the notification_dispatch row itself, surfaced via the portal's own
// notification inbox, is the delivery. send() is a no-op success so the
// generic dispatch pipeline (src/jobs/notificationDispatch.job.js) can
// still treat every channel uniformly.
async function send() {
  return { providerMessageId: null, accepted: true };
}

async function testConnectivity() {
  return { reachable: true, latencyMs: 0 };
}

module.exports = { channel: 'in_app', send, testConnectivity };
