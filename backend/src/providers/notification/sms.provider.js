'use strict';

const crypto = require('crypto');

// Mock SMS adapter (ARCHITECTURE.md §10.2) — implements the
// provider.interface.js contract. No real DLT-registered gateway is
// integrated this phase (explicit instruction: "Do NOT implement external
// SMS/Email/WhatsApp providers"); this stands in for one so the rest of the
// pipeline (queueing, retry, template rendering, preferences, audit) is
// fully exercised end-to-end.
async function send({ recipient }) {
  if (!recipient) throw new Error('SMS provider: recipient mobile number is required.');
  return { providerMessageId: `mock-sms-${crypto.randomUUID()}`, accepted: true };
}

async function testConnectivity() {
  return { reachable: true, latencyMs: 12 };
}

module.exports = { channel: 'sms', send, testConnectivity };
