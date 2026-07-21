'use strict';

const { ApiError } = require('./apiError');

// API_SPECIFICATION.md §1.9 Sorting: `?sort=field1,-field2`, leading `-` =
// descending, ascending by default. An unrecognized sort field is a
// validation error, never a silent ignore.
function parseSort(req, allowedFields, defaultOrder) {
  const raw = req.query.sort;
  if (!raw) return defaultOrder;

  const order = [];
  for (const token of String(raw).split(',')) {
    const trimmed = token.trim();
    if (!trimmed) continue;
    const descending = trimmed.startsWith('-');
    const field = descending ? trimmed.slice(1) : trimmed;
    if (!allowedFields.includes(field)) {
      throw ApiError.validation('Request failed validation', [
        { field: 'sort', issue: 'INVALID_SORT_FIELD', message: `Cannot sort by "${field}".` },
      ]);
    }
    order.push([field, descending ? 'DESC' : 'ASC']);
  }
  return order.length > 0 ? order : defaultOrder;
}

// API_SPECIFICATION.md §1.11 Searching: `?q=<free text>`, always narrows an
// already tenant/filter-scoped result set.
function parseSearch(req) {
  const q = req.query.q;
  return typeof q === 'string' && q.trim() ? q.trim() : null;
}

module.exports = { parseSort, parseSearch };
