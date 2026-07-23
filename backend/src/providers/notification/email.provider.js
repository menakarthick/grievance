'use strict';

const crypto = require('crypto');

// Mock SMTP adapter (ARCHITECTURE.md §10.2). See sms.provider.js for why
// this is a mock, not a real gateway integration, this phase.
async function send({ recipient }) {
  if (!recipient) throw new Error('Email provider: recipient address is required.');
  return { providerMessageId: `mock-email-${crypto.randomUUID()}`, accepted: true };
}

async function testConnectivity() {
  return { reachable: true, latencyMs: 18 };
}

module.exports = { channel: 'email', send, testConnectivity };
