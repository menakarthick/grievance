'use strict';

const { ApiError } = require('../utils/apiError');

function notFound(req, res, next) {
  next(ApiError.notFound('ROUTE_NOT_FOUND', `No route matches ${req.method} ${req.originalUrl}`));
}

module.exports = { notFound };
