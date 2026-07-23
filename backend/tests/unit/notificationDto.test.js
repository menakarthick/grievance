'use strict';

const dto = require('../../src/dtos/notification.dto');

describe('notification.dto (encode/decode conventions over the approved v1.0 schema)', () => {
  test('encodeBodyTemplate/decodeBodyTemplate round-trip a subject packed into bodyTemplate', () => {
    const stored = dto.encodeBodyTemplate('Your OTP is {{otp}}.', 'Your OTP code');
    const { subjectTemplate, bodyTemplate } = dto.decodeBodyTemplate(stored);
    expect(subjectTemplate).toBe('Your OTP code');
    expect(bodyTemplate).toBe('Your OTP is {{otp}}.');
  });

  test('decodeBodyTemplate on a plain (no-subject) template returns a null subject', () => {
    const { subjectTemplate, bodyTemplate } = dto.decodeBodyTemplate('Just a body, no subject marker.');
    expect(subjectTemplate).toBeNull();
    expect(bodyTemplate).toBe('Just a body, no subject marker.');
  });

  test('shapeTemplateSummary always reports approved (no approvalStatus column exists this phase)', () => {
    const summary = dto.shapeTemplateSummary({
      id: 1,
      eventType: 'ComplaintCreated',
      channel: 'sms',
      language: 'en',
      version: 1,
      deletedAt: null,
      createdAt: new Date(),
    });
    expect(summary.approvalStatus).toBe('approved');
    expect(summary.isActive).toBe(true);
  });

  test('shapePreferenceProfile reports channel rows plus documented static gaps (quietHours null, version 1)', () => {
    const profile = dto.shapePreferenceProfile([{ channel: 'sms', isEnabled: true }], { languageCode: 'ta' });
    expect(profile.channels).toEqual([{ channel: 'sms', isEnabled: true }]);
    expect(profile.quietHours).toBeNull();
    expect(profile.categoryOptOuts).toEqual([]);
    expect(profile.languageCode).toBe('ta');
    expect(profile.version).toBe(1);
  });

  test('shapeRetryHistory returns an empty list for a never-retried dispatch', () => {
    expect(dto.shapeRetryHistory({ retryCount: 0, status: 'sent', updatedAt: new Date() })).toEqual([]);
  });

  test('shapeRetryHistory synthesizes a single entry from the current retryCount/status', () => {
    const entries = dto.shapeRetryHistory({ retryCount: 2, status: 'dead_letter', updatedAt: new Date() });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ attemptNumber: 2, outcome: 'dead_letter' });
    expect(entries[0].failureReason).toBeTruthy();
  });
});
