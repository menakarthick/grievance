'use strict';

const { buildTrackingId, currentYearMonth } = require('../../src/utils/trackingId');

describe('utils/trackingId', () => {
  test('currentYearMonth formats as YYYYMM using UTC', () => {
    expect(currentYearMonth(new Date(Date.UTC(2026, 6, 21)))).toBe('202607');
    expect(currentYearMonth(new Date(Date.UTC(2026, 0, 5)))).toBe('202601');
  });

  test('buildTrackingId matches docs/complaint.yaml\'s pattern', () => {
    const trackingId = buildTrackingId({
      tenantCode: 'TAMBARAM',
      departmentCode: 'ENG',
      sequenceNumber: 123,
      date: new Date(Date.UTC(2026, 6, 1)),
    });
    expect(trackingId).toBe('TAMBARAM-ENG-202607-000123');
    expect(trackingId).toMatch(/^[A-Z]{2,10}-[A-Z]{2,10}-\d{6}-\d{6}$/);
  });

  test('sequence number is zero-padded to 6 digits', () => {
    const trackingId = buildTrackingId({
      tenantCode: 'AB',
      departmentCode: 'CD',
      sequenceNumber: 7,
      date: new Date(Date.UTC(2026, 0, 1)),
    });
    expect(trackingId).toBe('AB-CD-202601-000007');
  });
});
