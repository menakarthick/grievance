'use strict';

const { ApiError } = require('./apiError');

// API_SPECIFICATION.md §1.8: keyset/cursor pagination for high-volume,
// time-ordered collections (`/complaints` among them) — "the cursor
// encodes the last-seen (createdAt, id) pair; avoids the OFFSET
// performance cliff on the month-partitioned tables". The cursor itself is
// an opaque, base64-encoded {id} token (ordering is always by `id DESC`,
// which is monotonic with `createdAt` for an auto-increment PK, so a
// single-column cursor is sufficient and simpler than encoding both).

function encodeCursor(id) {
  return Buffer.from(String(id), 'utf8').toString('base64url');
}

function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const id = Buffer.from(cursor, 'base64url').toString('utf8');
    if (!/^\d+$/.test(id)) throw new Error('not numeric');
    return id;
  } catch {
    throw ApiError.validation('Request failed validation', [
      { field: 'cursor', issue: 'INVALID_CURSOR', message: 'cursor is malformed.' },
    ]);
  }
}

function buildPaginationMeta(rows, limit, idField = 'id') {
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? encodeCursor(page[page.length - 1][idField]) : null;
  return { page, meta: { nextCursor, hasMore } };
}

module.exports = { encodeCursor, decodeCursor, buildPaginationMeta };
