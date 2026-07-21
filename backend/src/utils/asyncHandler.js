'use strict';

// Wraps an async Express handler so a rejected promise reaches the
// centralized error handler instead of becoming an unhandled rejection.
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
