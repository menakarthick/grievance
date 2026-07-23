'use strict';

const { encodeCursor, decodeCursor, buildPaginationMeta } = require('../../src/utils/cursorPagination');

describe('utils/cursorPagination', () => {
  test('encodeCursor/decodeCursor round-trip an id', () => {
    expect(decodeCursor(encodeCursor(42))).toBe('42');
  });

  test('decodeCursor returns null for an absent cursor', () => {
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor(null)).toBeNull();
  });

  test('decodeCursor rejects a malformed cursor', () => {
    expect(() => decodeCursor('not-base64-digits')).toThrow();
  });

  test('buildPaginationMeta reports hasMore and trims to limit when there is an extra row', () => {
    const rows = [{ id: 5 }, { id: 4 }, { id: 3 }];
    const { page, meta } = buildPaginationMeta(rows, 2);
    expect(page).toHaveLength(2);
    expect(meta.hasMore).toBe(true);
    expect(meta.nextCursor).toBe(encodeCursor(4));
  });

  test('buildPaginationMeta reports hasMore=false with no nextCursor on the last page', () => {
    const rows = [{ id: 2 }, { id: 1 }];
    const { page, meta } = buildPaginationMeta(rows, 2);
    expect(page).toHaveLength(2);
    expect(meta.hasMore).toBe(false);
    expect(meta.nextCursor).toBeNull();
  });
});
