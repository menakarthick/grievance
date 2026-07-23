'use strict';

const crypto = require('crypto');

// Mock FCM/OneSignal adapter (ARCHITECTURE.md §10.2), covering
// push_mobile/push_web/push_browser as one abstracted pipeline
// (08-Notification-APIs.md §8.5, §8.1.2). See sms.provider.js for why this
// is a mock, not a real gateway integration, this phase.
async function send({ recipient }) {
  if (!recipient) throw new Error('Push provider: recipient device token is required.');
  return { providerMessageId: `mock-push-${crypto.randomUUID()}`, accepted: true };
}

async function testConnectivity() {
  return { reachable: true, latencyMs: 9 };
}

module.exports = { channel: 'push', send, testConnectivity };
