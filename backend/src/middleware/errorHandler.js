'use strict';

const multer = require('multer');
const env = require('../config/env');
const logger = require('../config/logger');
const { ApiError, CATEGORIES } = require('../utils/apiError');
const { sendError } = require('../utils/apiResponse');

// Normalizes well-known non-ApiError failures (malformed JSON body, Multer
// upload errors) into ApiError before falling through to the generic
// unexpected-error branch. Keeps the branching in one place instead of
// scattering try/catch translation across every route.
function normalize(err) {
  if (err instanceof ApiError) return err;

  if (err.type === 'entity.parse.failed') {
    return ApiError.validation('Request body is not valid JSON.');
  }

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return new ApiError({
        statusCode: 413,
        category: CATEGORIES.VALIDATION,
        code: 'FILE_TOO_LARGE',
        message: 'Uploaded file exceeds the maximum allowed size.',
      });
    }
    return ApiError.validation(err.message);
  }

  return null;
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const apiError = normalize(err) || ApiError.internal();

  if (!(err instanceof ApiError) && !normalize(err)) {
    (req.log || logger).error('Unhandled error', { error: err.message, stack: err.stack });
  } else if (apiError.statusCode >= 500) {
    (req.log || logger).error(apiError.message, { code: apiError.code, stack: err.stack });
  } else {
    (req.log || logger).warn(apiError.message, { code: apiError.code, statusCode: apiError.statusCode });
  }

  sendError(res, {
    statusCode: apiError.statusCode,
    category: apiError.category,
    code: apiError.code,
    message: env.isProduction && apiError.statusCode >= 500 ? 'An unexpected error occurred.' : apiError.message,
    details: apiError.details,
  });
}

module.exports = { errorHandler };
