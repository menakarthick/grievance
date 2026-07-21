'use strict';

const { parseOffsetPagination, buildOffsetPaginationMeta } = require('../../src/utils/pagination');
const { parseSort, parseSearch } = require('../../src/utils/queryOptions');

describe('utils/pagination', () => {
  test('parseOffsetPagination applies defaults when no query params given', () => {
    const result = parseOffsetPagination({ query: {} }, { defaultSize: 20, maxSize: 100 });
    expect(result).toEqual({ page: 1, size: 20, limit: 20, offset: 0 });
  });

  test('parseOffsetPagination computes offset from page/size', () => {
    const result = parseOffsetPagination({ query: { page: '3', size: '10' } }, { maxSize: 100 });
    expect(result).toEqual({ page: 3, size: 10, limit: 10, offset: 20 });
  });

  test('parseOffsetPagination clamps size to maxSize', () => {
    const result = parseOffsetPagination({ query: { size: '9999' } }, { maxSize: 100 });
    expect(result.size).toBe(100);
  });

  test('parseOffsetPagination floors invalid page/size to 1', () => {
    const result = parseOffsetPagination({ query: { page: '-5', size: '0' } }, { maxSize: 100 });
    expect(result.page).toBe(1);
    expect(result.size).toBe(1);
  });

  test('buildOffsetPaginationMeta computes totalPages, including the zero-row case', () => {
    expect(buildOffsetPaginationMeta({ page: 1, size: 20, totalCount: 45 })).toEqual({
      page: 1,
      size: 20,
      totalCount: 45,
      totalPages: 3,
    });
    expect(buildOffsetPaginationMeta({ page: 1, size: 20, totalCount: 0 })).toEqual({
      page: 1,
      size: 20,
      totalCount: 0,
      totalPages: 0,
    });
  });
});

describe('utils/queryOptions', () => {
  test('parseSort returns the default order when no sort param given', () => {
    const defaultOrder = [['name', 'ASC']];
    expect(parseSort({ query: {} }, ['name', 'code'], defaultOrder)).toBe(defaultOrder);
  });

  test('parseSort parses ascending and descending fields', () => {
    const order = parseSort({ query: { sort: 'code,-name' } }, ['name', 'code'], []);
    expect(order).toEqual([
      ['code', 'ASC'],
      ['name', 'DESC'],
    ]);
  });

  test('parseSort rejects a field outside the allow-list', () => {
    try {
      parseSort({ query: { sort: 'password' } }, ['name', 'code'], []);
      throw new Error('expected parseSort to throw');
    } catch (err) {
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.details[0]).toMatchObject({ field: 'sort', issue: 'INVALID_SORT_FIELD' });
    }
  });

  test('parseSearch trims and ignores whitespace-only queries', () => {
    expect(parseSearch({ query: { q: '  Anna Nagar  ' } })).toBe('Anna Nagar');
    expect(parseSearch({ query: { q: '   ' } })).toBeNull();
    expect(parseSearch({ query: {} })).toBeNull();
  });
});
