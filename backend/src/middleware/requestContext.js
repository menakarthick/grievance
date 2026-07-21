'use strict';

const { randomUUID } = require('crypto');
const logger = require('../config/logger');

// Stamps X-Request-Id (always server-generated) and echoes/generates
// X-Correlation-Id, per docs/components/headers.yaml. Both are attached to
// res.locals for utils/apiResponse.js and to req.log for structured,
// correlation-aware logging through the rest of the request lifecycle.
function requestContext(req, res, next) {
  const requestId = `req_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const correlationId = req.get('X-Correlation-Id') || `corr_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

  res.locals.requestId = requestId;
  res.locals.correlationId = correlationId;
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Correlation-Id', correlationId);

  req.log = logger.child({ requestId, correlationId });
  next();
}

module.exports = { requestContext };
