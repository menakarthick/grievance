'use strict';

// Builds the two envelopes fixed by docs/12-Standard-Response-Formats.md
// §12.1 (success) and §12.2 (error). Every response, from every route,
// flows through one of these two so the shape stays consistent regardless
// of which controller produced it.

function buildMeta(res, extra = {}) {
  return {
    requestId: res.locals.requestId,
    ...(res.locals.correlationId ? { correlationId: res.locals.correlationId } : {}),
    timestamp: new Date().toISOString(),
    ...extra,
  };
}

function sendSuccess(res, { statusCode = 200, data, pagination, meta } = {}) {
  return res.status(statusCode).json({
    success: true,
    data,
    meta: buildMeta(res, { ...(pagination ? { pagination } : {}), ...meta }),
  });
}

function sendError(res, { statusCode = 500, category, code, message, details }) {
  return res.status(statusCode).json({
    success: false,
    error: {
      category,
      code,
      message,
      ...(details ? { details } : {}),
    },
    meta: buildMeta(res),
  });
}

module.exports = { sendSuccess, sendError, buildMeta };
