'use strict';

const { validationResult } = require('express-validator');
const { ApiError } = require('../utils/apiError');

// Runs after a route's express-validator chain (validators/*) and turns any
// failures into the Section 12.4 validation-error shape. Per-field `issue`
// codes are supplied by the individual validator via .withMessage({...});
// this middleware falls back to a generic value when a validator only gave
// a plain string message.
function validate(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const details = result.array({ onlyFirstError: true }).map((err) => {
    const msg = err.msg;
    if (msg && typeof msg === 'object') {
      return { field: err.path, issue: msg.issue || 'INVALID_VALUE', message: msg.message };
    }
    return { field: err.path, issue: 'INVALID_VALUE', message: String(msg) };
  });

  return next(ApiError.validation('Request failed validation', details));
}

module.exports = { validate };
