'use strict';

const { priorityToInt, intToPriority } = require('../../src/dtos/admin.dto');

describe('dtos/admin.dto priority mapping', () => {
  test('priorityToInt maps the four documented string values', () => {
    expect(priorityToInt('critical')).toBe(1);
    expect(priorityToInt('high')).toBe(2);
    expect(priorityToInt('medium')).toBe(3);
    expect(priorityToInt('low')).toBe(4);
  });

  test('intToPriority is the exact inverse of priorityToInt', () => {
    for (const label of ['critical', 'high', 'medium', 'low']) {
      expect(intToPriority(priorityToInt(label))).toBe(label);
    }
  });

  test('intToPriority falls back to medium for an unrecognized integer', () => {
    expect(intToPriority(99)).toBe('medium');
  });
});
