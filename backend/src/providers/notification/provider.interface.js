'use strict';

// Common shape every channel adapter implements (ARCHITECTURE.md §10.2
// "INotificationProvider"), so the Notification Service's dispatch worker
// never branches on a specific vendor — only on this interface.
//
// send({ recipient, subject, body, htmlBody, variables }) -> Promise<{ providerMessageId, accepted }>
//   - recipient: channel-appropriate address (mobile number, email address,
//     device token) — never logged/echoed in full by the caller.
//   - Throws on rejection; the caller (src/jobs/notificationDispatch.job.js)
//     interprets a throw as a failed attempt eligible for retry.
//
// testConnectivity() -> Promise<{ reachable, latencyMs }>
//   - A handshake/health probe only — never sends a message to an end
//     recipient (distinct from send(), per 08-Notification-APIs.md §8.12.3).
//
// This file documents the contract; JavaScript has no interface keyword, so
// each adapter in this directory implements the same two function names.
module.exports = {};
