'use strict';

const dto = require('../../src/dtos/complaint.dto');

describe('dtos/complaint.dto', () => {
  test('shapeComplaintListItem maps priority integer to string and prefers the denormalized department name', () => {
    const shaped = dto.shapeComplaintListItem({
      id: 7,
      trackingId: 'AB-CD-202607-000001',
      status: { label: 'Registered' },
      priority: 2,
      currentDepartmentName: 'Engineering',
      department: { name: 'Should not be used' },
      slaDueAt: null,
      createdAt: '2026-07-21T00:00:00.000Z',
    });
    expect(shaped).toEqual({
      id: '7',
      trackingId: 'AB-CD-202607-000001',
      statusLabel: 'Registered',
      priority: 'high',
      departmentName: 'Engineering',
      slaDueAt: null,
      createdAt: '2026-07-21T00:00:00.000Z',
    });
  });

  test('shapeComplaintDetail includes attachments and falls back to slaTracking.dueAt for slaDueAt', () => {
    const shaped = dto.shapeComplaintDetail(
      {
        id: 9,
        trackingId: 'AB-CD-202607-000002',
        description: 'A pothole',
        category: { name: 'Roads' },
        status: { label: 'Assigned' },
        priority: 1,
        severity: 'high',
        locationLatitude: '12.9000000',
        locationLongitude: '80.1000000',
        locationAddress: 'Main Road',
        currentOfficerId: 5,
        currentOfficerName: 'officer_5',
        slaTracking: { dueAt: '2026-08-01T00:00:00.000Z' },
        slaDueAt: null,
        createdAt: '2026-07-21T00:00:00.000Z',
        resolvedAt: null,
        closedAt: null,
      },
      { attachments: [{ id: 3, assetCategory: 'image' }] },
    );
    expect(shaped.location).toEqual({ latitude: 12.9, longitude: 80.1, addressText: 'Main Road' });
    expect(shaped.currentOfficer).toEqual({ id: '5', name: 'officer_5' });
    expect(shaped.slaDueAt).toBe('2026-08-01T00:00:00.000Z');
    expect(shaped.attachments).toEqual([{ fileAssetId: '3', assetCategory: 'image' }]);
  });

  test('shapeComplaintDetail reports a null currentOfficer when unassigned', () => {
    const shaped = dto.shapeComplaintDetail({
      id: 1,
      trackingId: 'AB-CD-202607-000003',
      category: null,
      status: { label: 'Registered' },
      priority: 3,
      severity: null,
      locationLatitude: null,
      locationLongitude: null,
      locationAddress: null,
      currentOfficerId: null,
      currentOfficerName: null,
      createdAt: '2026-07-21T00:00:00.000Z',
      resolvedAt: null,
      closedAt: null,
    });
    expect(shaped.currentOfficer).toBeNull();
  });

  test('shapeTimelineEntry reports a null changedBy for system-driven transitions', () => {
    const shaped = dto.shapeTimelineEntry({
      fromStatus: null,
      toStatus: { label: 'Registered' },
      changedBy: null,
      changedByUser: null,
      note: 'Complaint registered.',
      createdAt: '2026-07-21T00:00:00.000Z',
    });
    expect(shaped.changedBy).toBeNull();
    expect(shaped.fromStatusLabel).toBeNull();
  });

  test('shapeTimelineEntry falls back to username when a display name is unavailable', () => {
    const shaped = dto.shapeTimelineEntry({
      fromStatus: { label: 'Registered' },
      toStatus: { label: 'Assigned' },
      changedBy: 11,
      changedByUser: { username: 'officer_11' },
      note: 'Assigned to officer 11.',
      createdAt: '2026-07-21T00:00:00.000Z',
    });
    expect(shaped.changedBy).toEqual({ id: '11', name: 'officer_11' });
  });

  test('shapeAttachment reports fileAssetId, assetCategory, and virusScanStatus', () => {
    expect(
      dto.shapeAttachment({ id: 4, assetCategory: 'image', virusScanStatus: 'pending', createdAt: '2026-07-21T00:00:00.000Z' }),
    ).toEqual({ fileAssetId: '4', assetCategory: 'image', virusScanStatus: 'pending', uploadedAt: '2026-07-21T00:00:00.000Z' });
  });
});
