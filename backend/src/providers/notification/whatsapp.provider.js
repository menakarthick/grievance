'use strict';

const crypto = require('crypto');

// Mock WhatsApp Business Platform adapter (ARCHITECTURE.md §10.2). See
// sms.provider.js for why this is a mock, not a real gateway integration,
// this phase.
async function send({ recipient }) {
  if (!recipient) throw new Error('WhatsApp provider: recipient mobile number is required.');
  return { providerMessageId: `mock-whatsapp-${crypto.randomUUID()}`, accepted: true };
}

async function testConnectivity() {
  return { reachable: true, latencyMs: 25 };
}

module.exports = { channel: 'whatsapp', send, testConnectivity };
