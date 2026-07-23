'use strict';

const { render, extractPlaceholders } = require('../../src/utils/templateEngine');

describe('templateEngine (docs/08-Notification-APIs.md §8.1.4/§8.7.7)', () => {
  test('substitutes every {{variable}} placeholder with the supplied value', () => {
    const { renderedText, missingVariables } = render('Complaint {{trackingId}} is now {{status}}.', {
      trackingId: 'TMBM-ENG-202607-000123',
      status: 'Resolved',
    });
    expect(renderedText).toBe('Complaint TMBM-ENG-202607-000123 is now Resolved.');
    expect(missingVariables).toEqual([]);
  });

  test('a missing variable renders as a flagged [[missing:name]] token rather than throwing', () => {
    const { renderedText, missingVariables } = render('Hello {{name}}, your code is {{otp}}.', { name: 'Asha' });
    expect(renderedText).toBe('Hello Asha, your code is [[missing:otp]].');
    expect(missingVariables).toEqual(['otp']);
  });

  test('extractPlaceholders returns the deduplicated set of declared variable names', () => {
    const names = extractPlaceholders('{{trackingId}} - {{trackingId}} - {{status}}');
    expect(names.sort()).toEqual(['status', 'trackingId']);
  });

  test('a template with no placeholders renders unchanged', () => {
    const { renderedText, missingVariables } = render('Static message, no variables here.', {});
    expect(renderedText).toBe('Static message, no variables here.');
    expect(missingVariables).toEqual([]);
  });
});
