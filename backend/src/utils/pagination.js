'use strict';

// Offset pagination — API_SPECIFICATION.md §1.8: "small, bounded admin/config
// collections: /departments, /roles, /wards, ..." use `?page=&size=`, never
// the keyset/cursor style reserved for high-volume transactional endpoints.

function parseIntOr(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function parseOffsetPagination(req, { defaultSize = 20, maxSize = 100 } = {}) {
  const page = Math.max(1, parseIntOr(req.query.page, 1));
  const size = Math.min(maxSize, Math.max(1, parseIntOr(req.query.size, defaultSize)));
  return { page, size, limit: size, offset: (page - 1) * size };
}

function buildOffsetPaginationMeta({ page, size, totalCount }) {
  return {
    page,
    size,
    totalCount,
    totalPages: totalCount === 0 ? 0 : Math.ceil(totalCount / size),
  };
}

module.exports = { parseOffsetPagination, buildOffsetPaginationMeta };
