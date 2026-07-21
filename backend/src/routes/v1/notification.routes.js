'use strict';

const { Router } = require('express');

// Notification module routes (docs/notification.yaml).
// Mounted at /notifications under the versioned API prefix by routes/v1/index.js.
// Intentionally empty — endpoints are wired up, one per operation, in the
// implementation phase, following docs/ROUTE-REGISTRATION-ORDER.md for any
// route registered within this module's own prefix.
const router = Router();

module.exports = router;
